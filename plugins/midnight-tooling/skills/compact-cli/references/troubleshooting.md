# Troubleshooting

> **Last verified:** 2026-09-17 against `compact` CLI 0.5.1 / compiler 0.31.1 — exit codes and error messages reproduced against the installed toolchain.

## Exit Codes

| Code | Meaning | Source |
|------|---------|--------|
| `0` | Success | CLI or compiler |
| `1` | CLI error (missing compiler, failed operation) | CLI |
| `2` | Usage error (unknown subcommand, invalid flag) | CLI (clap) |
| `255` | Compiler error (parse error, type error, semantic error) | Compiler |

## Error Messages by Category

### Installation and PATH

| Error | Cause | Fix |
|-------|-------|-----|
| `compact: command not found` | CLI binary not on PATH | Add `$HOME/.compact/bin` (or `$HOME/.local/bin`) to PATH, reload shell |
| `compact: command not found` after install | Shell session not reloaded | Run `source ~/.zshrc` (or `~/.bashrc`), or open a new terminal |
| `which compact` shows unexpected path | Multiple installations | Remove the unwanted binary, check PATH order |

### Compiler Not Found

| Error | Cause | Fix |
|-------|-------|-----|
| `Error: Failed to run compactc` / `No default compiler set` | No compiler installed, or custom `--directory` with no compiler | Run `compact update` (with `--directory` if applicable) |
| `Couldn't find compiler for <arch> (<version>)` / `Directory does not exist` | Requested version not installed for this platform | Run `compact update <VERSION>` to install it |
| `Binary file not found` | Corrupt or incomplete installation | Run `compact clean` then `compact update` to reinstall |

### Version Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid version format` | Partial version used with `+VERSION` syntax | Use full semver: `+0.29.0` not `+0.29` |
| `Couldn't find version X` | Version doesn't exist remotely | Run `compact list` to see available versions |
| `language version X mismatch` | Compiler version doesn't match the `pragma language_version` in source | Use the correct compiler version (`compact compile +VERSION`) or update the pragma |

### Compilation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `parse error: found "X" looking for Y` | Syntax error in source | Fix the source at the indicated line and column |
| `parse error: found keyword "X" (which is reserved for future use)` | Identifier uses a reserved keyword | Rename the identifier |
| `expected right-hand side of = to have type X but received Y` | Type mismatch | Cast or adjust the expression to match the expected type |
| `potential witness-value disclosure must be declared` | Circuit discloses a witness value to the ledger without declaring it | Add the required disclosure declaration |
| `unbound identifier X` | Undefined type or variable | Check spelling; may be a renamed identifier across compiler versions (e.g. `NativePoint` → `JubjubPoint`) |
| `error opening source file: failed for X: no such file or directory` | Source file doesn't exist | Check the file path |
| `compiler toolchain was terminated by a signal` | Compiler crashed (OOM, segfault) | Check system memory; try `--skip-zk` to reduce memory usage; report the bug |
| Compilation very slow | ZK proving key generation | Use `--skip-zk` during development |

### Formatting and Fixup Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Error: formatting failed` with diff output | `--check` detected files that need formatting | Expected behavior — run `compact format` to fix, or this is your CI check working |
| `Error: formatting failed` without diff | Source file has parse errors, or non-`.compact` file passed | Fix parse errors in source; only pass `.compact` files |
| `Error: fixup failed` | Source has parse errors, or fixup could not process the file | Fix parse errors first, then re-run fixup |

### Network and GitHub API

| Error | Cause | Fix |
|-------|-------|-----|
| `Error while fetching compact releases` | Cannot reach GitHub API | Check internet connectivity; check proxy settings |
| `compact update` / `compact list` hangs | Network timeout, firewall blocking github.com | Check connectivity; try `curl -I https://api.github.com` |
| `Using cached data due to GitHub rate limit` | Unauthenticated API rate limit (60 req/hr) exceeded | Set `GITHUB_TOKEN` env var: `export GITHUB_TOKEN=$(gh auth token)` |
| Stale results from `compact list` | 15-minute API response cache | Run `compact clean --cache` to clear, then retry |
| `artifact Extraction failed` | Downloaded zip is corrupt or `unzip` not available | Ensure `unzip` is installed; retry the download |

### Unknown Subcommand

| Error | Cause | Fix |
|-------|-------|-----|
| `error: unrecognized subcommand 'X'` | Typo or invalid command | Check spelling; run `compact --help` for valid commands. Note: partial prefixes work (e.g. `compact comp` = `compact compile`) |
