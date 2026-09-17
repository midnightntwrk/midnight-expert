# Compiling, Formatting, and Fixup

> **Last verified:** 2026-09-17 against `compact` CLI 0.5.1 / compiler 0.31.1 — flags and output tree (`--skip-zk` emits `compiler/`, `contract/`, `zkir/`; `keys/` only on full build) verified against the installed toolchain.

## Compiling

### Basic Compilation

```bash
compact compile <source-path> <target-directory>
```

- `<source-path>`: Path to the `.compact` source file
- `<target-directory>`: Directory where output files are written (created if it doesn't exist)

### Compiler Output

With `--skip-zk`:

```
<target-directory>/
├── compiler/
│   └── contract-info.json       # Compiler metadata
├── contract/
│   ├── index.d.ts               # TypeScript type definitions
│   ├── index.js                 # Generated JavaScript contract code
│   └── index.js.map             # Source map
└── zkir/                        # ZKIR circuit files (emitted even with --skip-zk)
```

`--skip-zk` skips only proving/verifier **key** generation. ZKIR circuit files (`zkir/`) are emitted either way. Without `--skip-zk`, the output additionally includes a `keys/` directory with the proving and verifier keys. Key generation can be very slow — use `--skip-zk` during development and only generate keys for final builds or testing.

### Version-Specific Compilation

Prefix with `+VERSION` using **full semver** (partial versions are not accepted):

```bash
# Works
compact compile +0.29.0 src/contract.compact build/

# Fails — partial version
compact compile +0.29 src/contract.compact build/
# Error: Invalid version format
```

The specified version must already be installed. Install it with `compact update 0.29.0` first.

### Compiler Flags

These flags are passed through to the compiler binary:

| Flag | Purpose |
|------|---------|
| `--version` | Print compiler version |
| `--language-version` | Print language version |
| `--ledger-version` | Print target ledger version |
| `--runtime-version` | Print required Compact runtime JS package version |
| `--skip-zk` | Skip proving key generation (faster development builds) |
| `--no-communications-commitment` | Omit contract communications commitment |
| `--sourceRoot <path>` | Override sourceRoot in generated source maps |
| `--compact-path <search-list>` | Set import search path (colon-separated; semicolon on Windows) |
| `--trace-search` | Print where the compiler looks for included/imported files |
| `--vscode` | Format errors as single lines for VS Code extension |
| `--trace-passes` | Print compiler tracing (for compiler developers) |

### Import Search Paths

For multi-file contracts with includes or imports, the compiler searches:
1. Relative to the directory of the including/importing file
2. Each directory in the compact path, left to right

Set the compact path via:
- `--compact-path <dir1>:<dir2>` flag on the compile command
- `COMPACT_PATH` environment variable (used when `--compact-path` is not set)

## Formatting

### Basic Usage

```bash
compact format              # All .compact files in current directory (recursive)
compact format src/         # All .compact files in src/ (recursive)
compact format file.compact # Specific file
```

When scanning directories, `compact format` respects `.gitignore` rules — ignored files are skipped.

### Check Mode

```bash
compact format --check
```

Exits `0` if all files are formatted. Exits `1` with "Error: formatting failed" and a diff if any file needs formatting. Despite the error message, this is normal `--check` behavior — it means formatting changes are needed, not that the tool is broken.

### Verbose Mode

```bash
compact format --verbose
# file.compact: unchanged
# other.compact: formatted
```

### CI Integration

```yaml
# GitHub Actions
- name: Check Compact formatting
  run: compact format --check
```

Note: exit code `1` from `--check` means "files need formatting" — treat this as a failing check, not an error.

## Fixup

The `compact fixup` command applies source-level transformations to Compact files, such as renaming deprecated identifiers across language versions (e.g. `NativePoint` → `JubjubPoint`).

### Basic Usage

```bash
compact fixup              # All .compact files in current directory (recursive)
compact fixup file.compact # Specific file
```

Like `format`, directory scanning respects `.gitignore`.

### Check Mode

```bash
compact fixup --check
```

Same behavior as `format --check` — exits `0` if no changes needed, `1` with a diff if fixups are required.

### Flags

| Flag | Purpose |
|------|---------|
| `--check` / `-c` | Check without changing files |
| `--update-Uint-ranges` | Adjust Uint range endpoints |
| `--vscode` | Format errors as single lines for VS Code |
| `--verbose` / `-v` | Print each file processed |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `parse error: found "X" looking for Y` | Syntax error in source | Fix the source code at the indicated line/column |
| `parse error: found keyword "X" (which is reserved for future use)` | Using a reserved keyword as identifier | Rename the identifier |
| `expected right-hand side of = to have type X but received Y` | Type mismatch in assignment | Cast or adjust the expression to match the expected type |
| `potential witness-value disclosure must be declared` | Undeclared witness disclosure | Add the required disclosure declaration to the circuit |
| `language version X mismatch` | Compiler version doesn't match `pragma language_version` in source | Use the right compiler version (`compact compile +VERSION`) or update the pragma |
| `Error: Failed to run compactc` / `No default compiler set` | No compiler installed | Run `compact update` |
| `Couldn't find compiler for <arch> (<version>)` | Requested version not installed | Run `compact update <VERSION>` first |
| `Invalid version format` | Partial version used with `+VERSION` | Use full semver: `+0.29.0` not `+0.29` |
| `formatting failed` / `fixup failed` | Source has parse errors, OR `--check` detected changes needed | If using `--check`, this is expected — changes are needed. Otherwise, fix parse errors in source |
| Compilation very slow | ZK proving key generation | Use `--skip-zk` during development |
| Non-.compact file passed to format/fixup | Format/fixup only process `.compact` files | Only pass `.compact` files or directories containing them |
