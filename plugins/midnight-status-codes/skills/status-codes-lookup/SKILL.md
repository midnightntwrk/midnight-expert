---
name: midnight-status-codes:status-codes-lookup
description: >-
  Fast script-based lookup of Midnight error codes, status codes, and error
  types across all ecosystem components. Supports exact code lookup, regex
  search, source filtering, and category browsing. Use when you need to
  quickly identify what an error code means without reading full reference
  files.
---

# Midnight Status Code Lookup

A script-based tool for fast error code identification across the Midnight ecosystem.

## Script Location

```
${CLAUDE_SKILL_DIR}/scripts/lookup.sh
```

The script requires `jq` to be installed. It reads `codes.json` from the same directory.

## Modes

### Exact Code Lookup

Find a specific error by its code number, error name, or known alias:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --code 166
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --code ContractRuntimeError
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --code "InvalidTransaction::Custom(166)"
```

Matching is case-insensitive. Searches across `code`, `name`, and `aliases` fields.

### Regex Search

Search across names, descriptions, aliases, codes, and categories using a regex pattern:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --search "network.*id"
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --search "insufficient"
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --search "dust.*spend"
```

If 5 or fewer results match, each is shown in full detail. If more than 5 match, results are shown as a compact table.

### List by Source

List all error codes emitted by a specific component:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --source midnight-node
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --source compact-compiler
```

Available sources: `compact-compiler`, `compact-js-sdk`, `compact-runtime`, `dapp-connector`, `jsonrpc-2.0`, `midnight-indexer`, `midnight-js`, `midnight-node`, `midnight-wallet`, `partner-chains`, `proof-server`, `substrate`.

### List All Sources

Show all available sources with entry counts:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --sources
```

### List by Category

List all error codes in a specific category:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --category transaction-malformed
bash ${CLAUDE_SKILL_DIR}/scripts/lookup.sh --category deserialization
```

## Output Format

### Detailed Match (from `--code` or `--search` with ≤5 results)

```
=== MATCH: <source> / <code> ===
Code: <code>
Name: <name>
Source: <source>
Phase: <pipeline phase>            # compact-compiler entries only
ID: <stable slug>
Category: <group name>
Category Description: <group description>
Severity: <error|warning|info>
Status: <retired>                       # only present when status == "retired"
Superseded by: <codes>                  # only present when superseded_by is non-empty
Class: <Error|TypeError|TaggedError:*>  # only present on SDK/JS entries with a class field
Description: <what this error means>
Fixes:
  - <actionable fix suggestion>
  - <another suggestion>
Aliases: <comma-separated alternative names>
See Also: <related codes>
Verified: <repo>@<ref> · anchor: <file:line>
Reference: <plugin-relative path>#<heading-slug>
--- Begin reference section ---
<resolved anchor body from the referenced markdown file>
--- End reference section ---
===
```

The reference body between the `--- Begin reference section ---` and `--- End reference section ---` markers is resolved mechanically by `resolve-anchor.sh`: the script locates the heading whose slug matches the URL fragment in `reference_anchor` and copies the bytes from that heading down to (but not including) the next heading at the same or shallower depth. There is no LLM summarisation in this path. If the anchor cannot be resolved, lookup output prints `Reference: BROKEN` (or `(anchor resolution failed: <reason>)` inside the section block) instead of silently producing prose -- treat that as a data bug to fix in `codes.json`, not as an answer.

### Compact Table (from `--source`, `--category`, or `--search` with >5 results)

```
=== SOURCE: <name> (<N> entries) ===
Code | Name | Category | Severity
---- | ---- | -------- | --------
166  | InvalidNetworkId | transaction-malformed | error
...
===
```

## Interpreting Results

- **Source** tells you which component emitted the error. This determines where to investigate.
- **Category** groups related errors. The **Category Description** explains what all errors in that group have in common.
- **Fixes** are ordered by likelihood -- try the first suggestion first.
- **Aliases** are alternative names the same error is known by in different contexts (e.g., the Rust path vs. the Substrate encoding).
- **See Also** points to related errors that often co-occur or share root causes.
- **Severity**: `error` = must be resolved, `warning` = should investigate, `info` = informational status.
- **Status: retired** means the code is no longer emitted by current source but older deployed components may still surface it; the linked `Superseded by` codes are the current replacements and are the right targets for new error handling.
- **Class** appears only for JavaScript/TypeScript SDK entries. `null` or absence means the throw site uses a bare `Error` / `TypeError` with no class identity, so message-substring matching is the only way to disambiguate.

## Phase axis (compact-compiler entries)

Compact-compiler entries carry an additional `phase` field naming the pipeline stage that produced the diagnostic. Phases narrow investigation to a small set of upstream source files in `LFDT-Minokawa/compact`:

| Phase | Source files | Examples |
|---|---|---|
| `lexer` | `compiler/lexer.ss` | unexpected EOF, invalid leading zero |
| `parser` | `compiler/parser.ss` | parse error, unrecognized pragma |
| `frontend` | `compiler/frontend-passes.ss` | include cycle, return in for |
| `name-res` | `compiler/analysis-passes.ss` (early) | unbound identifier, no such export |
| `type-check` | `compiler/analysis-passes.ss`, `circuit-passes.ss` | branch type mismatch, no compatible function |
| `witness` | `compiler/analysis-passes.ss` | undeclared witness disclosure |
| `purity` | `compiler/analysis-passes.ss` | exported circuit modifies sealed field |
| `zkir` | `compiler/zkir-passes.ss`, `zkir-v3-passes.ss`, `passes.ss` | cross-contract not supported, ZKIR non-zero exit |
| `exit` | `compiler/program-common.ss` | exit:0 / exit:1 / exit:254 / exit:255 |
| `runtime` | `runtime/src/error.ts` | failed assert, version mismatch |
| `external` | various | malformed contract-info file, source-file I/O |

Diagnostics from other components do not use `phase`.

## Coverage audit

`audit-compiler-coverage.sh` is the regression guard for compiler bumps. It walks the upstream compiler tree pinned to `verified_against.ref` (currently `compactc-v0.31.1`), extracts every diagnostic template the compiler can emit, and reports any template that is not covered by some entry's `code`/`aliases` and not explicitly waived in `coverage-allowlist.txt`.

Run it with:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/audit-compiler-coverage.sh
```

The script clones the upstream compiler into `/tmp/compact-stable-<ref>` if no local clone is present, so the first run on a fresh machine takes longer. The expected future bump workflow is: bump `verified_against.ref` on a representative compiler entry, re-run the audit, then hand-curate the delta of newly-uncovered templates into fresh entries (or onto the allowlist with justification).

## When to Use This vs. Reference Files

Use this lookup when you have a specific error code or message and need a quick answer. Use the `midnight-status-codes:status-codes` skill's reference files when you need deep context about an error category, want to understand the error hierarchy, or need to browse all errors from a component.
