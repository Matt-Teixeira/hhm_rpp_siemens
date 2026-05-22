const queries = {
  SIEMENS_CT: `
  SELECT
	sys.id,
    sys.manufacturer,
    sys.modality,
    sites.time_zone_id,
    ac.debian_server_path,
		json_build_object(
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables,
			'file_version',
			ac.file_version
		) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	sys.manufacturer = 'Siemens'
	AND sys.modality LIKE '%CT'
	AND ac.run_group = 1
  AND sys.process_log IS TRUE
GROUP BY
  sys.id,
  sys.manufacturer,
  sys.modality,
  ac.system_id,
  log.file_name,
  log.dir_name,
  log.regex_models,
  log.pg_tables,
  ac.file_version,
  ac.debian_server_path,
  sites.time_zone_id;
    `,
  SIEMENS_MRI: `
    SELECT
    sys.id,
    sys.manufacturer,
    sys.modality,
	sites.time_zone_id,
    ac.debian_server_path,
        json_build_object(
            'file_name',
            log.file_name,
            'dir_name',
            log.dir_name,
            'parsers',
            log.regex_models,
            'pg_tables',
            log.pg_tables,
            'file_version',
            ac.file_version
        ) AS log_config
  FROM
    systems sys
    JOIN config.acquisition ac ON ac.system_id = sys.id
    JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
  WHERE
    sys.manufacturer = 'Siemens'
    AND sys.modality = 'MRI'
    AND ac.run_group = 1
    AND sys.process_log IS TRUE
  GROUP BY
    sys.id,
    ac.system_id,
    log.file_name,
    log.dir_name,
    log.regex_models,
    log.pg_tables,
    ac.file_version,
	sites.time_zone_id;
    `,
  SIEMENS_CV: `
    SELECT
    sys.id,
    sys.manufacturer,
    sys.modality,
	sites.time_zone_id,
    ac.debian_server_path,
        json_build_object(
            'file_name',
            log.file_name,
            'dir_name',
            log.dir_name,
            'parsers',
            log.regex_models,
            'pg_tables',
            log.pg_tables,
            'file_version',
            ac.file_version
        ) AS log_config
  FROM
    systems sys
    JOIN config.acquisition ac ON ac.system_id = sys.id
    JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
  WHERE
    sys.manufacturer = 'Siemens'
    AND sys.modality = 'CV/IR'
    AND ac.run_group = 1
    AND sys.process_log IS TRUE
  GROUP BY
    sys.id,
    ac.system_id,
    log.file_name,
    log.dir_name,
    log.regex_models,
    log.pg_tables,
    ac.file_version,
	sites.time_zone_id;
    `
};

module.exports = queries;
