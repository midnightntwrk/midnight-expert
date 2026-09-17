---
name: midnight-cq:quality-init
description: >-
  This skill should be used when the user asks to set up linting, add code
  quality tooling, configure biome, init project quality, initialize code
  quality, add CI workflows, add GitHub Actions, set up git hooks, add
  pre-commit hooks, add testing, add Vitest, add Playwright, or configure
  formatter for a Midnight Network project.
version: 0.1.0
---

# Initialize Code Quality Tooling

> **Last verified:** 2026-09-17 — scaffolded dependency names/versions checked against npm (`@openzeppelin/compact-simulator@0.3.1`); compiler installed via the `compact` toolchain, not npm.

> **Hard rule: Biome exclusively. Never install ESLint or Prettier alongside Biome.**
> If either already exists in the project, migrate and remove them before scaffolding anything else.

This skill guides you through setting up all code quality tooling for a Midnight Network project. Follow the 3-step flow below in order: detect the project type, handle any conflicting tools, then scaffold the appropriate configuration.

## 3-Step Flow

### Step 1 — Detect Project Type

Scan the project root to determine what kind of project this is. Detection is not mutually exclusive — a project can be both a Compact project and a frontend DApp.

| Signal | Meaning |
|--------|---------|
| Any `.compact` file exists | Compact contract project → add Vitest with simulator |
| `package.json` contains `react`, `next`, `vue`, or `svelte` dep | Frontend / DApp → add Playwright E2E |
| `.eslintrc.*` or `.prettierrc.*` (any extension) exists | Conflict detected → migrate before scaffolding |
| `biome.json` already exists | Partial setup → extend rather than overwrite |

Check all signals before proceeding. Record findings; they drive Step 3.

### Step 2 — Detect and Migrate Conflicts

If `.eslintrc.*` or `.prettierrc.*` files are present, migrate them before creating any new config.

**ESLint migration:**

```bash
npx @biomejs/biome migrate eslint --write --include-inspired
```

**Prettier migration:**

```bash
npx @biomejs/biome migrate prettier --write
```

**After migration, remove:**

- All ESLint packages: `eslint`, `@typescript-eslint/*`, `eslint-plugin-*`, `eslint-config-*`
- All Prettier packages: `prettier`, `prettier-plugin-*`
- Config files: `.eslintrc.*`, `.eslintignore`, `.prettierrc.*`, `.prettierignore`
- Remove scripts referencing `eslint` or `prettier` from `package.json`

**Migration limitations — review manually after running:**

| Limitation | Action |
|-----------|--------|
| YAML config files (`.eslintrc.yaml`, `.eslintrc.yml`) | Migrate by hand; the CLI does not parse YAML |
| ESLint rule option gaps | Some rules have no Biome equivalent — log them and close the gap with code review |
| `eslint-disable` comments | Convert to `biome-ignore` or remove if the rule no longer applies |
| Prettier `overrides` per file glob | Reproduce in `biome.json` `overrides` array manually |

If no conflicts are found, skip to Step 3.

### Step 3 — Scaffold Based on Detection

Always scaffold the following regardless of project type:

| Tool | Purpose |
|------|---------|
| `biome.json` | Linting, formatting, and import sorting — single source of truth |
| `.editorconfig` | Cross-editor baseline (indent size, line endings, charset) |
| Husky + `pre-commit` hook | Fast check on staged files: `biome ci --changed` |
| Husky + `pre-push` hook | Full check: `biome ci && tsc --noEmit && vitest run` |
| `.github/workflows/checks.yml` | CI — Biome only, runs on every push and PR |
| `.github/workflows/test.yml` | CI — compile + typecheck + tests, runs on PR and main |

Scaffold conditionally based on detection:

| Condition | Additional Scaffolding |
|-----------|----------------------|
| `.compact` file detected | Vitest + `@openzeppelin/compact-simulator` for contract unit tests |
| Frontend / DApp detected | Playwright (headless only — never interactive) for E2E tests |

## Biome Configuration

Use the OpenZeppelin compact-contracts `biome.json` as the reference implementation. Key settings:

- VCS integration enabled (`vcs.enabled: true`, `vcs.clientKind: "git"`, `vcs.useIgnoreFile: true`)
- Formatter: single quotes, semicolons required, 2-space indent (spaces, not tabs)
- All rules at `"error"` level — warnings are not actionable in CI
- Excludes: `managed/` (Compact compiler output), `dist/`, `node_modules/`, `coverage/`

See `references/biome-config.md` for the full annotated `biome.json` template.

## Husky Hooks

```bash
# Install
npm install --save-dev husky
npx husky init
```

```bash
# .husky/pre-commit — fast staged-file check
npx biome ci --changed
```

```bash
# .husky/pre-push — full suite
npx biome ci && npx tsc --noEmit && npx vitest run
```

The pre-commit hook uses `--changed` to check only staged files, keeping it under 2 seconds on most projects. The pre-push hook runs the full suite to prevent broken code from reaching the remote.

## CI Workflows

Two workflows keep CI fast and targeted:

**`checks.yml`** — fast, runs on every push and pull_request:
- Checkout → install → `biome ci`
- Fails immediately on any lint or format violation

**`test.yml`** — thorough, runs on pull_request and push to `main`:
- Checkout → install → `compact compile` (if Compact project) → `tsc --noEmit` → `vitest run`
- Playwright E2E runs as a separate job within this workflow (if DApp)

See `references/ci-workflows.md` for the full YAML for both workflows.

## Not For

- Running checks on an existing configured project → use `midnight-cq:quality-check`
- Writing Compact contract tests from scratch → use `midnight-cq:compact-testing`
- Writing DApp E2E tests → use `midnight-cq:dapp-testing`
- Debugging a failing CI run → use `midnight-tooling:troubleshooting`

## Reference Files

| Topic | Reference |
|-------|-----------|
| Annotated `biome.json` template with all rule settings, `.editorconfig`, migration procedure | `references/biome-config.md` |
| Vitest config, `globalSetup` for Compact compilation, simulator dependency setup | `references/vitest-config.md` |
| Playwright config (always headless), browser setup, timeouts for blockchain ops | `references/playwright-config.md` |
| Husky setup, pre-commit and pre-push hook scripts | `references/husky-hooks.md` |
| Full CI workflow YAML for `checks.yml` and `test.yml`, path filtering | `references/ci-workflows.md` |
