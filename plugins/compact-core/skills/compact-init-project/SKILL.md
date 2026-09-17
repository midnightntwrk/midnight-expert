---
name: compact-core:compact-init-project
description: This skill should be used when the user asks to create a new Midnight project, scaffold a Compact smart contract project, initialize a DApp, set up a new Midnight application, start a new project, use a project template, or set up a Midnight development environment for the first time. Also triggered by "new project", "start a project", "init project", "scaffold", or "create-mn-app" (the former scaffolding tool, now replaced by this skill's built-in generator).
version: 0.2.0
---

# Initialize a New Midnight/Compact Project

This skill scaffolds a new, self-contained Midnight project using a **vendored, deterministic
generator** bundled with the skill (`scripts/new-example.mjs` + `templates/example/`). It replaces the
former `create-mn-app` tool: the generator is zero-dependency (Node built-ins only), fetches nothing,
and produces byte-identical output for the same inputs. Follow the workflow in
`references/new-example-workflow.md` step by step.

> Note: `create-mn-app` is being sunset. If a user asks for it by name, route them here — this skill's
> generator is its replacement.

## What Gets Scaffolded

| Template | Description |
|----------|-------------|
| **example** (default, and only) | A self-contained Midnight project: a Compact contract stub, a TypeScript test harness (vitest), and a local Docker network. The user writes the contract and test bodies. Pass `--witnesses` to also generate a `witnesses.ts` stub for contracts with off-chain private logic. |

## Quick Start

Follow `references/new-example-workflow.md` phases in order:

1. **Environment Check** — Run `/midnight-tooling:doctor` to verify Node 22+, Docker, and Compact CLI
2. **Project Setup** — Get a kebab-case project name; decide whether the contract needs witnesses
3. **Scaffolding** — Resolve the plugin root, then run `node "$PLUGIN_ROOT/skills/compact-init-project/scripts/new-example.mjs" <name> [--witnesses]`
4. **Local Network** — `cd <name> && yarn install && yarn env:up` (the project ships its own `compose.yml`)
5. **Compile** — Write the contract, then `yarn compile`; verify `contract/managed/<name>/`
6. **Summary** — Show what was created, the available scripts, and the test-run flow

## Key Dependencies

This skill delegates to midnight-tooling plugin commands:
- `/midnight-tooling:doctor` — prerequisite verification
- `/midnight-tooling:install-cli` — Compact compiler installation (if needed)
- `/midnight-tooling:proof-server` — proof server / Docker troubleshooting
- `/midnight-tooling:devnet` — optional shared local devnet (alternative to the project's bundled `compose.yml`)

## Not For

- Existing project troubleshooting → use `midnight-tooling:troubleshooting`
- Writing custom Compact contracts → use `compact-structure`, `compact-ledger`, etc.
- Deploying to a remote network → out of scope (the scaffold's tests can target Preview/Preprod with a funded seed, but wallet creation and funding are separate)
- Adding features to an existing project → use domain-specific compact-core skills

## Reference Files

| Topic | Reference |
|-------|-----------|
| Step-by-step workflow (follow this) | `references/new-example-workflow.md` |
| Project layout, SDK/toolchain versions, network URLs | `references/project-structure.md` |
| Common init failures and fixes | `references/troubleshooting.md` |

## Bundled Assets

| Asset | Path |
|-------|------|
| Deterministic scaffolder | `scripts/new-example.mjs` |
| Project template tree | `templates/example/` |
