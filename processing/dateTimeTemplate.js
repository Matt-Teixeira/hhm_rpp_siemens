const { DateTime } = require("luxon");

const dateTimeTemplate = async (jobId, sme, dtString, inputPattern, ianaTz) => {
  return DateTime.fromFormat(dtString, inputPattern, {
    zone: ianaTz
  }).toISO();
};

module.exports = { dateTimeTemplate };
