const siemens_ct_mri = {
  system_id: null,
  host_state: null,
  host_date: null,
  host_time: null,
  source_group: null,
  type_group: null,
  text_group: null,
  domain_group: null,
  id_group: null,
  month: null,
  day: null,
  year: null,
  host_datetime: null,
  capture_datetime: null
};

const siemens_cv_schema = {
  system_id: null,
  source: null,
  domain: null,
  type: null,
  id_group: null,
  dow: null,
  month: null,
  day: null,
  year: null,
  time: null,
  text: null,
  capture_datetime: null,
  host_datetime: null
};

module.exports = {
  siemens_ct_mri,
  siemens_cv_schema
};
