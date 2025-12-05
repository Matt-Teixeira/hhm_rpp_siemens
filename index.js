("use strict");
require("dotenv").config();

// PARSEING JOBS
const siemens_parsers = require("./jobs");

// DATABASE
const pgPool = require("./utils/db/pg-pool");
const pgp = require("pg-promise")();

// ACQUISITION QUEIRES
const boot_queires = require("./acquisition/on_boot_queries");

// LOGGER
const [
  addLogEvent,
  writeLogEvents,
  dbInsertLogEvents,
  makeAppRunLog,
] = require("./utils/logger/log");
const {
  type: { I, W, E },
  tag: { cal, cat },
} = require("./utils/logger/enums");

// UTIL
const { v4: uuidv4 } = require("uuid");

async function run_job(job_id, system, run_log) {
  let note = {
    job_id,
    system_id: system.id,
  };

  try {
    await addLogEvent(I, run_log, "run_job", cal, note, null);

    await siemens_parsers(run_log, job_id, system);
  } catch (error) {
    console.log("ERROR OCCURED IN run_job" + error);
    await addLogEvent(E, run_log, "run_job", cat, note, error);
  }
}

async function on_boot() {
  const run_log = await makeAppRunLog();

  let shell_value = [process.argv[2]];

  try {
    let note = {
      LOGGER: process.env.LOGGER,
      REDIS_IP: process.env.REDIS_IP,
      PG_USER: process.env.PG_USER,
      PG_DB: process.env.PG_DB,
      argv: process.argv,
    };
    await addLogEvent(I, run_log, "on_boot", cal, note, null);

    let queryString = boot_queires[shell_value];

    const systems = await pgPool.any(queryString);

    for await (const system of systems) {
      const job_id = uuidv4();

      await run_job(job_id, system, run_log);
    }
    await dbInsertLogEvents(pgp, run_log);
    await writeLogEvents(run_log);
  } catch (error) {
    console.log(error);
    await addLogEvent(E, run_log, "on_boot", cat, null, error);
    // await dbInsertLogEvents(pgp, run_log);
    await writeLogEvents(run_log);
  }
}

on_boot();
