# Interpreting drift-check.sh output

## Lock-file policy (read first)

`versions.lock.json` is owned by plugin maintainers. Claude must NOT
edit it as part of running the regression-check skill. When drift is
detected, Claude reports findings to the user and stops. Updates to the
lock file happen when the plugin is released, not when this skill runs.

## The output table

`drift-check.sh` prints one row per package with PINNED, LATEST, DRIFT
columns. DRIFT is one of `none`, `patch`, `minor`, `MAJOR`, or
`npm-error`.

## What to do per drift level

| Drift level | Meaning | What to do |
|-------------|---------|------------|
| `none` | No change since pin date | Trust the patterns |
| `patch` | Patch bump (no API change by SemVer) | Trust the patterns; mention the patch in the report so the user can decide whether to file a plugin-maintenance issue |
| `minor` | New features, no removed APIs | Read release notes for the affected package(s); spot-check the relevant example; report findings to the user — do not edit the lock |
| `MAJOR` | Breaking changes possible | Run `smoke-test.sh`. If smoke passes, the patterns still work; surface release-note highlights. If smoke fails, follow the drift workflow in `using-release-notes.md` |
| `npm-error` | npm could not resolve the package | Check network; check whether the package was renamed or deprecated; do not change the lock |

## When `smoke-test.sh` fails with no drift detected

The failure is environmental, not SDK drift. Check:

1. Is the devnet reachable? Run `curl -f http://localhost:9944/health`.
2. Is the proof server reachable? Run `curl -f http://localhost:6300`.
3. Is the indexer reachable? Run
   `curl -f -X POST -H 'content-type: application/json' -d '{"query":"{__typename}"}' http://localhost:8088/api/v4/graphql`
   (a plain GET returns `405`).

Use `midnight-tooling:devnet health` for a structured check.

If the environment is fine but smoke still fails, the cause is most
likely a devnet image-version mismatch — the dev preset's pre-mint
contract may have changed across image versions. Report this to the
user; do not change the SDK skill content.
