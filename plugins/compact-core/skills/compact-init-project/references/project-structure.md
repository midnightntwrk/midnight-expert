# Project Structure & Version Reference

## Project Layout

After running the scaffolder (`node <plugin>/skills/compact-init-project/scripts/new-example.mjs <name>`):

```
<name>/
├── contract/
│   ├── <name>.compact                # Contract source stub (pragma language_version 0.23) — you write this
│   └── index.ts                      # Exports the compiled contract + zkConfigPath
│   └── witnesses.ts                  # ONLY when scaffolded with --witnesses (private-state + witness stubs)
├── src/
│   ├── config.ts                     # Network configs (local / preview / preprod)
│   ├── providers.ts                  # Builds the Midnight provider set from the compiled contract
│   ├── wallet.ts                     # MidnightWalletProvider (testkit-js wallet wiring, sync helpers)
│   └── test/
│       └── <name>.test.ts            # Vitest skeleton: deploy + a TODO for circuit-interaction tests
├── scripts/
│   └── wait-for-dust.ts              # Blocks until the dev wallet has spendable DUST for fees
├── compose.yml                       # Local Midnight network: node + indexer + proof server (port 6300)
├── vitest.config.ts                  # Vitest config (long timeouts, serial, node env)
├── package.json                      # Node 22+, type: module, midnight-js 4.1.1 deps
├── tsconfig.json                     # Self-contained (ES2022, moduleResolution bundler, strict)
├── .gitignore
└── README.md
```

After `yarn compile`, the managed output directory is created:

```
contract/managed/<name>/
├── compiler/                         # Contract structure metadata (JSON)
├── contract/                         # Generated JavaScript + TypeScript type definitions
│   ├── index.js                      # Runtime implementation
│   └── index.d.ts                    # Type declarations (Ledger, Witnesses, Contract, etc.)
├── keys/                             # Cryptographic ZK proving and verifying keys (absent with --skip-zk)
└── zkir/                             # Zero-Knowledge Intermediate Representation
```

`contract/managed/` is gitignored — it is a build artifact. The TypeScript harness imports from it, so
nothing type-checks until you have run `yarn compile` at least once.

### Contract Source Stub

The scaffolded `contract/<name>.compact` is a TODO placeholder with a commented minimal example. You
replace it with your contract, for example:

```compact
pragma language_version 0.23;

import CompactStandardLibrary;

export ledger value: Uint<64>;

export circuit set(x: Uint<64>): [] {
  value = disclose(x);
}
```

### package.json Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `compile` | `compact compile contract/<name>.compact contract/managed/<name>` | Compile the Compact contract |
| `test` | `vitest run` (with `--experimental-vm-modules`) | Run the vitest suite (network from `MIDNIGHT_NETWORK`) |
| `test:local` | `MIDNIGHT_NETWORK=local yarn test` | Run against the local Docker network |
| `test:preview` | `MIDNIGHT_NETWORK=preview yarn test` | Run against Preview (needs a funded seed) |
| `test:preprod` | `MIDNIGHT_NETWORK=preprod yarn test` | Run against Preprod (needs a funded seed) |
| `env:up` | `docker compose up -d --wait` | Start node + indexer + proof server |
| `env:down` | `docker compose down` | Stop and remove the local network |
| `proof:up` | `docker compose up -d --wait proof-server` | Start only the proof server |
| `proof:down` | `docker compose stop proof-server` | Stop only the proof server |
| `wait:dust` | `vite-node scripts/wait-for-dust.ts` | Block until the dev wallet has spendable DUST |
| `validate` | `env:up && wait:dust && test:local; env:down` | Full local run in one command |

## SDK Package Versions

These are the versions pinned by the scaffold template (captured 2026-09-16). Versions may have been
updated since — run `npm view <package> version` to check current versions:

| Package | Version |
|---------|---------|
| `@midnight-ntwrk/midnight-js-contracts` | 4.1.1 |
| `@midnight-ntwrk/midnight-js-http-client-proof-provider` | 4.1.1 |
| `@midnight-ntwrk/midnight-js-indexer-public-data-provider` | 4.1.1 |
| `@midnight-ntwrk/midnight-js-level-private-state-provider` | 4.1.1 |
| `@midnight-ntwrk/midnight-js-network-id` | 4.1.1 |
| `@midnight-ntwrk/midnight-js-node-zk-config-provider` | 4.1.1 |
| `@midnight-ntwrk/midnight-js-protocol` | 4.1.1 |
| `@midnight-ntwrk/midnight-js-types` | 4.1.1 |
| `@midnight-ntwrk/midnight-js-utils` | 4.1.1 |
| `@midnight-ntwrk/testkit-js` | 4.1.1 |
| `@midnight-ntwrk/wallet-sdk` | 1.2.0 |

Other runtime deps: `pino ^9`, `pino-pretty ^13`, `rxjs ^7.8.2`, `ws ^8.14.2`.
Dev dependencies: `typescript ^5.7.0`, `vitest ^4.1.0`, `vite-node ^6.0.0`, `@types/node ^22.0.0`,
`@types/ws ^8.5.9`.

## Toolchain Versions

Captured 2026-09-16. Use `compact --version`, `compact check`, and `compact self check` to check for
newer releases.

| Component | Version | Notes |
|-----------|---------|-------|
| Compact language | 0.23 | `pragma language_version 0.23` in the contract stub |
| Compact compiler | 0.31.1 | `compact update` to change |
| Node.js | 22+ required | https://nodejs.org/ |
| Yarn | 4 (via Corepack) | `npm install` also works |

### Local Network Docker Images (`compose.yml`)

| Service | Image tag | Port |
|---------|-----------|------|
| Proof server | `midnightntwrk/proof-server:8.1.0` | 6300 |
| Indexer | `midnightntwrk/indexer-standalone:4.3.3` | 8088 |
| Node | `midnightntwrk/midnight-node:1.0.0` (`CFG_PRESET=dev`) | 9944 |

> Note: this local network runs `midnight-node:1.0.0` and `indexer-standalone:4.3.3` (the indexer is
> supplied a dummy `BLOCKFROST_ID` so it runs key-less). These are **newer** than the caps the
> `midnight-tooling:devnet` version resolver applies for its shared devnet — see that skill's
> `version-resolution.md`.

## Network Endpoints

Local (from `compose.yml`, network id `undeployed`):

| Service | URL |
|---------|-----|
| Indexer (GraphQL) | `http://127.0.0.1:8088/api/v4/graphql` |
| Indexer (WebSocket) | `ws://127.0.0.1:8088/api/v4/graphql/ws` |
| Node (RPC) | `http://127.0.0.1:9944` |
| Proof server | `http://127.0.0.1:6300` |

Remote networks (Preview / Preprod) are configured in `src/config.ts`. Endpoints there follow the
`indexer.<network>.midnight.network` / `rpc.<network>.midnight.network` pattern; running against them
requires a funded wallet seed supplied via `.env.<network>`.

## Verifying Versions

If these versions appear outdated, check current versions directly:

- `compact check` — latest Compact compiler version
- `compact self check` — latest Compact developer tools version
- `npm view @midnight-ntwrk/midnight-js version` — latest SDK version
