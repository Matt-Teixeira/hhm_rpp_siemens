const fs = require("node:fs").promises;
const win_7_siemens_ct = require("./siemens_cv");

const win_7_parsers = async (jobId, sysConfigData, fileConfig) => {

  // Check for modality

  switch (sysConfigData.hhm_config.modality) {
    case "CV":
      const files = await fs.readdir(sysConfigData.hhm_config.file_path);
      if (files.length === 0) {
        return;
      }
      // Loops through Evtlog directory and process all files there. Then moves to archive after successful rpp
      for await (let file of files) {
        await win_7_siemens_ct(jobId, sysConfigData, fileConfig, file);
      }
      break;
    default:
      break;
  }

  try {
  } catch (error) {
    console.log(error);
  }
};

module.exports = win_7_parsers;
