const win_7_re = {
  big_group:
    /(?<big_group>Source.*(\r\n)Domain:.*(\r\n)Type:.*(\r\n)ID:.*(\r\n)Date:.*(\r\n)Text:.*)/g,
  small_group:
    /Source:(?<source_group>.*)(\r\n)Domain:(?<domain_group>.*)(\r\n)Type:(?<type_group>.*)(\r\n)ID:(?<id_group>.*)(\r\n)(Date:.*\s(?<month>\w+)\s(?<day>\d+),\s(?<year>\d+),\s(?<host_time>.*))(\r\n)Text:(?<text_group>.*)\n?/
};

const win_10_re = {
  re_v1:
    /(?<host_state>\w+)\t(?<host_date>\d{4}-\d{1,2}-\d{1,2})\t(?<host_time>\d{2}:\d{2}:\d{2})\t(?<source_group>(.*?(\d+)?)(\.\d\.\d)?)\t?\s?(?<type_group>(\d{1,5}))\t(?<text_group>.*)/,
  re_v2:
    /(?<host_time>\d{2}:\d{2}:\d{2})\t(?<host_state>\w+)\t(?<host_date>\d{4}-\d{1,2}-\d{1,2})\t(?<source_group>(.*?(\d+)?)(\.\d\.\d)?)\t?\s?(?<type_group>(\d{1,5}))\t(?<text_group>.*)/
};

const siemens = {
  // One event block: from a line starting "Source:" up to the next event, the
  // "N message(s) read" footer, or end of file. Text bodies can span lines.
  cv_bulk:
    /^Source:[\s\S]*?(?=^Source:|^\d+ message\(s\) read|(?![\s\S]))/gm,
  // Text runs until the Medcom-Infoblock (not captured) or end of block;
  // trailing CR/LF/whitespace is left out of the group.
  cv_groups:
    /^Source:(?<source>.*?)\r*\nDomain:(?<domain>.*?)\r*\nType:(?<type>.*?)\r*\nID:(?<id_group>.*?)\r*\nDate:(?<dow>.*?),\s(?<month>\w+)\s(?<day>\d+),\s(?<year>\d+),\s(?<time>\d{1,2}:\d{2}:\d{2})\r*\nText:(?<text>[\s\S]*?)\s*(?=^Medcom-Infoblock:|(?![\s\S]))/m,
  // XA<serial>_<yyyy_mm_dd>_AppEventLog.txt (Artis daily export). One event per
  // line: "I  09-Nov-26 08:04:56\t2\tAX_SF            <I>message    </I>".
  // Source is a fixed 16-char column (long names truncated to "xxx...").
  // Indented "Time:/Text:" lines below an event are the Medcom-Infoblock and
  // are not captured (matches cv_groups behaviour).
  cv_app_event_line:
    /^(?<state>[A-Z])\s+(?<day>\d{2})-(?<mon>[A-Z][a-z]{2})-(?<yy>\d{2})\s(?<time>\d{2}:\d{2}:\d{2})\t(?<id_group>\d+)\t(?<source>.{16})\s(?<text>.*?)\s*$/,
  cv_app_event_domain: /^Domain\s*:\s*(?<domain>.*?)\s*$/m
};

module.exports = {
  win_7_re,
  win_10_re,
  siemens
};
