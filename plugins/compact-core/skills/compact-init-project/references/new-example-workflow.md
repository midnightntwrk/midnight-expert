# New Project Workflow

This is a step-by-step procedural workflow. Follow each phase in order. Do not skip phases.

The project is scaffolded by a **vendored, deterministic generator** shipped inside this skill
(`scripts/new-example.mjs` + `templates/example/`). It is zero-dependency (Node built-ins only) and
produces byte-identical output for the same inputs — no network fetch, no template download. It creates the most lightweight way possible to generate Compact and test that compact on a local devnet.

## Phase 1 — Environment Check

Run `/midnight-tooling:doctor` to verify the development environment is ready.

**Required passes:**
- Node.js 22+ installed
- Docker Desktop installed and running
- Compact CLI installed with a compiler version available

**If any check FAILs:**
1. Report the failures to the user
2. For missing Compact CLI: run `/midnight-tooling:install-cli`
3. For Docker issues: refer to `/midnight-tooling:proof-server` skill
4. For Node.js issues: user must install Node.js 22+ from https://nodejs.org/
5. Re-run `/midnight-tooling:doctor` after fixes to confirm

**If all checks PASS or WARN:** proceed to Phase 2.

## Phase 2 — Project Setup

The skill scaffolds a single **example** template — a self-contained Midnight project with a Compact
contract, a TypeScript test harness, and a local-network Docker setup. It is the right starting point
for first-time Midnight developers; the user writes the contract and test bodies after scaffolding.

If the user has not specified a project name, ask for one. Default suggestion: `my-midnight-app`.
Names must be **kebab-case** (lowercase letters/digits, hyphen-separated) — the generator rejects
anything else.

Ask whether the contract will declare **witnesses** (off-chain private logic). If yes, the generator
is run with `--witnesses` to add a `contract/witnesses.ts` stub and wire `withWitnesses(...)`. When in
doubt, scaffold witness-free — witnesses can be added later.

## Phase 3 — Project Scaffolding

The generator and its template live inside this plugin's installation directory. Because
`${CLAUDE_PLUGIN_ROOT}` does not expand in markdown, resolve the path at runtime, then run the script
from the directory where the project should be created:

```bash
# Match both the plain layout and the versioned plugin-cache layout
# (.../compact-core/<version>/.claude-plugin/plugin.json).
PLUGIN_ROOT=$(find ~/.claude \( -path "*/compact-core/.claude-plugin/plugin.json" -o -path "*/compact-core/*/.claude-plugin/plugin.json" \) 2>/dev/null | head -1 | xargs -r dirname | xargs -r dirname)
SCAFFOLD="${PLUGIN_ROOT}/skills/compact-init-project/scripts/new-example.mjs"
[ -n "$PLUGIN_ROOT" ] && [ -f "$SCAFFOLD" ] && echo "generator found: $SCAFFOLD" || echo "ERROR: generator not found"
```

If the generator is not found, report the error and stop. Otherwise run it (add `--witnesses` only if
Phase 2 determined the contract needs them):

```bash
node "$SCAFFOLD" <project-name>            # witness-free
node "$SCAFFOLD" <project-name> --witnesses  # with a witnesses.ts stub
```

The generator:
1. Validates the name (kebab-case) and that `./<project-name>/` does not already exist
2. Copies the template tree into `./<project-name>/`, substituting the project name
3. Prints the created files and next steps

It does **not** install dependencies, compile, run Docker, or touch git — those are the explicit steps
below.

### Verify scaffolding

```bash
ls <project-name>/
```

Expect: `contract/`, `src/`, `compose.yml`, `package.json`, `tsconfig.json`, `vitest.config.ts`,
`.gitignore`, `README.md` (and `contract/witnesses.ts` when `--witnesses` was used).

## Phase 4 — Local Midnight Network

The project ships its own `compose.yml` (node + indexer + proof server), so it is self-contained.
Ensure Docker is running, then start the network from inside the project:

```bash
cd <project-name>
yarn install        # or: npm install
yarn env:up
```

`yarn env:up` brings up all three containers and waits for their health checks. The proof server runs
on port 6300.

**Alternatives:** `/midnight-tooling:doctor` diagnoses Docker/port issues; `/midnight-tooling:devnet`
manages a shared local devnet if the user prefers one over the project's bundled `compose.yml`.

**If containers fail to start:** consult `references/troubleshooting.md`.

## Phase 5 — Write & Compile the Contract

The scaffolded `contract/<name>.compact` is a TODO stub. The user writes their contract there (point
them to `compact-structure`, `compact-ledger`, etc. — see below). Then compile:

```bash
yarn compile
```

This runs `compact compile contract/<name>.compact contract/managed/<name>`. Verify output:

```bash
ls contract/managed/<name>/
```

Expected directories: `compiler/`, `contract/`, `keys/`, `zkir/`.

**Note:** First compilation downloads ZK parameters (a large download) and may take several minutes.
The generated TypeScript harness imports from `contract/managed/<name>/`, so nothing type-checks until
the contract has compiled at least once.

## Phase 6 — Summary & Next Steps

After successful scaffolding and compilation, present the user with:

### What was created

- Standalone project at `./<project-name>/`
- Compact contract stub at `contract/<project-name>.compact` (the user fills this in)
- Compiled artifacts in `contract/managed/<project-name>/` (after `yarn compile`)
- A test harness (`src/`) and a test skeleton at `src/test/<project-name>.test.ts` up to the first
  `deployContract` call
- Local network via `compose.yml`

### Available scripts

- `yarn compile` — compile the Compact contract
- `yarn env:up` / `yarn env:down` — start/stop the full local network
- `yarn proof:up` / `yarn proof:down` — start/stop just the proof server
- `yarn wait:dust` — block until the dev wallet has spendable DUST for fees
- `yarn test:local` — run the vitest suite against the local network
- `yarn test:preview` / `yarn test:preprod` — run against a remote network (needs a funded seed in
  `.env.<network>`)
- `yarn validate` — env:up + wait:dust + test:local + env:down in one shot

### Run the test end-to-end

```bash
yarn env:up && yarn wait:dust && yarn test:local && yarn env:down
```

The generated test deploys the contract and asserts a contract address. The user adds
circuit-interaction tests following the commented example in `src/test/<name>.test.ts`.

### Relevant skills for writing contracts

Point the user to these compact-core skills for authoring their contract:
- `compact-structure` — Contract anatomy, pragma, types, circuits, witnesses
- `compact-ledger` — On-chain state design, ADT operations
- `compact-privacy-disclosure` — Privacy patterns, disclose() rules
- `compact-witness-ts` — TypeScript witness implementation (relevant when scaffolded with `--witnesses`)
