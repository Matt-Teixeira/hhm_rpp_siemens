const db = require("../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const [addLogEvent] = require("../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat }
} = require("../../utils/logger/enums");

const { pg_column_sets: pg_cs } = require("../../utils/db/sql/pg-helpers_hhm");

async function extract(job_id, extraction_data, run_log) {
  const data = [];
  const tube_data_re =
    /scan\sseconds.*=\s(?<scan_seconds>\d+)?.*tubeSerialNo:\s(?<tube_serial_no>\d+).*TubeType:\s(?<tube_type>\w+)/;
  const tube_data_re_2 =
    /TubeScanSeconds:\s(?<scan_seconds>\d+).+SystemScanSeconds:\s(?<system_scan_seconds>\d+)/;
  let note = {
    job_id
  };
  await addLogEvent(I, run_log, "extract", cal, note, null);
  try {
    for (const group of extraction_data) {
      const matches = group.text_group.match(tube_data_re);
      const matches_2 = group.text_group.match(tube_data_re_2);

      if (matches) {
        for (const property in matches.groups) {
          if (matches.groups[property]) {
            data.push({
              system_id: group.system_id,
              name: property,
              value: matches.groups[property],
              host_datetime: group.host_datetime
            });
          }
        }
      } else if (matches_2) {
        for (const property in matches_2.groups) {
          if (matches_2.groups[property]) {
            data.push({
              system_id: group.system_id,
              name: property,
              value: matches_2.groups[property],
              host_datetime: group.host_datetime
            });
          }
        }
      }
    }

    // ** Begin Persist

    const query = pgp.helpers.insert(
      data,
      pg_cs.meta_data.logfile_event_history_metadata
    );

    await db.any(query);

    // ** End Persist
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "extract", cat, note, error);
  }
}

module.exports = extract;
