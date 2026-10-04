# Read-only execution diagnostic

The existing launch panel displays a diagnostic button when a canonical launch exists. The owner-only GET route `/api/orchestration/openhands/recovery/[missionId]` resolves the active workspace, loads its canonical launch and checks actor/workspace/mission identity before reading any report.

The host may publish a report using `run_host_job.py --config <protected-config> --inspect --gateway-root <protected-gateway-root> --report-directory <protected-report-directory>`. Publication uses a root-owned temporary file, fsync, atomic replacement and mode 0444. Mount that directory read-only at `/run/oria-hq-reports` in HQ; the directory must permit the HQ process to traverse/read it. This mount and production publication are not configured yet.

Reports are bounded to 16 KiB, regular root-owned non-writable files, opened without following the final symlink. The fixed report directory and its parent mount must be administrator-controlled. The browser cannot supply a path. Parsed identity must match the canonical launch. Reports older than 60 seconds, future dated, unstable or reflecting a different canonical state are marked stale. Responses are private/no-store and expose selected diagnostic fields only.

No scheduler or polling loop is added. Reading does not start jobs, refresh the report, retry execution, or validate coding output. Missing/invalid reports display unavailable. The UI distinguishes stale observations and incomplete inspection.

Validation: recovery reader scope/freshness/identity test passes; typecheck, build and local smoke pass. Lint has zero errors and five existing warnings in unrelated memory files. Build warns that missing Inngest keys prevent scheduled production jobs. Linux host publication/operator tests: 9 pass. Browser rendering, actual owner-session route qualification, live report mount and deployment remain outstanding. No commit or push.
