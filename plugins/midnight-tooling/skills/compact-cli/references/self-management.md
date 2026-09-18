# CLI Self-Management

> **Last verified:** 2026-09-17 against `compact` CLI 0.5.1 — `self check` / `self update` subcommands verified against the installed toolchain.

The `compact self` subcommand manages the CLI binary itself — independent of the compiler versions it manages.

## Check for CLI Updates

```bash
compact self check
```

Reports whether a newer version of the CLI tool is available. Does not download anything.

Example output:
```
compact: compact -- 0.5.1 -- Up to date
```

## Update the CLI Tool

```bash
compact self update
```

Downloads and replaces the `compact` binary with the latest version. Does not affect installed compiler versions.

After updating, verify:
```bash
compact --version
# compact 0.5.1
```

## Recommended Update Order

When updating both the CLI and compiler:

1. `compact self update` — update the CLI tool first
2. `compact --version` — verify CLI update
3. `compact update` — download latest compiler
4. `compact compile --version` — verify compiler update

Updating the CLI first ensures the latest download and version management logic is used when fetching the compiler.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `compact self update` fails with network error | Cannot reach GitHub releases | Check connectivity; try setting `GITHUB_TOKEN` env var |
| Version unchanged after `compact self update` | Already on latest | Expected — no action needed |
| `compact self check` reports update but `compact self update` fails | Permissions on the binary | Check write permissions on the `compact` binary path (`which compact`) |
