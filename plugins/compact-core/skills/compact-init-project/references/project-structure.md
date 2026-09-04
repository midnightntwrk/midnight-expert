# Project Structure & Version Reference

## Hello World Project Layout

After running `npx create-mn-app <name> --template hello-world`:

```
<project-name>/
├── contracts/
│   └── hello-world.compact           # Contract source (pragma language_version >= 0.22)
├── src/
│   ├── deploy.ts                     # Deploy contract to Preprod network
│   ├── cli.ts                        # Interactive CLI for testing deployed contract
│   └── check-balance.ts              # Check wallet tNight/DUST balance
├── docker-compose.yml                # Proof server Docker config (port 6300)
├── package.json                      # Node 22+, type: module, SDK 4.x dependencies
├── tsconfig.json                     # ES2022 target, NodeNext modules
└── README.md
```

After compilation, the managed output directory is created:

```
contracts/managed/hello-world/
├── compiler/                         # Contract structure metadata (JSON)
├── contract/                         # Generated JavaScript + TypeScript type definitions
│   ├── index.js                      # Runtime implementation
│   └── index.d.ts                    # Type declarations (Ledger, Witnesses, Contract, etc.)
├── keys/                             # Cryptographic ZK proving and verifying keys
└── zkir/                             # Zero-Knowledge Intermediate Representation
```

### Hello World Contract Source

The scaffolded contract:

```compact
pragma language_version >= 0.22;

import CompactStandardLibrary;

// Public ledger state - visible on blockchain
export ledger message: Opaque<"string">;

// Circuit to store a message on the blockchain
// The message will be publicly visible
export circuit storeMessage(customMessage: Opaque<"string">): [] {
  message = disclose(customMessage);
}
```

### Hello World package.json Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `compile` | `compact compile contracts/hello-world.compact contracts/managed/hello-world` | Compile the Compact contract |
| `setup` | `docker compose up -d && npm run compile && npm run deploy` | Full setup: proof server + compile + deploy |
| `deploy` | `npx tsx src/deploy.ts` | Deploy to Preprod |
| `cli` | `npx tsx src/cli.ts` | Interactive contract CLI |
| `check-balance` | `npx tsx src/check-balance.ts` | Check wallet balance |
| `proof-server:start` | `docker compose up -d` | Start proof server |
| `proof-server:stop` | `docker compose down` | Stop proof server |
| `clean` | `rm -rf contracts/managed deployment.json` | Remove build artifacts |

## SDK Package Versions

These are the versions used by `create-mn-app` v0.4.1 hello-world template (verified on 2026-06-02). Versions may have been updated since — run `npm view <package> version` to check current versions:

| Package | Version |
|---------|---------|
| `@midnight-ntwrk/compact-runtime` | 0.16.0 |
| `@midnight-ntwrk/compact-js` | 2.5.0 |
| `@midnight-ntwrk/ledger-v8` | 8.0.3 |
| `@midnight-ntwrk/midnight-js-contracts` | 4.0.4 |
| `@midnight-ntwrk/midnight-js-http-client-proof-provider` | 4.0.4 |
| `@midnight-ntwrk/midnight-js-indexer-public-data-provider` | 4.0.4 |
| `@midnight-ntwrk/midnight-js-level-private-state-provider` | 4.0.4 |
| `@midnight-ntwrk/midnight-js-node-zk-config-provider` | 4.0.4 |
| `@midnight-ntwrk/midnight-js-network-id` | 4.0.4 |
| `@midnight-ntwrk/midnight-js-types` | 4.0.4 |
| `@midnight-ntwrk/midnight-js-utils` | 4.0.4 |
| `@midnight-ntwrk/wallet-sdk-facade` | 3.0.0 |
| `@midnight-ntwrk/wallet-sdk-hd` | 3.0.1 |
| `@midnight-ntwrk/wallet-sdk-shielded` | 2.1.0 |
| `@midnight-ntwrk/wallet-sdk-unshielded-wallet` | 2.1.0 |
| `@midnight-ntwrk/wallet-sdk-dust-wallet` | 3.0.0 |

Dev dependencies: `typescript ^6.0.3`, `tsx ^4.21.0`, `@types/node ^22.0.0`

## Toolchain Versions

Verified on 2026-06-02. Use `compact --version` and `npm view create-mn-app version` to check for newer releases.

| Component | Version | Install/Update |
|-----------|---------|----------------|
| Compact compiler | compactc-v0.30.x | `compact update` |
| create-mn-app | 0.4.1 | `npx create-mn-app@latest` |
| Proof server Docker image | midnightntwrk/proof-server:8.0.3 | Via Docker |
| Node.js | 22+ required | https://nodejs.org/ |

## Network Endpoints (Preprod)

| Service | URL |
|---------|-----|
| Indexer (GraphQL) | `https://indexer.preprod.midnight.network/api/v3/graphql` |
| Indexer (WebSocket) | `wss://indexer.preprod.midnight.network/api/v3/graphql/ws` |
| RPC | `https://rpc.preprod.midnight.network` |
| Faucet | `https://faucet.preprod.midnight.network/` |
| Docs | `https://docs.midnight.network` |

## Verifying Versions

If these versions appear outdated, check current versions directly:

- `compact check` — latest Compact compiler version
- `compact self check` — latest Compact developer tools version
- `npm view @midnight-ntwrk/midnight-js version` — latest SDK version
