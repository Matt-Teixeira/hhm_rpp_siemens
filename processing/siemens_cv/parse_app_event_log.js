const { DateTime } = require("luxon");
const { siemens } = require("../../parse/parsers");

// Event state letter -> Windows event type code used in the Evtlog "Type:" field
// (and already stored in log.siemens_cv.type).
const state_to_type = { E: "1", W: "2", I: "4" };

/*
Parses a Siemens Artis XA<serial>_<yyyy_mm_dd>_AppEventLog.txt file into rows
shaped like the Evtlog cv_groups output, so both feed log.siemens_cv unchanged.

Returns { rows, unmatched } where unmatched lists event-looking lines that
failed the regex. Rows are returned in file order (oldest first).
*/
function parse_app_event_log(fileData) {
  const rows = [];
  const unmatched = [];

  const domain_match = fileData.match(siemens.cv_app_event_domain);
  const domain = domain_match ? domain_match.groups.domain : null;

  for (const line of fileData.split(/\r*\n|\r+/)) {
    // Only lines that start an event; indented Medcom lines, separators,
    // header and blank lines are skipped.
    if (!/^[A-Z]\s+\d{2}-[A-Z][a-z]{2}-\d{2}\s/.test(line)) continue;

    const m = line.match(siemens.cv_app_event_line);
    if (!m) {
      unmatched.push(line);
      continue;
    }
    const g = m.groups;

    const date = DateTime.fromFormat(`${g.day}-${g.mon}-${g.yy}`, "dd-MMM-yy", {
      locale: "en-US"
    });

    rows.push({
      source: g.source.trim(),
      domain,
      type: state_to_type[g.state] || g.state,
      id_group: g.id_group,
      dow: date.isValid ? date.toFormat("cccc") : null,
      month: date.isValid ? date.toFormat("LLLL") : null,
      day: g.day,
      year: date.isValid ? date.toFormat("yyyy") : null,
      time: g.time,
      // Medcom events are wrapped as "<I>message    </I>" (also seen: <B>)
      text: g.text.replace(/^<([A-Z])>([\s\S]*?)\s*<\/\1>$/, "$2").trim()
    });
  }

  return { rows, unmatched };
}

module.exports = parse_app_event_log;
