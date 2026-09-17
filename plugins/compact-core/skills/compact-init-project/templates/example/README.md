# __Title__

> TODO: one paragraph describing what this project demonstrates.

A standalone Midnight project scaffolded from the `compact-core:compact-init-project`
skill. Write your Compact contract, compile it, and exercise it with a test that
runs against a local Midnight network.

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
`.env.<network>` to run against them.
