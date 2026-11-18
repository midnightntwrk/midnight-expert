---
name: midnight-dapp-dev:init
description: >-
  This skill should be used when the user asks to scaffold a new Midnight DApp
  frontend, create a Vite + React 19 project for Midnight, initialize a UI and
  API package for a Compact contract, set up a shadcn + Tailwind v4 frontend,
  or invokes /midnight-dapp-dev:init. Generates a complete browser DApp scaffold
  with wallet connection, provider assembly, and contract interaction boilerplate.
version: 0.1.0
---

# Initialize Midnight DApp Frontend

Scaffold a Vite 8 + React 19 + shadcn + Tailwind v4 UI package and a TypeScript
API package into the current project. The templates use Midnight.js 5.0.1 and
`@midnightntwrk/dapp-connector-api` 4.1.0, which build the ledger 9
transactions every Midnight network runs.

## Usage

Run the init script:

```bash
bash "${CLAUDE_SKILL_ROOT}/scripts/init.sh" [--ui-name <name>] [--api-name <name>] [--contract-package <pkg>]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--ui-name` | `ui` | UI package directory name |
| `--api-name` | `api` | API package directory name |
| `--contract-package` | Auto-detected or `@{project}/contract` | Contract package name |

The script:
1. Reads the current project's `package.json` to derive the project name
2. Scans for Compact contract packages (directories with `managed/` output)
3. Detects the package manager from lockfile presence
4. Applies CLI arguments or falls back to sensible defaults
5. Copies the template tree from the core skill's `templates/` directory
6. Runs placeholder substitution across all copied files
7. Updates root `package.json` workspaces if applicable

## Prerequisites

- A Midnight project root with a `package.json` (workspace root)
- Node.js and a package manager (npm, yarn, or pnpm — auto-detected from lockfiles)
- The `midnight-dapp-dev:core` skill's `templates/` directory must be accessible

## Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| "Template directory not found" | Templates not accessible from skill directory | Verify the midnight-dapp-dev plugin is installed correctly |
| "Directory already exists" | UI or API directory already present | Choose a different name or remove the existing directory first |
| Script exits non-zero | General failure during scaffolding | Check the error output for the specific failing step |

## After Scaffolding

1. Install dependencies with the detected package manager
2. Configure the `copy-contract-keys` script in the UI `package.json` with the path to the contract's compiled `keys/`, `zkir/` and `compiler/` output. `FetchZkConfigProvider` checks the artifacts against `compiler/contract-manifest.json`, so all three directories must be served
3. Compile the contract with Compact toolchain 0.36.x (`compact-runtime` 0.21.0). Midnight.js 5 refuses artifacts from toolchain 0.31.x with `EraMismatchError`
4. Wire up the contract in the API package's `src/index.ts` and `src/types.ts`: build a `CompiledContract` from `@midnight-ntwrk/midnight-js-protocol/v9/compact-js`, and pass your contract's `ledger()` to `createStateObservable`
5. Set `VITE_NETWORK_ID` in the UI's `.env` (`undeployed` by default, or `preview`, `preprod`, `mainnet`)
6. Run `npm run dev` in the UI directory to start the dev server

## Placeholders

The template uses these `{{PLACEHOLDER}}` variables:

| Variable | Description |
|---|---|
| `{{PROJECT_NAME}}` | Project name from root package.json |
| `{{UI_PACKAGE_NAME}}` | UI package name (derived: `{project}-ui`) |
| `{{API_PACKAGE_NAME}}` | API package name (derived: `{project}-api`) |
| `{{UI_DIR}}` | UI directory name (default: `ui`) |
| `{{API_DIR}}` | API directory name (default: `api`) |
| `{{CONTRACT_PACKAGE}}` | Contract package name (scanned or prompted) |
| `{{PACKAGE_MANAGER}}` | Detected package manager |
