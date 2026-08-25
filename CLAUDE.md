# CLAUDE.md

> **⚠️ MID-MIGRATION (started 2026-08-25).** This app is being aligned to the fleet
> dev/release paradigm. The specification is
> `data_acquisition/docs/migration_CLAUDE.md` (Part 1 = conventions, Part 3 =
> checklist); the reference implementations are **data_acquisition** (pilot,
> 2026-08-24) and **monday** (2026-08-25). Until this banner is removed, sections
> below describe a moving target — each is corrected in the commit that makes it
> true. Where this file and the paradigm docs disagree, the paradigm docs win.

**hhm_rpp_siemens** is a Node.js parser: it incrementally reads Siemens equipment
`Application.log` files (fetched to `/opt/resources/acqu_files/<SME>/` by
data_acquisition every 30 min), parses new lines since the last run, and
bulk-inserts to PostgreSQL (`log.siemens_ct`, `log.siemens_mri`, `log.siemens_cv`).
Run-once by design — triggered on a schedule, not a long-running service.

## Run arguments (job families)

| argv | boot query | systems (2026-08-25) | status |
| --- | --- | --- | --- |
| `SIEMENS_CT` | Siemens, modality `%CT`, run_group 1, process_log | 11 | **live** (scheduled at cutover) |
| `SIEMENS_MRI` | Siemens, modality `MRI`, run_group 1, process_log | 1 | **live** (scheduled at cutover) |
| `SIEMENS_CV` | Siemens, modality `CV/IR`, run_group 1, process_log | 0 | **dead by config** — stays unscheduled (owner decision 2026-08-25) |

Incremental mechanism: Redis key `<SME>.<file_name>` (e.g. `SME01074.Application.log`)
holds the last parsed **line**; a run reads the file top-down until it hits that
line, inserts the new rows, then advances the cursor **after** a successful insert.
Overlapping runs of the same family would double-insert — cron entries must use
`flock -n`.

## Current state (verified 2026-08-25, pre-migration)

- **The app has never run on this server.** Zero rows in `util.app_run_logs` for
  `app_name='hhm_rpp_siemens'`; `log.siemens_*` tables empty; no cron entry in any
  crontab. Source files have been accumulating unparsed since June 2026 — expect a
  large first-cycle surge when the schedule goes live.
- Migration state and gap audit: see the session notes / commit history on
  `STAGING_docker` from 2026-08-25 onward.

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
  systems configured), `tooling/gzip_file.js`.

## Environment / secrets

- `.env` is gitignored; `.env.example` is the tracked record of required keys.
- PG + Redis credentials come from root-only `/opt/resources/secrets/`; this app
  **is registered** in the host rotation script (`rotate-envs-20260817.sh`), which
  rewrites both `/opt/apps/hhm_rpp_siemens/.env` and `~/apps/hhm_rpp_siemens/.env`
  when a secret rotates — both copies must keep values matching the reference.

## Migration TODO (transient — delete when banner comes off)

Sequence agreed 2026-08-25 (Part 3 Known dependencies preserved; #1's
entrypoint-repair lands in build.sh/preflight instead — see KNOWN WARTS):

1. [x] This file (banner first), stale docs corrected
2. [x] `build.sh` — in-tree npm install, log-dir mkdir, shared-image presence check
3. [x] Logger/compose/env — ONE COMMIT: single-path log.js (`USER_ID`/`LOGGER_MODE`),
       `${LOG_DIR:-./utils/logger/logs}` mount, drop node_mod_cache + hardcoded
       run-logs mounts, delete dead `app` service, rewrite `.env.example`
4. [x] Boot `env_note` fix (drop undefined legacy keys; add `USER_ID`,
       `LOGGER_MODE`, `RELEASE_SHA||'dev-tree'`; keep `argv`)
5. [x] `gracefulShutdown` (SIGTERM/SIGINT flush-once, honest non-zero exit)
6. [x] `build-release.sh` (clean-tree guard, tar mirror, `#RELEASE:` transform,
       `RELEASE_SHA` stamp, npm-install-as-svc with `HOME=/opt/apps/.svc-home`)
7. [x] `preflight-check.sh` (authenticated PG sibling-container + Redis PING checks)
8. [ ] Verify: preflight zero warnings → dev round-trip (CV boot smoke, MRI, CT,
       kill test) → guard negative test → release round-trip → svc-crontab install
       (CT `:15:55`, MRI `:16:05`, `flock -n`, `-T`, bounded `.out`) → two-cycle DB
       verification → banner off + cross-repo doc updates
