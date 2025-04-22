const win_10_parsers = require("./win_10/index.js");
const win_7_parsers = require("./win_7/index");
const [addLogEvent] = require("../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat }
} = require("../utils/logger/enums");

const siemens_parsers = async (run_log, job_id, sysConfigData) => {
  let note = {
    job_id,
    sme: sysConfigData.id
  };
  await addLogEvent(I, run_log, "siemens_parsers", cal, note, null);

  // Check for windows OS version

  const file_config = sysConfigData.log_config;

  switch (file_config.file_version) {
    case "win_7":
      await win_7_parsers(job_id, sysConfigData, file_config, run_log);

      break;
    case "win_10":
      await win_10_parsers(job_id, sysConfigData, file_config, run_log);

      break;
    default:
      await win_10_parsers(job_id, sysConfigData, file_config, run_log);
      break;
  }

  try {
  } catch (error) {
    await addLogEvent(E, run_log, "siemens_parsers", cat, note, error);
  }
};

module.exports = siemens_parsers;
