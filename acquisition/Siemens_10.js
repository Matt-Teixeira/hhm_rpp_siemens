const System = require("../acquisition/System");
const fs = require("node:fs");
const fsp = require("node:fs").promises;
const readline = require("readline");
const { updateRedisLine, getRedisLine } = require("../redis/redisHelpers");
const {
  update_redis_last_file,
  get_last_cached_file
} = require("../redis/redisHelpers");

class Siemens_10 extends System {
  constructor(sysConfigData, file_config, job_id, run_log) {
    super(sysConfigData, file_config, job_id, run_log);
    this.complete_file_path = `${sysConfigData.debian_server_path}/${file_config.file_name}`;
    this.directory_path = sysConfigData.debian_server_path;
  }
  lastModPath = "./read/sh/get_file_last_mod.sh";
  redis_line;
  files_in_dir;
  file_data;
  last_file_in_dir;
  last_file_parsed;

  async get_redis_line() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config
    };
    try {
      this.redis_line = await getRedisLine(
        this.sme,
        this.file_config.file_name,
        this.run_log
      );
      await this.addLogEvent(
        this.I,
        this.run_log,
        "Siemens_10: get_redis_line",
        this.det,
        note
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Siemens_10: get_redis_line",
        this.cat,
        note,
        error
      );
    }
  }

  async is_file_present() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file_path: this.complete_file_path
    };
    if (!fs.existsSync(this.complete_file_path)) {
      note.message = "File not found in directory";
      await this.addLogEvent(
        this.W,
        this.run_log,
        "Siemens_10: is_file_present",
        this.det,
        note
      );
      return false;
    }
    return true;
  }

  async get_file_data() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file_path: this.complete_file_path
    };
    await this.addLogEvent(
      this.I,
      this.run_log,
      "Siemens_10: get_file_data",
      this.cal,
      note
    );
    try {
      this.file_data = readline.createInterface({
        input: fs.createReadStream(this.complete_file_path),
        crlfDelay: Infinity
      });
    } catch (error) {
      console.log(error);
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Siemens_10: get_file_data",
        this.cat,
        note,
        error
      );
    }
  }

  async update_redis_line(first_line) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file_path: this.complete_file_path,
      update_line: first_line
    };
    try {
      await this.addLogEvent(
        this.I,
        this.run_log,
        "Siemens_10: update_redis_line",
        this.cal,
        note
      );
      await updateRedisLine(
        this.sme,
        this.file_config.file_name,
        first_line,
        this.run_log
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Siemens_10: update_redis_line",
        this.cat,
        note,
        error
      );
    }
  }

  async get_directory_files() {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file: this.file_config
    };
    await this.addLogEvent(
      this.I,
      this.run_log,
      "Siemens_10: get_directory_files",
      this.cal,
      note,
      null
    );
    try {
      // Ex directory_path: Files in  home/prod/hhm_data_acquisition/files/SME00817
      this.files_in_dir = await fsp.readdir(
        this.sysConfigData.debian_server_path
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Siemens_10: get_directory_files",
        this.cat,
        note,
        error
      );
    }
  }

  async get_last_file_parsed(file_type) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file_type,
      last_file_parsed: this.last_file_parsed
    };
    console.log("\nfile_type");
    console.log(file_type);
    await this.addLogEvent(
      this.I,
      this.run_log,
      "Siemens_10: get_last_file_parsed",
      this.cal,
      note,
      null
    );
    try {
      this.last_file_parsed = await get_last_cached_file(
        this.sme,
        file_type,
        this.run_log
      );
      console.log("\nFinished get_last_cached_file!");
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Siemens_10: get_last_file_parsed",
        this.cat,
        note,
        error
      );
    }
  }

  // Set last file in rmmu directory
  async update_files_to_process() {
    let note = {
      job_id: this.job_id,
      sme: this.sme
    };
    try {
      const index = this.files_in_dir.indexOf(this.last_file_parsed);
      this.files_in_dir = this.files_in_dir.slice(index + 1);
      this.last_file_in_dir = this.files_in_dir[this.files_in_dir.length - 1];
      note.last_file_in_dir = this.last_file_in_dir;
      await this.addLogEvent(
        this.I,
        this.run_log,
        "Siemens_10: update_files_to_process",
        this.det,
        note,
        null
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "Siemens_10: update_files_to_process",
        this.cat,
        note,
        error
      );
    }
  }

  async cache_last_file_name(file, rmmu_file_type) {
    let note = {
      job_id: this.job_id,
      sme: this.sme,
      file,
      rmmu_file_type
    };
    await this.addLogEvent(
      this.I,
      this.run_log,
      "PHILIPS_MRI_RMMU: cache_last_file_name",
      this.cal,
      note,
      null
    );
    try {
      await update_redis_last_file(
        this.sme,
        file,
        rmmu_file_type,
        this.run_log
      );
    } catch (error) {
      await this.addLogEvent(
        this.E,
        this.run_log,
        "PHILIPS_MRI_RMMU: cache_last_file_name",
        this.cat,
        note,
        error
      );
    }
  }
}

module.exports = Siemens_10;
