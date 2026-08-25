# CLAUDE.md

> **Migrated to the fleet dev/release paradigm 2026-08-25** (third app, after
> data_acquisition and monday). Conventions:
> `data_acquisition/docs/migration_CLAUDE.md` Part 1. Dev clone:
> `~/apps/hhm_rpp_siemens`; `/opt/apps/hhm_rpp_siemens` is build output produced
> ONLY by `build-release.sh`. Cutover verified over two cron cycles
> (2026-08-25 19:46 + 20:16 UTC: both families, all `RELEASE_SHA=1bd5828`,
> zero `dev-tree`).

**hhm_rpp_siemens** is a Node.js parser: it incrementally reads Siemens equipment
`Application.log` files (fetched to `/opt/resources/acqu_files/<SME>/` by
data_acquisition every 30 min), parses new lines since the last run, and
bulk-inserts to PostgreSQL (`log.siemens_ct`, `log.siemens_mri`, `log.siemens_cv`).
Run-once by design — triggered on a schedule, not a long-running service.

## Run arguments (job families)

| argv | boot query | systems (2026-08-25) | status |
| --- | --- | --- | --- |
| `SIEMENS_CT` | Siemens, modality `%CT`, run_group 1, process_log | 11 | **live** — svc crontab `15,45 * * * *` at `:15:55` |
| `SIEMENS_MRI` | Siemens, modality `MRI`, run_group 1, process_log | 1 | **live** — svc crontab `15,45 * * * *` at `:16:05` |
| `SIEMENS_CV` | Siemens, modality `CV/IR`, run_group 1, process_log | 0 | **dead by config** — stays unscheduled (owner decision 2026-08-25) |

Incremental mechanism: Redis key `<SME>.<file_name>` (e.g. `SME01074.Application.log`)
holds the last parsed **line**; a run reads the file top-down until it hits that
line, inserts the new rows, then advances the cursor **after** a successful insert.
Overlapping runs of the same family would double-insert — cron entries must use
`flock -n`.

## Schedule (shared svc crontab — `sudo crontab -u svc -l`)

Installed 2026-08-25 in the *DAILY OR MORE FREQUENT* section, hardened from day
one: absolute `/usr/bin/docker`/`/usr/bin/flock`, `flock -n` (cursor advances
after insert — overlap would double-insert), `-T`, direct `node index.js <FAMILY>`
argv, bounded single-`>` `.out` files in `/opt/run-logs/hhm_rpp_siemens/`.
`sleep 55`/`65` keeps clear of the ge/philips pileup at `:15:00` and mmb-rpp at
`:17`. The schedule is host configuration — changing a cadence needs no release.

Historical note: before 2026-08-25 this app had **never run on this server**
(zero `util.app_run_logs` rows, empty `log.siemens_*` tables, no cron entry
anywhere) while data_acquisition fetched its source files every 30 min. First
data: 2026-08-25 dev smokes (`dev-tree` rows), first release runs on `1bd5828`.

## KNOWN WARTS (deliberate — do not "fix" casually)

- **Shared image, transitional tag.** Compose runs `image: hhm_rpp:${IMAGE_TAG}`
  (currently `staging`) — the image is **owned and built by hhm_rpp_ge**
  (`hhm_rpp_ge/docker/Dockerfile`); philips and siemens have no Dockerfile on
  purpose. Do NOT retag or rebuild it from this repo. When ge migrates, it will
  build `hhm_rpp:svc` (plus a `staging` alias for un-migrated philips) and this
  app flips its reference to `hhm_rpp:svc` in one commit + re-release.
  Per-consumer identity tags were considered and rejected: the image carries no
  app code, and runtime identity is decided by `RUN_USER`/entrypoint.
- **No entrypoint log-dir repair.** The gosu entrypoint is baked into ge's image
  and only drops privileges — it cannot `mkdir`/chown the log dir. Substitute:
  `build.sh` and `preflight-check.sh` create `./utils/logger/logs` host-side so
  Docker never creates the bind source root-owned. `/opt/run-logs/hhm_rpp_siemens`
  is pre-created `svc:docker 2775` on the host.
- `index.js` references a `DESIGN.md` (run_outcome/v1 contract) that was never
  committed to this repo. The contract's authority is the comments in `index.js`
  itself; ops-dashboard and incident-engine consume the exit codes and the
  `run_outcome` event — **never regress to exit-0-on-failure, and never reshape
  event 0's `note.argv`** (ops-dashboard derives the job label from
  `verbose_log->0->'note'->'argv'->>2`).
- Museum code retained pending post-cutover cleanup (deferred by decision, needs
  per-item sign-off): `utils/vpn/`, `utils/config-processor/`, `utils/units/`,
  non-siemens SQL under `utils/db/sql/`, `redis/redisHelpers.js` `dp:queue` +
  rmmu helpers (no callers), `pm2` dependency, `jobs/win_7/` (no `win_7`
  systems configured), `tooling/gzip_file.js`. Same pile: the MRI/CT job files
  carry raw `console.log` debug dumps (sample rows, `mappedData`) that bypass
  `LOGGER_MODE` and land in the cron `.out` files — harmless because those are
  bounded single-`>` overwrites, but they are noise, not the run record.

## Running

```bash
bash preflight-check.sh          # expect ZERO warnings
bash build.sh                    # deps in-tree + dev log dir + image check

# Development — from the dev tree (~/apps/hhm_rpp_siemens), as yourself
RUN_USER=<you> docker compose run --rm app_tools node index.js SIEMENS_CT   # or SIEMENS_MRI / SIEMENS_CV

# Production — from the release copy, RUN_USER omitted (entrypoint defaults to svc)
cd /opt/apps/hhm_rpp_siemens && docker compose run --rm app_tools node index.js SIEMENS_CT

# Release
bash build-release.sh            # refuses on a dirty tree; stamps RELEASE_SHA
```

Run logs: dev → `./utils/logger/logs/`, release → `/opt/run-logs/hhm_rpp_siemens/`
(`<app>-log.<USER_ID>.<run_id>.json`; read with `cat`, never open in an editor).
Steady-state runs carry one WARN per already-current system (`End of new data`) —
judge health by *which* warnings appear, not whether any did.

## Environment / secrets

- `.env` is gitignored; `.env.example` is the tracked record of required keys.
- PG + Redis credentials come from root-only `/opt/resources/secrets/`; this app
  **is registered** in the host rotation script (`rotate-envs-20260817.sh`), which
  rewrites both `/opt/apps/hhm_rpp_siemens/.env` and `~/apps/hhm_rpp_siemens/.env`
  when a secret rotates — both copies must keep values matching the reference.
