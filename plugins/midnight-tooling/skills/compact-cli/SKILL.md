---
name: midnight-tooling:compact-cli
description: >-
  This skill should be used when the user asks about the Compact CLI, Compact
  Dev Tool, Compact Developer CLI, or compact devtools for Midnight Network
  smart contract development, including setting up the Compact toolchain on a
  new machine, resolving "compact: command not found" or "No default compiler
  set" errors, validating that Compact source code compiles correctly, switching
  between compiler versions, pinning a project to a specific compiler version,
  understanding why compilation is slow or how to speed it up, figuring out
  which version of the compiler or language they're running, setting up a
  project-local toolchain directory, configuring import search paths for
  multi-file contracts, understanding error messages or exit codes from the
  compiler or formatter, setting up or uninstalling the Compact toolchain,
  resolving GitHub API rate limiting when listing or updating versions,
  or troubleshooting why format or fixup is reporting failures
---

# Compact CLI Management

> **Last verified:** 2026-09-17 against `compact` CLI 0.5.1 / compiler 0.31.1 — documented commands, flags, version outputs, and exit codes run against the installed toolchain.

The Compact CLI (`compact`) is the command-line tool for managing the Midnight Network's smart contract development toolchain. It handles compiler version management, code formatting, fixup transformations, and compiler invocation.

## **Terminology — Read This First**

> **Three distinct things share the "Compact" name. Always be precise about which is being referenced.**

| Term | What It Is | Binary / Location | Version Command |
|------|-----------|-------------------|-----------------|
| **Compact CLI** | The command-line management tool (also called Compact Dev Tool, Compact Developer CLI, compact devtools) | `compact` (typically `~/.local/bin/compact`) | `compact --version` |
| **Compact** (language) | The smart contract programming language | Source files: `*.compact` | N/A |
| **Compact compiler** | The compiler that transforms Compact source into ZK circuits and TypeScript | `compactc.bin` (managed by CLI, stored in `$COMPACT_DIRECTORY`) | `compact compile --version` |

**Relationship**: The Compact CLI manages and invokes the Compact compiler, which compiles Compact (the language) source files. The CLI is the orchestrator; the compiler is the worker it manages.

When users say "install Compact", they typically mean installing the Compact CLI (which then manages the compiler). When they say "update Compact", determine whether they mean:
- **The CLI tool itself** → `compact self update`
- **The compiler** → `compact update`

These are independent operations. The CLI and compiler have separate version numbers.

## Version Reporting

The toolchain reports three independent version numbers. Confusing them is a common source of errors.

| What | Commands | Example Output |
|------|----------|----------------|
| **CLI tool version** | `compact --version` (or `compact self`) | `compact 0.5.1` |
| **Compiler version** | `compact compile --version`, `compact format --version`, `compact fixup --version` | `0.31.1` |
| **Language version** | `compact compile --language-version`, `compact format --language-version`, `compact fixup --language-version` | `0.23.0` |

The compiler also reports two additional versions relevant to DApp developers:

| What | Command | Example Output |
|------|---------|----------------|
| **Ledger version** | `compact compile -- --ledger-version` | `ledger-8.0.2` |
| **Runtime JS package version** | `compact compile -- --runtime-version` | `0.16.0` |

The CLI and compiler update independently:

| What to Update | Command | Check First |
|---------------|---------|-------------|
| The compiler | `compact update` | `compact check` |
| The CLI tool | `compact self update` | `compact self check` |

> ⚠️ **"Latest available" is not "latest supported".** `compact check` may report a newer compiler (currently `0.34.0`) that **is not yet supported on any live network**. Pin to the latest **network-supported** compiler (currently `0.31.1`) for anything you intend to deploy. See [references/version-management.md](references/version-management.md) for details.

## Quick Command Reference

| Command | Aliases | Purpose |
|---------|---------|---------|
| `compact compile <source> <target-dir>` | `c` | Compile a Compact source file |
| `compact compile +<VER> <source> <target-dir>` | | Compile with a specific compiler version (full semver required) |
| `compact format [FILES]` | `f`, `fmt` | Format Compact source files |
| `compact format --check [FILES]` | | Check formatting without changes |
| `compact fixup [FILES]` | `fx`, `fix` | Apply fixup transformations (e.g. rename deprecated identifiers) |
| `compact fixup --check [FILES]` | | Check if fixups are needed without changes |
| `compact update [VERSION]` | `u`, `up` | Download compiler version, set as default |
| `compact list` | `l` | List all available compiler versions (remote) |
| `compact list --installed` | | List locally installed compiler versions |
| `compact check` | `ch` | Check for compiler updates without downloading |
| `compact clean` | `cl` | Remove all installed compiler versions |
| `compact clean --keep-current` | | Remove all except current default version |
| `compact clean --cache` | | Remove **all installed versions** *and* the download cache (add `--keep-current` to preserve the current compiler) |
| `compact update --no-set-default [VERSION]` | | Download compiler version without setting it as default |
| `compact self check` | `s check` | Check for CLI tool updates |
| `compact self update` | `s update` | Update the CLI tool itself |

## Global Flags

Every command accepts these flags:

| Flag | Environment Variable | Purpose |
|------|---------------------|---------|
| `--directory <DIR>` | `COMPACT_DIRECTORY` | Use a custom artifact directory instead of `$HOME/.compact` |

The `--directory` flag can appear before or after the subcommand — both positions are equivalent. When both the flag and environment variable are set, the flag takes precedence. The directory is created automatically if it does not exist.

## Compiling

The CLI invokes the compiler via `compact compile <source> <target-dir>`. Use `--skip-zk` during development to skip proving key generation (significantly faster). Prefix with `+VERSION` (full semver, e.g. `+0.29.0`) to use a specific installed compiler version. See `references/compile-format-fixup.md` for all compiler flags, output structure, import paths, and compilation troubleshooting. See `references/troubleshooting.md` for compilation error messages and exit codes.

## Formatting and Fixup

`compact format` formats `.compact` source files in place. When no files are specified, it recursively formats all `.compact` files in the current directory, respecting `.gitignore`. Use `--check` for CI pipelines (exits non-zero if changes needed).

`compact fixup` applies source-level transformations such as renaming deprecated identifiers. It shares the same file-targeting and `--check` behavior as `format`. See `references/compile-format-fixup.md` for full details on both commands. See `references/troubleshooting.md` for formatting and fixup error messages.

## Version Management

Install, list, switch, and remove compiler versions with `update`, `list`, `check`, and `clean`. The `update` command accepts partial versions (`0`, `0.29`, or `0.29.0`). See `references/version-management.md` for workflows and troubleshooting.

## CLI Self-Management

Update the CLI tool itself with `compact self update`. This is independent of compiler updates. See `references/self-management.md` for details.

## Reference Files

| Reference | When to Read |
|-----------|-------------|
| **`references/installation.md`** | First-time setup, PATH issues, new machine |
| **`references/compile-format-fixup.md`** | Compiling contracts, formatting, fixup, compiler flags |
| **`references/version-management.md`** | Installing, switching, listing, or removing compiler versions |
| **`references/self-management.md`** | Updating the CLI tool, checking versions |
| **`references/troubleshooting.md`** | Error messages, exit codes, common failures |
