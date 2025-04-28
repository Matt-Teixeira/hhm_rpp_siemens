const fsp = require("node:fs").promises;
const db = require("../../utils/db/pg-pool");
const pgp = require("pg-promise")();
const { siemens } = require("../../parse/parsers");
const generateDateTime = require("../../processing/generateDateTimes");
const mapDataToSchema = require("../../persist/map-data-to-schema");
const { siemens_cv_schema } = require("../../persist/pg-schemas");
const { build_upsert_str } = require("../../tooling");

const { pg_column_sets: pg_cs } = require("../../utils/db/sql/pg-helpers_hhm");

const siemens_cv_parser = async (System, capture_datetime) => {
  const parsers = System.file_config.parsers;
  const data = [];

  let note = {
    job_id: System.job_id,
    sme: System.sme,
    file: System.file_config
  };

  try {
    await System.get_directory_files();

    // No files in directory
    if (System.files_in_dir.length === 0) {
      note.message = "No files in directory";
      await System.addLogEvent(
        System.W,
        System.run_log,
        "siemens_cv_parser",
        System.det,
        note,
        null
      );
      return;
    }

    // Get cached last file in directory from Redis
    await System.get_last_file_parsed("last_siemens_cv");

    // Set last file in rmmu directory
    System.update_files_to_process();

    // Loop through each file that needs to be parsed
    for await (const file of System.files_in_dir) {
      const complete_file_path = `${System.directory_path}/${file}`;
      const fileData = (await fsp.readFile(complete_file_path)).toString();

      // Check for file and contents
      if (fileData === "" || fileData === null) {
        let data_note = {
          system_id: System.sme,
          complete_file_path,
          message: "No file data"
        };
        await System.addLogEvent(
          System.W,
          System.run_log,
          "siemens_cv_parser",
          System.det,
          data_note,
          null
        );
        continue;
      }

      // ** Begin Parse

      let matches = fileData.match(siemens[parsers[0]]);

      if (!matches) {
        let note = {
          job_id: System.job_id,
          sme: System.sme,
          file: System.file_config,
          re: `${siemens[parsers[0]]}`,
          message: "NO MATCH FOUND"
        };

        await System.addLogEvent(
          System.W,
          System.run_log,
          "siemens_cv_parser",
          System.det,
          note,
          null
        );
      }

      // Looping through each match block
      for await (const m of matches) {
        const matchGroups = m.match(siemens[parsers[1]]);

        if (!matchGroups) {
          let note = {
            job_id: System.job_id,
            sme: System.sysConfigData.id,
            prev_epoch: data[data.length - 1].epoch,
            sr_group: data[data.length - 1].sr,
            re: `${siemens[parsers[1]]}`,
            message: "NO MATCH FOUND"
          };
          await System.addLogEvent(
            System.W,
            System.run_log,
            "siemens_cv_parser",
            System.det,
            note,
            null
          );
          continue;
        }

        matchGroups.groups.system_id = System.sme;

        const host_date = `${matchGroups.groups.day}-${
          map_month[matchGroups.groups.month]
        }-${matchGroups.groups.year}`;

        const dtObject = await generateDateTime(
          System.job_id,
          matchGroups.groups.system_id,
          System.file_config.pg_tables[0],
          host_date,
          matchGroups.groups.time,
          System.sysConfigData.time_zone_id
        );

        if (dtObject === null) {
          let note = {
            job_id: System.job_id,
            sme: System.sysConfigData.id,
            message: "datetime object null"
          };
          await System.addLogEvent(
            System.W,
            System.run_log,
            "siemens_cv_parser",
            System.det,
            note,
            null
          );
        }

        matchGroups.groups.capture_datetime = capture_datetime;
        matchGroups.groups.host_datetime = dtObject;

        data.push(matchGroups.groups);
      }

      const mappedData = mapDataToSchema(data, siemens_cv_schema);

      // ** End Parse

      // ** Begin Persist

      const query = pgp.helpers.insert(
        mappedData,
        pg_cs.log.siemens.siemens_cv
      );

      await db.any(query);

      console.log("\nmappedData - ge_mri");
      console.log(System.sme);
      console.log(`Rows Inserted: ${mappedData.length}`);
      console.log(mappedData[mappedData.length - 1]);

      // Update alert.offline_hhm_conn table with host_datetime
      const resent_host_datetime =
        mappedData[mappedData.length - 1].host_datetime;

      const upsert_str = build_upsert_str(System.sme, resent_host_datetime);

      await db.any(upsert_str);

      // ** End Persist

      note.file = file;
      note.number_of_rows = mappedData.length;
      note.first_row = mappedData[0];
      note.last_row = mappedData[mappedData.length - 1];
      note.message = "Successful Insert";

      await System.addLogEvent(
        System.I,
        System.run_log,
        "siemens_cv_parser",
        System.det,
        note,
        null
      );

      // ** Upon successfull db insert, move file to archive dir

      await System.cache_last_file_name(
        System.last_file_in_dir,
        "last_siemens_cv"
      );

      data.length = 0;
    }
  } catch (error) {
    console.log(error);
  }
};

const map_month = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12"
};

module.exports = siemens_cv_parser;

// SME16411
// remote - Manager
