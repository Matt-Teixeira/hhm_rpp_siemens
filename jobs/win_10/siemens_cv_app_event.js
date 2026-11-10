const fsp = require("node:fs").promises;
const { DateTime } = require("luxon");
const db = require("../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const parse_app_event_log = require("../../processing/siemens_cv/parse_app_event_log");
const generateDateTime = require("../../processing/generateDateTimes");
const mapDataToSchema = require("../../persist/map-data-to-schema");
const { siemens_cv_schema } = require("../../persist/pg-schemas");
const { build_upsert_str } = require("../../tooling");

const { pg_column_sets: pg_cs } = require("../../utils/db/sql/pg-helpers_hhm");

/*
NOTE ON XA<serial>_<yyyy_mm_dd>_AppEventLog.txt (Siemens Artis CV/IR)
Acquisition drops the extracted daily AppEventLog files into debian_server_path.
A day's file keeps growing until that day ends, so only files dated before
today (system time zone) are parsed. Each completed day is parsed once; the
last parsed file name is cached in Redis under <sme>.last_siemens_cv_app_event.
Normally that means yesterday's file; missed days are picked up in date order.
Rows go to log.siemens_cv using the same columns as the Evtlog parser.
*/

const REDIS_KEY = "last_siemens_cv_app_event";
const app_event_file_re = /_(?<date>\d{4}_\d{2}_\d{2})_AppEventLog\.txt$/;

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
    await System.get_last_file_parsed(REDIS_KEY);

    const last_match = System.last_file_parsed
      ? System.last_file_parsed.match(app_event_file_re)
      : null;
    const last_date = last_match ? last_match.groups.date : null;
    const today = DateTime.now().setZone(time_zone_id).toFormat("yyyy_MM_dd");

    const files_to_parse = (System.files_in_dir || [])
      .map((file) => ({ file, match: file.match(app_event_file_re) }))
      .filter(({ match }) => match)
      .map(({ file, match }) => ({ file, date: match.groups.date }))
      .filter(({ date }) => date < today && (!last_date || date > last_date))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    if (files_to_parse.length === 0) {
      note.message = "No completed AppEventLog files to parse";
      note.last_file_parsed = System.last_file_parsed;
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

    for (const { file } of files_to_parse) {
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
        // Completed day with no events: mark parsed so it is not re-read.
        await System.cache_last_file_name(file, REDIS_KEY);
        continue;
      }

      let null_datetimes = 0;
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
        if (!row.host_datetime) null_datetimes++;

        row.capture_datetime = capture_datetime;
      }

      if (null_datetimes > 0) {
        await System.addLogEvent(
          System.W,
          System.run_log,
          "siemens_cv_app_event_parser",
          System.det,
          { ...file_note, message: "datetime object null", null_datetimes },
          null
        );
      }

      const mappedData = mapDataToSchema(rows, siemens_cv_schema);

      // ** End Parse

      // ** Begin Persist

      const query = pgp.helpers.insert(
        mappedData,
        pg_cs.log.siemens.siemens_cv
      );

      await db.any(query);

      // Update alert.offline_hhm_conn with the most recent host_datetime
      const recent_host_datetime = latest_host_datetime(mappedData);
      if (recent_host_datetime) {
        await db.any(build_upsert_str(System.sme, recent_host_datetime));
      }

      // ** End Persist

      file_note.number_of_rows = mappedData.length;
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

      // Cache only after a successful insert so a failed day is retried.
      await System.cache_last_file_name(file, REDIS_KEY);
    }
  } catch (error) {
    // Stop at the first failure: later days are not cached past a failed one,
    // so the next run resumes from the failed file.
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
