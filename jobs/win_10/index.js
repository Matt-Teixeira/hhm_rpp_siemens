const win10_siemens_ct = require("./siemens_ct");
const win10_siemens_mri = require("./siemens_mri");
const siemens_cv_parser = require("./siemens_cv");
const siemens_cv_app_event_parser = require("./siemens_cv_app_event");
const Siemens_10 = require("../../acquisition/Siemens_10");
const { gzip_n_save } = require("../../tooling");
const { dt_now } = require("../../tooling/dates");
const [addLogEvent] = require("../../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat }
} = require("../../utils/logger/enums");

const win_10_parsers = async (job_id, sysConfigData, file_config, run_log) => {
  let note = {
    job_id,
    sme: sysConfigData.id,
    file_config: file_config
  };
  await addLogEvent(I, run_log, "win_10_parsers", cal, note, null);
  try {
    const capture_datetime = dt_now();
    switch (sysConfigData.modality) {
      case "CT":
        const CT_System = new Siemens_10(
          sysConfigData,
          file_config,
          job_id,
          run_log
        );
        await win10_siemens_ct(CT_System, capture_datetime);
        break;
      case "CV/IR":
        const CV_System = new Siemens_10(
          sysConfigData,
          file_config,
          job_id,
          run_log
        );
        // Systems configured with the AppEventLog regex (config.log.regex_models)
        // read daily XA..._AppEventLog.txt files; others read Evtlog files.
        if ((file_config.parsers || []).includes("cv_app_event_line")) {
          await siemens_cv_app_event_parser(CV_System, capture_datetime);
        } else {
          await siemens_cv_parser(CV_System, capture_datetime);
        }
        break;
      case "MRI":
        const MRI_System = new Siemens_10(
          sysConfigData,
          file_config,
          job_id,
          run_log
        );
        await win10_siemens_mri(MRI_System, capture_datetime);
        break;
      default:
        break;
    }

    if (sysConfigData.modality === "CV/IR") return;

    // Save Siemens log to DB
    const path = `${sysConfigData.debian_server_path}/${sysConfigData.log_config.file_name}`;

    await gzip_n_save(
      job_id,
      run_log,
      sysConfigData.id,
      sysConfigData.log_config.file_name,
      capture_datetime,
      path
    );
  } catch (error) {
    await addLogEvent(E, run_log, "win_10_parsers", cat, note, error);
  }
};

module.exports = win_10_parsers;
