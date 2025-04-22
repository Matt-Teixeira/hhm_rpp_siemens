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
  cv_bulk: /(?<data_block>Source.*?Text.*?\n)/gs,
  cv_groups:
    /Source:(?<source>.*?)(\r\n)Domain:(?<domain>.*?)(\r\n)Type:(?<type>.*?)(\r\n)ID:(?<id_group>.*?)(\r\n)Date:(?<dow>.*),\s(?<month>.*?)\s(?<day>\d+),\s(?<year>\d+),\s(?<time>.*?)(\r\n)Text:(?<text>.*)(\r\n)/s
};

module.exports = {
  win_7_re,
  win_10_re,
  siemens
};
