---
name: midnight-dapp-dev:core
description: >-
  This skill should be used when building a Midnight DApp frontend,
  "create a React component for contract interaction", "set up wallet
  connection", "add a contract state subscription", "configure Vite for
  Midnight", "write tests for a DApp component", "debug wallet connection",
  "provider assembly", "transaction flow in the browser", "DApp Connector API",
  "RxJS observable for contract state", "scaffold a Midnight DApp",
  "useContractState hook", or working with Midnight SDK packages
  (@midnight-ntwrk/*) in a Vite + React project.
version: 0.1.0
---

# Midnight DApp Frontend Development

Guidance for building browser-based DApps on the Midnight blockchain using
Vite + React 19 + shadcn + Tailwind v4. This skill is the authoritative
reference for DApp Connector API usage, SDK provider patterns, and
frontend architecture for Midnight.

## Architecture

Every Midnight browser DApp assembles 6 providers and a `config` from the
wallet's configuration. All network endpoints come from `getConfiguration()`,
with no hardcoded URLs. The templates target Midnight.js 5.0.1 and
`@midnightntwrk/dapp-connector-api` 4.1.0, which build ledger 9 transactions,
the ledger every Midnight network runs.

```
WalletProvider (React Context)
  → connect(import.meta.env.VITE_NETWORK_ID || "undeployed") → ConnectedAPI
  → getConfiguration() → { indexerUri, indexerWsUri, substrateNodeUri, networkId }

MidnightProvidersProvider (React Context) → createProviders(api, { zkAssetsUrl })
  → publicDataProvider   ← indexerPublicDataProvider({ queryURL, subscriptionURL, webSocket })
  → zkConfigProvider     ← new FetchZkConfigProvider(zkAssetsUrl, { fetchFunc })  (the UI passes Vite's BASE_URL)
  → proofProvider        ← dappConnectorProofProvider(api, ...) (wallet proves, the default)
                           or httpClientProofProvider(proofServerUrl, zkConfigProvider)
  → walletProvider       ← dappConnectorWalletProviders(api), keys converted to hex
  → midnightProvider     ← dappConnectorWalletProviders(api)
  → privateStateProvider ← in-memory, scoped per contract address
  → config               ← { networkId: config.networkId, ttlSeconds }
  → dispose()            ← closes the indexer connection; the UI calls it on disconnect
```

Set `VITE_NETWORK_ID` in `.env` to `preview`, `preprod` or `mainnet` to target
a public network. Midnight.js 5 has no `setNetworkId()`: the network ID goes in
the providers' `config`. Proving runs in the wallet by default. To use a proof
server you run yourself (`midnightntwrk/proof-server:9.0.2`), pass
`{ proving: { mode: "local", proofServerUrl } }` to `createProviders`.

## Transaction Lifecycle

```
Contract call → unproven ledger 9 transaction
  → proofProvider.proveTx()       (wallet or proof server generates the ZK proof)
  → walletProvider.balanceTx()    (wallet adds DUST fee inputs, signs, binds)
  → midnightProvider.submitTx()   (wallet broadcasts to node)
  → publicDataProvider observable (indexer confirms on-chain)
```

Contract state arrives serialized. Decode it with the template's
`contractStateData(read)` and your contract's generated `ledger()`:

```typescript
ledger(contractStateData(read))
// = ledger(read.contractState.deserialize({ v9: ContractState }).data)
```

## Vite Configuration

Midnight SDK requires these Vite plugins for browser compatibility:

1. `@vitejs/plugin-react` (^6.3.0 for Vite 8)
2. `@tailwindcss/vite`: Tailwind v4, CSS-based config (`@import "tailwindcss"`)
3. `vite-plugin-wasm`: WASM support for the ledger 9 runtime
4. `vite-plugin-node-polyfills`: buffer, process, util, crypto, stream
5. `@originjs/vite-plugin-commonjs`, imported as `{ viteCommonjs }`

The template uses Vite 8 with `build.target: "esnext"`, which keeps top-level
await native. Do not add `vite-plugin-top-level-await`: Vite 8 bundles with
Rolldown and ships no rollup, which that plugin needs.

For detailed configuration, see `references/vite-config.md`.

## State Management

Combine on-chain ledger state with local private state using RxJS
`combineLatest`, expose via React hooks. For patterns and examples,
see `references/state-management.md`.

## Testing

Test wallet connection states, provider assembly, and component rendering
with Vitest + Testing Library. Mock `window.midnight` for wallet tests.
For patterns, see `references/testing-patterns.md`.

## Scaffolding

To scaffold a new UI + API package, invoke `/midnight-dapp-dev:init`.
The init skill copies templates from this skill's `templates/` directory
and substitutes `{{PLACEHOLDER}}` values.

## Templates

The `templates/` directory contains the flat template tree:

- `templates/ui/`: Vite + React 19 + shadcn + Tailwind v4 app with wallet integration
- `templates/api/`: TypeScript SDK layer with provider factory and state observable

## Reference Files

- **`references/provider-patterns.md`**: The 6-provider pattern, wallet-driven config, browser vs Node.js differences, DApp Connector API types
- **`references/state-management.md`**: RxJS combineLatest, derived state, useContractState hook, observable patterns
- **`references/testing-patterns.md`**: Vitest + Testing Library patterns, mocking wallet, testing providers
- **`references/vite-config.md`**: Required plugins, polyfills, Tailwind v4 CSS setup, path aliases
