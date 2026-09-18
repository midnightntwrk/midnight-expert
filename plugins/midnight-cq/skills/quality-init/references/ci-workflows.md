# CI Workflows Reference

> **Last verified:** 2026-09-17 — `midnightntwrk/setup-compact-action` with `compact-version: '0.31.1'`; compile step uses the `compact compile` CLI (verified against setup-compact-action source + installed CLI 0.5.1).

## Two-Workflow Architecture

Midnight projects split CI into two workflows that serve different purposes:

| Workflow | File | Trigger | Speed | Purpose |
|----------|------|---------|-------|---------|
| Format and Lint | `checks.yml` | Every push and PR | Fast (~30s) | Catch formatting and lint violations immediately |
| Test Suite | `test.yml` | Push to main and PRs (with path filter) | Slower (~5-15 min) | Compile contracts, type-check, run tests |

Why two workflows instead of one:

1. **Fast feedback** -- `checks.yml` finishes in under a minute. Developers see lint failures before the longer test suite even starts.
2. **Path filtering** -- `test.yml` skips entirely for documentation-only changes. `checks.yml` always runs because even markdown changes should be lint-checked.
3. **Failure isolation** -- a lint failure and a test failure are separate problems. Separate workflows make the failure source obvious in the GitHub UI.

## checks.yml Template

```yaml
name: Format and Lint

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  checks:
    name: Run Checks
    runs-on: ubuntu-24.04
    permissions:
      contents: read

    steps:
      - name: Check out code
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Format & Lint
        run: npx biome ci --changed --no-errors-on-unmatched
```

Key details:

- `fetch-depth: 2` -- Biome needs the parent commit to determine what changed. A depth of 2 is sufficient.
- `--changed` -- only checks files that differ from the default branch, keeping the check fast.
- `--no-errors-on-unmatched` -- prevents failure when no files match (e.g., a commit that only changes `.compact` files which are excluded from Biome).
- `node-version-file: '.nvmrc'` -- reads the Node version from the project's `.nvmrc` file, ensuring CI matches the development environment.
- `npm ci` -- clean install from lockfile, faster and more reproducible than `npm install`.

## test.yml Template

```yaml
name: Test Suite

on:
  pull_request:
    paths-ignore:
      - '**.md'
      - '.gitignore'
      - 'biome.json'
  push:
    branches:
      - main
    paths-ignore:
      - '**.md'
      - '.gitignore'
      - 'biome.json'

env:
  SKIP_ZK: 'true'

jobs:
  test:
    name: Run Test Suite
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    timeout-minutes: 15

    steps:
      - name: Check out code
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Compact Compiler
        uses: midnightntwrk/setup-compact-action@v1
        with:
          compact-version: '0.31.1'

      - name: Compile contracts
        run: compact compile --skip-zk

      - name: Run type checks
        run: npx tsc --noEmit

      - name: Run tests
        run: npx vitest run
```

Key details:

- `paths-ignore` -- skips the entire workflow for changes that cannot affect test outcomes (markdown, gitignore, biome config).
- `SKIP_ZK: 'true'` -- environment variable that tells the Compact compiler to skip zero-knowledge proof generation. ZK compilation is extremely slow and not needed for unit tests.
- `timeout-minutes: 15` -- prevents runaway jobs from consuming CI minutes. Compact compilation plus tests should complete well within 15 minutes.
- `setup-compact-action` -- installs the Compact compiler binary. Pin the version to match your project's requirements.
- Sequential steps: compile, then type-check, then test. Each step depends on the previous one succeeding.

## Playwright E2E Job (for DApps)

If the project includes a frontend DApp, add an E2E job to `test.yml`:

```yaml
  e2e:
    name: E2E Tests
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    timeout-minutes: 15

    steps:
      - name: Check out code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install chromium --with-deps

      - name: Run E2E tests
        run: npx playwright test
        env:
          CI: 'true'

      - name: Upload test report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Key details:

- `--with-deps` -- installs system dependencies required by Chromium on Ubuntu (fonts, libraries).
- `CI: 'true'` -- Playwright config uses this to control `reuseExistingServer` and worker count.
- Artifact upload on failure -- the HTML report is uploaded only when tests fail, providing debugging artifacts without wasting storage on passing runs.
- This job runs in parallel with the unit test job since they are independent.

## Path Filtering

The `paths-ignore` configuration prevents unnecessary CI runs:

```yaml
paths-ignore:
  - '**.md'        # Documentation changes do not affect tests
  - '.gitignore'   # Git config changes do not affect tests
  - 'biome.json'   # Lint config changes are caught by checks.yml
```

Why these specific paths:

| Pattern | Reason |
|---------|--------|
| `**.md` | Markdown files are documentation. They cannot break tests. |
| `.gitignore` | Git ignore rules do not affect runtime behavior. |
| `biome.json` | Biome config changes are validated by `checks.yml`. They do not affect test outcomes. |

Do not add `package.json` or `tsconfig.json` to `paths-ignore` -- changes to these files can break compilation and tests.

For monorepos or projects with many independent packages, consider using `paths` (include filter) instead of `paths-ignore` to run tests only when relevant source files change:

```yaml
on:
  pull_request:
    paths:
      - 'src/**'
      - 'test/**'
      - 'package.json'
      - 'tsconfig.json'
      - '*.compact'
```
