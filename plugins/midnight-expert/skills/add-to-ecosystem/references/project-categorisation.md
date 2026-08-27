# Project Categorisation — Detection Signals → EC Category

`scripts/detect-project.sh` scans the project and emits these boolean signals plus a recommended category. This document explains what each signal means and how the recommendation is derived.

## Signals

| Signal | Meaning | How it's detected |
|---|---|---|
| `has_compact_files` | Project contains `*.compact` source files | `find . -name '*.compact' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/target/*'` returns ≥1 result |
| `has_pragma_language_version` | At least one `*.compact` file actually contains Compact source | `grep -l 'pragma language_version' <found .compact files>` returns ≥1 result |
| `has_compact_npm_dep` | Project depends on the Compact runtime/compiler npm packages | Any `package.json` (excluding `node_modules`) lists `@midnight-ntwrk/compact-runtime` or `@midnight-ntwrk/compactc` in `dependencies` or `devDependencies` |
| `has_runtime_npm_dep` | Project depends on Midnight.js runtime providers | Any `package.json` lists `@midnight-ntwrk/midnight-js-contracts`, `@midnight-ntwrk/midnight-js-node-zk-config-provider`, `@midnight-ntwrk/midnight-js-fetch-zk-config-provider`, or `@midnight-ntwrk/midnight-js-http-client-proof-provider` |
| `has_wallet_sdk_npm_dep` | Project depends on the wallet SDK or DApp connector | Any `package.json` lists a package matching `@midnight-ntwrk/wallet*` or `@midnight-ntwrk/dapp-connector-api` |
| `has_dapp_connector_npm_dep` | Project depends specifically on the DApp connector API | Any `package.json` lists `@midnight-ntwrk/dapp-connector-api` |
| `is_claude_plugin` | Project is a Claude Code plugin or marketplace | A `.claude-plugin/plugin.json` exists at the repo root, or any `plugins/*/.claude-plugin/plugin.json` exists |
| `is_cli_tool` | Project ships an executable CLI | Any `package.json` declares a `bin` field, or a `Cargo.toml` contains `[[bin]]`, or a `pyproject.toml` declares `[project.scripts]` |
| `is_template` | Project is a starter/template/scaffold | Repo basename matches `/template\|starter\|scaffold/i`, or first 500 bytes of `README.md` matches the same |

## Recommendation rules

`add_compact_topic` is `true` if and only if **both** `has_compact_files` and `has_pragma_language_version` are `true`. (A `.compact` file extension alone isn't enough — the file must contain actual Compact source.)

`category` is determined in priority order:

1. **`built-on`** — if `has_compact_files` is true OR `has_runtime_npm_dep` is true. The project itself runs on Midnight (it's a dApp, contract, or runtime tool that depends on the runtime providers).
2. **`extends`** — otherwise, if `is_claude_plugin` OR `is_cli_tool` OR `is_template` is true. The project is developer tooling that expands what others can do on Midnight.
3. **`integrates`** — otherwise, if `has_wallet_sdk_npm_dep` OR `has_dapp_connector_npm_dep` is true. The project talks to Midnight via the wallet SDK or DApp connector but isn't itself a contract or runtime tool.
4. **`built-on`** (default) — if no signals match. The user can always pick a different category in the prompt.

## Worked examples

### `midnightntwrk/example-counter` (Compact dApp)

- `has_compact_files`: yes (`contracts/counter.compact`)
- `has_pragma_language_version`: yes
- `has_runtime_npm_dep`: yes (`@midnight-ntwrk/midnight-js-contracts`)
- `is_claude_plugin`: no
- → `add_compact_topic: true`, `category: "built-on"`

### `midnightntwrk/midnight.js` (SDK)

- `has_compact_files`: no
- `has_runtime_npm_dep`: no
- `has_wallet_sdk_npm_dep`: yes (`@midnight-ntwrk/wallet-api`)
- `is_cli_tool`: no
- → `add_compact_topic: false`, `category: "integrates"`

### `midnightntwrk/midnight-expert` (Claude plugin marketplace)

- `has_compact_files`: no
- `has_runtime_npm_dep`: no
- `is_claude_plugin`: yes (`.claude-plugin/plugin.json` in subdirs)
- → `add_compact_topic: false`, `category: "extends"`

### A Compact-using CLI tool

- `has_compact_files`: yes
- `has_pragma_language_version`: yes
- `is_cli_tool`: yes
- → `category: "built-on"` (priority 1 wins; it's a tool that runs on Midnight, not just one that helps build for it)

### A project with zero Midnight signals

- `has_compact_files`: no
- `has_runtime_npm_dep`: no
- `has_wallet_sdk_npm_dep`: no
- `is_claude_plugin`: no
- `is_cli_tool`: no
- `is_template`: no
- → `category: "built-on"` (priority-4 default fallback — the user is expected to override at the prompt if this isn't right)
