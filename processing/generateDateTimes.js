const { dateTimeTemplate } = require("./dateTimeTemplate");

const [addLogEvent] = require("../utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, det, cat, seq, qaf }
} = require("../utils/logger/enums");

async function generateDateTime(
  run_log,
  sme,
  pgTable,
  hostDate,
  hostTime,
  time_zone_id
) {
  if (!time_zone_id) time_zone_id = "America/New_York";
  try {
    let date;
    switch (pgTable) {
      case "siemens_ct":
        date = await dateTimeTemplate(
          run_log,
          sme,
          `${hostDate}${hostTime}`,
          "yyyy-MM-ddHH:mm:ss",
          `${time_zone_id}`
        );
        break;
      case "siemens_cv":
        date = await dateTimeTemplate(
          run_log,
          sme,
          `${hostDate}${hostTime}`,
          "dd-MM-yyyyHH:mm:ss",
          `${time_zone_id}`
        );
        break;
      case "siemens_mri":
        date = await dateTimeTemplate(
          run_log,
          sme,
          `${hostDate}${hostTime}`,
          "yyyy-MM-ddHH:mm:ss",
          `${time_zone_id}`
        );
        break;
      default:
        break;
    }
    return date;
  } catch (error) {
    console.log(error);
    let note = {
      sme,
      pgTable,
      hostDate,
      hostTime
    };
    await addLogEvent(E, run_log, "generateDateTime", cat, note, error);
  }
}

module.exports = generateDateTime;
