const fs = require("node:fs").promises;
const { win_7_re } = require("../../parse/parsers");
const mapDataToSchema = require("../../persist/map-data-to-schema");
const { siemens_cv_schema } = require("../../persist/pg-schemas");
//const bulkInsert = require("../../../persist/queryBuilder");
const generateDateTime = require("../../processing/generateDateTimes");

const win_7_siemens_ct = async (jobId, sysConfigData, fileConfig, file) => {
  const sme = sysConfigData.id;
  const dirPath = sysConfigData.hhm_config.file_path;

  const data = [];

  try {

    const complete_file_path = `${dirPath}/${file}`;

    const fileData = (await fs.readFile(complete_file_path)).toString();

    let matches = fileData.match(win_7_re.big_group);

    for await (let match of matches) {
      if (match === null) {
        throw new Error("Bad match");
      }
      let matchGroups = match.match(win_7_re.small_group);

      matchGroups.groups.system_id = sme;

      let month = matchGroups.groups.month.slice(0, 3);
      matchGroups.groups.host_date = `${matchGroups.groups.day}-${month}-${matchGroups.groups.year}`;

      const dtObject = await generateDateTime(
        jobId,
        matchGroups.groups.system_id,
        fileConfig.pg_table,
        matchGroups.groups.host_date,
        matchGroups.groups.host_time
      );

      matchGroups.groups.host_datetime = dtObject;

      data.push(matchGroups.groups);
    }

    const mappedData = mapDataToSchema(data, siemens_cv_schema);
    const dataToArray = mappedData.map(({ ...rest }) => Object.values(rest));

    /* 
    const insertSuccess = await bulkInsert(
      jobId,
      dataToArray,
      sysConfigData,
      fileConfig
    );
    // If rpp successful, append datetime to file name and move to archive. Move on to next file within EvtLog dir.
    if (insertSuccess) {
      await fs.rename(complete_file_path, `${fileConfig.move_path}/${file}`);
    }
    */

    return true;
  } catch (error) {
    console.log(error);
  }
};

module.exports = win_7_siemens_ct;
