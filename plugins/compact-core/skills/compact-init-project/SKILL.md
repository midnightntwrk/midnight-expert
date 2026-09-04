---
name: compact-core:compact-init-project
description: This skill should be used when the user asks to create a new Midnight project, scaffold a Compact smart contract project, use create-mn-app, initialize a DApp, set up a new Midnight application, start a new project, use a project template, set up the hello-world template, or set up a Midnight development environment for the first time. Also triggered by "new project", "start a project", "init project", "create-mn-app", or "scaffold".
version: 0.1.0
---

# Initialize a New Midnight/Compact Project

This skill guides you through creating a new Midnight project using `create-mn-app`, the official scaffolding tool. Follow the workflow in `references/create-mn-app-workflow.md` step by step.

## Supported Templates

| Template | Type | Description |
|----------|------|-------------|
| **Hello World** | Bundled | Simple message storage contract. Best for first-time Midnight developers. |

## Quick Start

Follow `references/create-mn-app-workflow.md` phases in order:

1. **Environment Check** — Run `/midnight-tooling:doctor` to verify Node 22+, Docker, and Compact CLI
2. **Project Setup** — Confirm the Hello World template and get a project name
3. **Scaffolding** — Run `npx create-mn-app@latest <name> --template hello-world`
4. **Proof Server** — Run `/midnight-tooling:devnet start` to start Docker proof server
5. **Compile** — Compile the Compact contract and verify managed output
6. **Summary** — Show what was created and next steps

## Key Dependencies

This skill delegates to midnight-tooling plugin commands:
- `/midnight-tooling:doctor` — prerequisite verification
- `/midnight-tooling:devnet start` — Docker proof server lifecycle
- `/midnight-tooling:install-cli` — Compact compiler installation (if needed)

## Not For

- Existing project troubleshooting → use `midnight-tooling:troubleshooting`
- Writing custom Compact contracts → use `compact-structure`, `compact-ledger`, etc.
- Deploying to Preprod → out of scope (involves wallet creation and faucet funding)
- Adding features to an existing project → use domain-specific compact-core skills

## Reference Files

| Topic | Reference |
|-------|-----------|
| Step-by-step workflow (follow this) | `references/create-mn-app-workflow.md` |
| Project layouts, SDK versions, network URLs | `references/project-structure.md` |
| Common init failures and fixes | `references/troubleshooting.md` |
