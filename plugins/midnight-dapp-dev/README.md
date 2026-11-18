# midnight-dapp-dev

<p align="center">
  <img src="assets/mascot.png" alt="midnight-dapp-dev mascot" width="200" />
</p>

Scaffold and build Midnight DApp frontends -- Vite 8 + React 19 + shadcn + Tailwind v4 templates on Midnight.js 5 (ledger 9), wallet integration, provider architecture, and a development agent for ongoing UI work.

## Skills

### midnight-dapp-dev:core

Guidance for building browser-based DApps on Midnight using Vite + React 19 + shadcn + Tailwind v4. Covers DApp Connector API usage, SDK provider patterns, frontend architecture, wallet connection, contract state subscriptions, and component development.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`provider-patterns.md`](skills/core/references/provider-patterns.md) | Assembling the 6 SDK providers that bridge the browser, Lace wallet, indexer, and proof server | When setting up or debugging provider configuration for a Midnight DApp |
| [`state-management.md`](skills/core/references/state-management.md) | Managing public ledger state and private state with RxJS combineLatest and React hooks | When building reactive contract state subscriptions in the frontend |
| [`testing-patterns.md`](skills/core/references/testing-patterns.md) | Testing strategies for wallet-connected Midnight DApps using Vitest and Testing Library | When writing unit or integration tests for DApp components |
| [`vite-config.md`](skills/core/references/vite-config.md) | Required Vite plugins, polyfills, and configuration for running the Midnight SDK in the browser | When configuring or debugging Vite for a Midnight project |

### midnight-dapp-dev:dapp-connector

Covers the Midnight DApp Connector API for browser-based wallet integration: connecting to the Lace wallet extension, using the ConnectedAPI for transactions and balances, handling errors, and building React 19.x / Next.js 16.x DApps.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`browser-providers.md`](skills/dapp-connector/references/browser-providers.md) | Assembling MidnightProviders from the DApp Connector API in a browser context | When building SDK providers from the Lace wallet connection |
| [`connector-api-types.md`](skills/dapp-connector/references/connector-api-types.md) | Complete type definitions for the DApp Connector API (`@midnightntwrk/dapp-connector-api` 4.1.0: InitialAPI, ConnectedAPI) | When working with DApp Connector types or augmenting the window object |

### midnight-dapp-dev:init

Scaffolds a Vite + React 19 + shadcn + Tailwind v4 UI package and a TypeScript API package into the current project. Generates a complete browser DApp scaffold with wallet connection, provider assembly, and contract interaction boilerplate.

### midnight-dapp-dev:midnight-sdk

Comprehensive reference for the Midnight.js SDK (5.0.1, ledger 9): the core packages, the MidnightProviders architecture, the full transaction lifecycle, advanced contract operations, observable patterns, and testkit-js.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`package-reference.md`](skills/midnight-sdk/references/package-reference.md) | Detailed exports, constructor signatures, and configuration for the Midnight.js SDK packages | When looking up specific SDK package APIs or constructor options |
| [`transaction-lifecycle.md`](skills/midnight-sdk/references/transaction-lifecycle.md) | Complete reference for the five-stage transaction pipeline: build, prove, balance, submit, finalize | When implementing or debugging the contract interaction flow |
| [`mainnet-deployment.md`](skills/midnight-sdk/references/mainnet-deployment.md) | Deploying to mainnet: the ledger 9 toolchain and SDK versions, Blockfrost endpoints and token, DUST funding, readiness checklist | When moving a contract and DApp from preprod to mainnet |

## Agents

### dev

A Midnight DApp frontend developer agent that builds browser-based applications connecting to Midnight smart contracts via the Lace wallet.

#### When to use

Use when building or modifying a Midnight DApp frontend -- scaffolding UI/API packages, wiring contracts to the browser, building React components for contract interaction, or debugging wallet/provider/transaction issues.
