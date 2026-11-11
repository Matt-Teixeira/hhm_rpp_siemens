const fsp = require("node:fs").promises;
const { DateTime } = require("luxon");
const db = require("../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const parse_app_event_log = require("../../processing/siemens_cv/parse_app_event_log");
const generateDateTime = require("../../processing/generateDateTimes");
const mapDataToSchema = require("../../persist/map-data-to-schema");
const { siemens_cv_schema } = require("../../persist/pg-schemas");
const {
  get_redis_set_members,
  add_redis_set_member
} = require("../../redis/redisHelpers");

const { pg_column_sets: pg_cs } = require("../../utils/db/sql/pg-helpers_hhm");

/*
NOTE ON XA<serial>_<yyyy_mm_dd>_AppEventLog.txt (Siemens Artis CV/IR)
Acquisition (hhm_data_acquisition siemens_cv_logfiles_zip.sh) extracts these
flat into debian_server_path. It only ever publishes COMPLETE days, each file
once, via atomic rename, and never changes a published file. Files can arrive
late or out of date order, and a day can be missing entirely (not an error).
Everything else in the directory (LogFiles_zips/ etc.) is ignored.

Tracking: the names of parsed files are kept in the Redis set
<sme>.parsed_siemens_cv_app_event. Every matching file not in the set is
parsed, oldest date first. A file is added to the set only after its DB
transaction commits, so a failed file is retried on the next run.

Re-parse safety: log.siemens_cv has no natural unique key (and identical
events legitimately repeat within a file), so each file is written in one
transaction that first deletes this system's rows for that file's day
(00:00 to 00:00 next day, site time zone), then inserts. Parsing a file
twice (e.g. after Redis loss) replaces that day instead of duplicating it.
*/

const PARSED_SET = "parsed_siemens_cv_app_event";
const app_event_file_re = /^[^.].*_(?<date>\d{4}_\d{2}_\d{2})_AppEventLog\.txt$/;

const delete_day_sql = `
DELETE FROM log.siemens_cv
WHERE system_id = $1
  AND host_datetime >= $2
  AND host_datetime < $3`;

// Never move rpp_host_datetime backwards: an older day can arrive after a newer one.
const upsert_rpp_host_datetime_sql = `
INSERT INTO alert.offline_hhm_conn (system_id, rpp_host_datetime)
VALUES ($1, $2)
ON CONFLICT (system_id) DO UPDATE
SET rpp_host_datetime = GREATEST(
  alert.offline_hhm_conn.rpp_host_datetime,
  EXCLUDED.rpp_host_datetime
)`;

// Pure: which directory entries still need parsing, oldest date first.
function select_files_to_parse(files_in_dir, parsed_files) {
  const parsed = new Set(parsed_files || []);
  return (files_in_dir || [])
    .map((file) => ({ file, match: file.match(app_event_file_re) }))
    .filter(({ match }) => match)
    .map(({ file, match }) => ({ file, date: match.groups.date }))
    .filter(({ file }) => !parsed.has(file))
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.file < b.file ? -1 : 1
    );
}

const siemens_cv_app_event_parser = async (System, capture_datetime) => {
  const time_zone_id = System.sysConfigData.time_zone_id || "America/New_York";

  let note = {
    job_id: System.job_id,
    sme: System.sme,
    file: System.file_config
  };

  try {
    await System.addLogEvent(
      System.I,
      System.run_log,
      "siemens_cv_app_event_parser",
      System.cal,
      note,
      null
    );

    await System.get_directory_files();

    // Throws on Redis failure, so a failed read aborts the run instead of
    // looking like "nothing parsed yet".
    const parsed_files = await get_redis_set_members(
      System.sme,
      PARSED_SET,
      System.run_log
    );

    const files_to_parse = select_files_to_parse(
      System.files_in_dir,
      parsed_files
    );

    if (files_to_parse.length === 0) {
      note.message = "No new AppEventLog files to parse";
      note.parsed_file_count = parsed_files.length;
      await System.addLogEvent(
        System.W,
        System.run_log,
        "siemens_cv_app_event_parser",
        System.det,
        note,
        null
      );
      return;
    }

    // Each file stands alone: a failure is logged, the file stays out of the
    // parsed set (retried next run), and the remaining files still run.
    for (const { file, date } of files_to_parse) {
      try {
        await parse_and_insert_file(
          System,
          file,
          date,
          capture_datetime,
          time_zone_id
        );
      } catch (error) {
        console.log(error);
        await System.addLogEvent(
          System.E,
          System.run_log,
          "siemens_cv_app_event_parser",
          System.cat,
          { job_id: System.job_id, sme: System.sme, file },
          error
        );
      }
    }
  } catch (error) {
    console.log(error);
    await System.addLogEvent(
      System.E,
      System.run_log,
      "siemens_cv_app_event_parser",
      System.cat,
      note,
      error
    );
  }
};

async function parse_and_insert_file(
  System,
  file,
  date,
  capture_datetime,
  time_zone_id
) {
  const complete_file_path = `${System.directory_path}/${file}`;
  let file_note = {
    job_id: System.job_id,
    sme: System.sme,
    file
  };

  const fileData = (await fsp.readFile(complete_file_path)).toString();

  // ** Begin Parse

  const { rows, unmatched } = parse_app_event_log(fileData);

  if (unmatched.length > 0) {
    await System.addLogEvent(
      System.W,
      System.run_log,
      "siemens_cv_app_event_parser",
      System.det,
      {
        ...file_note,
        message: "Event lines did not match cv_app_event_line",
        unmatched_count: unmatched.length,
        unmatched_sample: unmatched.slice(0, 5)
      },
      null
    );
  }

  if (rows.length === 0) {
    await System.addLogEvent(
      System.W,
      System.run_log,
      "siemens_cv_app_event_parser",
      System.det,
      { ...file_note, message: "No events in file" },
      null
    );
    // Complete day with no events: mark parsed so it is not re-read.
    await add_redis_set_member(System.sme, PARSED_SET, file, System.run_log);
    return;
  }

  for (const row of rows) {
    row.system_id = System.sme;

    const mm = DateTime.fromFormat(row.month || "", "LLLL", {
      locale: "en-US"
    }).toFormat("MM");

    row.host_datetime = await generateDateTime(
      System.job_id,
      System.sme,
      System.file_config.pg_tables[0],
      `${row.day}-${mm}-${row.year}`,
      row.time,
      time_zone_id
    );

    row.capture_datetime = capture_datetime;
  }

  // The file's day, in the site time zone. Every row must fall inside it:
  // the delete below only covers this window, so a row outside it (or with
  // no datetime) would duplicate on re-parse. Refuse the file instead.
  const day_start = DateTime.fromFormat(date, "yyyy_MM_dd", {
    zone: time_zone_id
  }).startOf("day");
  const day_end = day_start.plus({ days: 1 });

  const out_of_day = rows.filter((row) => {
    if (!row.host_datetime) return true;
    const dt = DateTime.fromISO(row.host_datetime);
    return dt < day_start || dt >= day_end;
  });
  if (out_of_day.length > 0) {
    const error = new Error(
      `${out_of_day.length} row(s) missing host_datetime or outside ${date}; file not inserted`
    );
    error.sample = out_of_day.slice(0, 5).map((row) => ({
      day: row.day,
      month: row.month,
      year: row.year,
      time: row.time,
      host_datetime: row.host_datetime
    }));
    throw error;
  }

  const mappedData = mapDataToSchema(rows, siemens_cv_schema);
  const recent_host_datetime = latest_host_datetime(mappedData);

  // ** End Parse

  // ** Begin Persist (one transaction: replace this system's day, then upsert)

  const insert_query = pgp.helpers.insert(
    mappedData,
    pg_cs.log.siemens.siemens_cv
  );

  const deleted_rows = await db.tx(async (t) => {
    const deleted = await t.result(delete_day_sql, [
      System.sme,
      day_start.toISO(),
      day_end.toISO()
    ]);
    await t.none(insert_query);
    await t.none(upsert_rpp_host_datetime_sql, [
      System.sme,
      recent_host_datetime
    ]);
    return deleted.rowCount;
  });

  // ** End Persist

  // Mark parsed only after the transaction has committed.
  await add_redis_set_member(System.sme, PARSED_SET, file, System.run_log);

  if (deleted_rows > 0) {
    await System.addLogEvent(
      System.W,
      System.run_log,
      "siemens_cv_app_event_parser",
      System.det,
      {
        ...file_note,
        message: "Re-parse: replaced existing rows for this day",
        deleted_rows
      },
      null
    );
  }

  file_note.number_of_rows = mappedData.length;
  file_note.deleted_rows = deleted_rows;
  file_note.first_row = mappedData[0];
  file_note.last_row = mappedData[mappedData.length - 1];
  file_note.message = "Successful Insert";

  await System.addLogEvent(
    System.I,
    System.run_log,
    "siemens_cv_app_event_parser",
    System.det,
    file_note,
    null
  );
}

const latest_host_datetime = (rows) => {
  let latest = null;
  for (const row of rows) {
    if (!row.host_datetime) continue;
    if (latest === null || new Date(row.host_datetime) > new Date(latest)) {
      latest = row.host_datetime;
    }
  }
  return latest;
};

module.exports = siemens_cv_app_event_parser;
module.exports.select_files_to_parse = select_files_to_parse;
