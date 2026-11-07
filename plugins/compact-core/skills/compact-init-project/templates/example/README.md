# __Title__

> TODO: one paragraph describing what this project demonstrates.

A standalone Midnight project scaffolded from the `compact-core:compact-init-project`
skill. Write your Compact contract, compile it, and exercise it with a test that
runs against a local Midnight network.

## Which ledger this template targets

The pinned dependency set here is the **ledger-8 track**: `midnight-js` 4.1.1,
`@midnight-ntwrk/ledger-v8`, `compact-runtime` 0.16.0, plus the `proof-server:8.1.0`
image. That is still the right stack for preprod, and it is what toolchain 0.31.1 emits.

Mainnet forked to **ledger 9** on 2026-11-06 (block 3,346,139) and preprod did not
follow, so the two networks now differ. To target mainnet with ledger-9 contracts, move
to toolchain 0.34.0+, `@midnight-ntwrk/midnight-js` 5.0.0 (dual-era), `@midnightntwrk/ledger-v9`
1.0.0 and proof server 9.0.0. See
`midnight-dapp-dev:midnight-sdk` → `references/mainnet-deployment.md` for the per-network
status and the scope split.

## Set up

Install dependencies (Node 22+; Yarn 4 via Corepack, or npm):

```bash
yarn install
```

## Compile the contract

Write your contract in `contract/__name__.compact`, then:

```bash
yarn compile
```

This generates `contract/managed/__name__/` (gitignored). The TypeScript harness
imports from it, so nothing type-checks until you have compiled at least once.

## Start the local Midnight network

Ensure the Docker engine is running, then:

```bash
yarn env:up
```

## Run the test suite

```bash
yarn wait:dust     # wait until the dev wallet has spendable DUST for fees
yarn test:local
```

Tear the network down when finished:

```bash
yarn env:down
```

This project is set up for a local devnet running via Docker. Configurations for
other networks live in `src/config.ts`; supply a funded wallet seed via
`.env.<network>` to run against them. Preprod also needs a Blockfrost
**Midnight Preprod** project ID in `BLOCKFROST_PROJECT_ID`, because Blockfrost
hosts the public Preprod indexer and node RPC.
