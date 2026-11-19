---
name: midnight-dapp-dev:midnight-sdk
description: >-
  This skill should be used when the user asks about the Midnight.js SDK,
  midnight-js packages, @midnight-ntwrk npm packages, setting up SDK providers,
  deploying or finding contracts with deployContract or findDeployedContract,
  calling circuits with callTx or submitCallTx, the transaction lifecycle,
  SDK provider types (WalletProvider, MidnightProvider, PublicDataProvider,
  ProofProvider, ZKConfigProvider, PrivateStateProvider), testkit-js testing,
  observable state subscriptions, contract maintenance and verifier keys,
  connecting to the indexer or proof server, or deploying to mainnet
  (Blockfrost endpoints and project tokens, mainnet readiness).
version: 0.1.0
---

# Midnight SDK Reference

Comprehensive reference for the Midnight.js SDK (5.0.1, all `@midnight-ntwrk/midnight-js-*` packages move in lockstep): the core packages, the MidnightProviders architecture, the full transaction lifecycle, advanced contract operations, observable patterns, and testkit-js. Every Midnight network (Mainnet, Preprod, Preview, and a current local devnet) runs ledger 9, and Midnight.js 5 is the release that builds ledger 9 transactions. For the deployment workflow, see `references/transaction-lifecycle.md`; for deploying to mainnet, see `references/mainnet-deployment.md`. For TypeScript witness implementation, see `compact-core:compact-witness-ts`. For browser wallet integration via the DApp Connector, see `midnight-dapp-dev:dapp-connector`.

For the underlying Wallet SDK (WalletFacade, HD derivation, three-wallet architecture), see `midnight-wallet:wallet-sdk`.

## Versions

| Component | Version |
|-----------|---------|
| `@midnight-ntwrk/midnight-js-*` (incl. `midnight-js-protocol`, `testkit-js`) | 5.0.1 |
| `@midnightntwrk/dapp-connector-api` | 4.1.0 |
| `@midnightntwrk/wallet-sdk` | 2.0.1 |
| Compact toolchain | 0.36.x (language 0.28, `compact-runtime` 0.21.0) |
| Proof server | `midnightntwrk/proof-server:9.0.2` |

These are the minimums for the Release 1 "1.1 patch" (17 Nov 2026). Check the [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix) before pinning, since it moves faster than this skill.

A DApp no longer depends on `@midnight-ntwrk/ledger-v8`, `compact-runtime` or `compact-js` directly. Midnight.js 5 re-exports the ledger 9 versions through `@midnight-ntwrk/midnight-js-protocol`:

| Import path | What it carries |
|-------------|-----------------|
| `@midnight-ntwrk/midnight-js-protocol/v9` | Ledger types: `Transaction`, `CostModel`, `ZswapSecretKeys`, `unshieldedToken`, ... |
| `@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime` | Runtime types: `ContractState`, `ChargedState`, `ContractAddress`, `SigningKey`, ... |
| `@midnight-ntwrk/midnight-js-protocol/v9/compact-js` | `CompiledContract` |

## SDK Package Map

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `@midnight-ntwrk/midnight-js-contracts` | Contract deployment and interaction | `deployContract`, `findDeployedContract`, `submitCallTx`, `submitCallTxAsync`, `submitTxAsync`, `createUnprovenCallTx`, `getStates`, `getPublicStates`, `getUnshieldedBalances`, `verifyContractState`, `submitInsertVerifierKeyTx`, `submitRemoveVerifierKeyTx`, `submitReplaceAuthorityTx`, `TxFailedError`, `EraMismatchError` |
| `@midnight-ntwrk/midnight-js-types` | Core type definitions and provider factories | `MidnightProviders`, `MidnightConfig`, `WalletProvider`, `MidnightProvider`, `PublicDataProvider`, `PrivateStateProvider`, `ProofProvider`, `ZKConfigProvider`, `ContractStateRead`, `createLedger9WalletProvider`, `createLedger9MidnightProvider` |
| `@midnight-ntwrk/midnight-js-protocol` | Ledger 9 ledger, runtime and compact-js types (see above) | `v9`, `v9/compact-runtime`, `v9/compact-js` subpaths |
| `@midnight-ntwrk/midnight-js-indexer-public-data-provider` | Indexer connection | `indexerPublicDataProvider()` |
| `@midnight-ntwrk/midnight-js-http-client-proof-provider` | Proof server communication | `httpClientProofProvider()` |
| `@midnight-ntwrk/midnight-js-level-private-state-provider` | Encrypted LevelDB private state (Node.js, or IndexedDB in the browser) | `levelPrivateStateProvider()` |
| `@midnight-ntwrk/midnight-js-node-zk-config-provider` | Node.js ZK asset loading | `NodeZkConfigProvider` |
| `@midnight-ntwrk/midnight-js-fetch-zk-config-provider` | Browser ZK asset loading | `FetchZkConfigProvider` |
| `@midnight-ntwrk/midnight-js-logger-provider` | Optional structured logging (pino wrapper) | `LoggerProvider` (class; `new LoggerProvider(pinoLogger)`) |
| `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider` | Browser wallet-delegated proving | `dappConnectorProofProvider(api, zkConfigProvider, costModel)` |
| `@midnight-ntwrk/midnight-js-utils` | Utility functions | `toHex`, `fromHex`, `parseCoinPublicKeyToHex`, `parseEncPublicKeyToHex`, `assertIsContractAddress`, `validatePassword` |

The Midnight.js packages are on the **public npm registry** under the `@midnight-ntwrk` scope. The DApp Connector API and the wallet SDK use the `@midnightntwrk` scope (no hyphen). Do not configure custom registries or `.npmrc` overrides.

`@midnight-ntwrk/midnight-js-network-id` and `setNetworkId()` are gone in Midnight.js 5. The network ID now travels with the providers, in `config.networkId`.

## MidnightProviders Deep Dive

`MidnightProviders<PCK, PSI, PS>` bundles six required providers and a required `config`, plus optional `contractModuleProvider` (for cross-contract calls) and `loggerProvider`:

```typescript
import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";

interface MidnightProviders<
  PCK extends AnyProvableCircuitId = AnyProvableCircuitId,
  PSI extends PrivateStateId = PrivateStateId,
  PS = any,
> {
  readonly privateStateProvider: PrivateStateProvider<PSI, PS>;
  readonly publicDataProvider: PublicDataProvider;
  readonly zkConfigProvider: ZKConfigProvider<PCK>;
  readonly proofProvider: ProofProvider;
  readonly walletProvider: WalletProvider;
  readonly midnightProvider: MidnightProvider;
  readonly config: MidnightConfig; // { networkId, ttlSeconds }
  readonly contractModuleProvider?: ContractModuleProvider;
  readonly loggerProvider?: LoggerProvider;
}
```

`config.networkId` is the network transactions are built for (`"undeployed"`, `"preview"`, `"preprod"` or `"mainnet"`). `config.ttlSeconds` is how long a built transaction stays valid, in whole seconds. In the browser, take the network ID from the wallet's `getConfiguration()`.

### Type Parameters

| Parameter | Meaning | Example |
|-----------|---------|---------|
| `PCK` | Provable circuit keys -- union of circuit names that have witnesses (`AnyProvableCircuitId`) | `"transfer" \| "mint"` |
| `PSI` | Private state identifier (`PrivateStateId`, a `string`) -- the key used in the private state store | `"myContractState"` |
| `PS` | Private state type -- the shape of off-chain state | `{ secretKey: Uint8Array }` |

### Provider Details

`proofProvider`, `walletProvider` and `midnightProvider` each declare `supportedEras` (for example `["v9"]`). Midnight.js checks all three before it proves anything and refuses an operation whose ledger era one of them does not serve.

#### WalletProvider

Handles transaction balancing (adding DUST fee inputs) and provides the wallet's public keys:

```typescript
interface WalletProvider {
  readonly supportedEras: readonly LedgerEra[];
  /** Balance and sign an unbound (proven) transaction handle */
  balanceTx(tx: UnboundTx, ttl?: Date): Promise<FinalizedTx>;
  getCoinPublicKey(): CoinPublicKey;
  getEncryptionPublicKey(): EncPublicKey;
}
```

`UnboundTx` and `FinalizedTx` are Midnight.js transaction handles tagged with their ledger era. You rarely implement this interface directly. Write a ledger 9 implementation and wrap it with `createLedger9WalletProvider`, which sets `supportedEras` to `["v9"]` and seals the answer:

- **Browser**: wrap `ConnectedAPI.balanceUnsealedTransaction` (see the template's `api/src/index.ts` and `midnight-dapp-dev:dapp-connector`)
- **Node.js**: wrap wallet SDK 2's `WalletFacade` (see the Node.js example below)

#### MidnightProvider

Submits finalized transactions to the Midnight node:

```typescript
interface MidnightProvider {
  readonly supportedEras: readonly LedgerEra[];
  submitTx(tx: FinalizedTx): Promise<TransactionId>;
}
```

Build it with `createLedger9MidnightProvider(submit)`, where `submit` receives a ledger 9 handle and passes `tx.serialize()` on:

- **Browser**: `ConnectedAPI.submitTransaction`
- **Node.js**: `WalletFacade.submitTransaction`

#### Node.js wallet and midnight providers

With wallet SDK 2 (`@midnightntwrk/wallet-sdk`), a transaction crosses between Midnight.js and the wallet as bytes:

```typescript
import {
  createLedger9MidnightProvider,
  createLedger9WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import {
  WalletSeeds,
  WalletTransaction,
  createKeystore,
} from "@midnightntwrk/wallet-sdk";

const seeds = WalletSeeds.fromMasterSeed(seed);
const keystore = createKeystore({ kind: "schnorr", secret: seeds.unshielded }, networkId);
// facade = await WalletFacade.init({ ... }) with the three sub-wallets
await facade.start(seeds);
// Wait until state.isSynced && state.protocol._tag === "Settled" before building transactions.

const walletProvider = createLedger9WalletProvider({
  getCoinPublicKey: () => shielded.coinPublicKey.toHexString(),
  getEncryptionPublicKey: () => shielded.encryptionPublicKey.toHexString(),
  async balanceTx(tx, ttl) {
    const recipe = await facade.balanceUnboundTransaction(
      facade.adoptTransaction(tx.serialize(), "Unbound"),
      { ttl: ttl ?? new Date(Date.now() + 3600 * 1000) },
    );
    const signed = await facade.signRecipe(recipe, keystore.signDataAsync);
    const finalized = await facade.finalizeRecipe(signed);
    return Buffer.from(WalletTransaction.toWire(finalized).transaction, "hex");
  },
});

const midnightProvider = createLedger9MidnightProvider((tx) =>
  facade.submitTransaction(facade.adoptTransaction(tx.serialize(), "Finalized")),
);
```

`shielded` is the shielded part of the settled facade state. For the full `WalletFacade.init` configuration, see `midnight-wallet:wallet-sdk`.

#### PublicDataProvider

Connects to the indexer for on-chain state queries and subscriptions. Contract states come back still serialized, tagged with the ledger era that wrote them:

```typescript
interface PublicDataProvider {
  queryContractState(
    address: ContractAddress,
    config?: BlockHeightConfig | BlockHashConfig,
  ): Promise<ContractStateAndParametersRead | null>; // extends ContractStateRead
  // Resolve once when the tx appears on-chain (Promises, not observables):
  watchForDeployTxData(address: ContractAddress, options?: WatchOptions): Promise<FinalizedTxRead>;
  watchForTxData(txId: TransactionId, options?: WatchOptions): Promise<FinalizedTxRead>;
  contractStateObservable(
    address: ContractAddress,
    config: ContractStateObservableConfig,
  ): Observable<PositionedRecord<ContractStateRead>>; // { value, blockHeight, blockHash }
  // ...also queryBlock, queryZSwapAndContractState, queryDeployContractState,
  // queryUnshieldedBalances, watchForContractState, unshieldedBalancesObservable,
  // queryContractEvents, contractEventsObservable, queryLatestProtocolVersion
}
```

Decode a `ContractStateRead` with the ledger 9 `ContractState`, then with the compiled contract's generated `ledger()`:

```typescript
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import { ledger } from "./managed/mycontract/contract/index.js";

const read = await providers.publicDataProvider.queryContractState(contractAddress);
if (read) {
  const state = ledger(read.contractState.deserialize({ v9: ContractState }).data);
}
```

`ContractStateObservableConfig` is required and selects where the stream starts:
`{ type: "latest" }`, `{ type: "all" }`, `{ type: "txId"; txId }`,
`{ type: "blockHeight"; blockHeight }`, or `{ type: "blockHash"; blockHash }`
(the last three take an optional `inclusive` flag, default `true`). Passing an emission's `blockHeight` or `blockHash` back resumes the stream from that block.

Created the same way in Node.js and the browser via `indexerPublicDataProvider(httpUrl, wsUrl)`. In the browser, pass `globalThis.WebSocket` as the third argument (see the template).

#### PrivateStateProvider

Persists off-chain contract state that witnesses access. Midnight.js 5 scopes private state by contract address:

```typescript
interface PrivateStateProvider<PSI extends PrivateStateId, PS> {
  forContract(contractAddress: ContractAddress): ContractPrivateStates<PSI, PS>;
  // ContractPrivateStates has get(id), set(id, state), remove(id), clear(),
  // exportPrivateStates(), importPrivateStates()
  clearAll(): Promise<void>;
  setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void>;
  getSigningKey(address: ContractAddress): Promise<SigningKey | null>;
  // ...also removeSigningKey, clearSigningKeys, exportSigningKeys, importSigningKeys
}

const ps = await providers.privateStateProvider.forContract(contractAddress).get(PRIVATE_STATE_ID);
```

- **Node.js**: `levelPrivateStateProvider()` on LevelDB, encrypted under a password that must pass `validatePassword` (16 or more characters, at least 3 character classes)
- **Browser**: the template's in-memory provider, or `levelPrivateStateProvider()` on IndexedDB for state that must survive a reload (see `midnight-dapp-dev:dapp-connector`)

#### ZKConfigProvider

Loads ZK circuit configurations from compiled assets:

```typescript
abstract class ZKConfigProvider<K extends string> {
  abstract getZKIR(circuitId: K): Promise<ZKIR>;
  abstract getProverKey(circuitId: K): Promise<ProverKey>;
  abstract getVerifierKey(circuitId: K): Promise<VerifierKey>;
  getArtifactRuntimeVersion(): Promise<string>;
  getVerifierKeys(circuitIds: K[]): Promise<[K, VerifierKey][]>;
  get(circuitId: K): Promise<ZKConfig<K>>;  // bundles ZKIR + prover + verifier keys
}
```

- **Node.js**: `NodeZkConfigProvider` reads from the filesystem
- **Browser**: `FetchZkConfigProvider` fetches over HTTP

Both check the artifacts against `compiler/contract-manifest.json` by default (`verify: "require"`), so serve the `compiler/` directory next to `keys/` and `zkir/`. `getArtifactRuntimeVersion()` is how Midnight.js tells which `compact-runtime`, and so which ledger era, the artifacts were compiled for.

#### ProofProvider

Generates ZK proofs:

```typescript
interface ProofProvider {
  readonly supportedEras: readonly LedgerEra[];
  proveTx(unprovenTx: UnprovenTx, proveTxConfig?: ProveTxConfig): Promise<UnboundTx>;
}
```

Created via `httpClientProofProvider(proofServerUrl, zkConfigProvider)` in both environments, against `midnightntwrk/proof-server:9.0.2` or later. For browser DApps, `dappConnectorProofProvider(api, zkConfigProvider, CostModel.initialCostModel())` from `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider` returns a `ProofProvider` that delegates proving to the connected wallet. `CostModel` comes from `@midnight-ntwrk/midnight-js-protocol/v9`.

## Transaction Lifecycle

Every contract interaction follows a five-stage pipeline:

```
Build       ->  Prove       ->  Balance     ->  Submit      ->  Finalize
callTx          proofProvider   walletProvider  midnightProvider  publicDataProvider
(construct tx)  (generate ZK    (add fee        (send to node)   (confirm on-chain)
                 proof)          inputs/outputs)
```

### High-Level API

`callTx` on a deployed/found contract performs all five stages:

```typescript
const deployed = await deployContract(providers, options);

// Single call does: build -> prove -> balance -> submit -> finalize
const txData = await deployed.callTx.myCircuit(arg1, arg2);

// txData.public carries the finalized record:
txData.public.txId;         // TransactionId
txData.public.txHash;
txData.public.blockHeight;  // number
txData.public.status;       // "SucceedEntirely" | "FailFallible" | "FailEntirely"
```

### Low-Level API

For finer control, call the functions with an options object that names the contract, circuit and arguments:

```typescript
import {
  createUnprovenCallTx,
  submitCallTx,
  submitCallTxAsync,
} from "@midnight-ntwrk/midnight-js-contracts";

const options = {
  compiledContract,
  contractAddress,
  circuitId: "myCircuit" as const,
  args: [arg1, arg2],               // omitted for a circuit with no arguments
  privateStateId: PRIVATE_STATE_ID, // omitted for a contract with no private state
};

// Stage 1 only: build the unproven transaction
const unproven = await createUnprovenCallTx(providers, options);

// Stages 1-5: build, prove, balance, submit, and finalize
const txData = await submitCallTx(providers, options);

// OR stages 1-4: return after submission, don't wait for finalization
const { txId } = await submitCallTxAsync(providers, options);
```

### Async Submission Variants

For operations that do not need to wait for on-chain confirmation:

| Function | Waits for finalization? | Returns |
|----------|------------------------|---------|
| `callTx.circuitName()` | Yes | `FinalizedCallTxData` |
| `submitCallTx(providers, options)` | Yes | `FinalizedCallTxData` |
| `submitCallTxAsync(providers, options)` | No | `SubmittedCallTx` (`{ txId, callTxData, ... }`) |
| `submitTxAsync(providers, { unprovenTx, circuitId })` | No | `string` (the transaction ID) |

Use async variants for fire-and-forget operations or when managing finalization separately via `watchForTxData`.

## State Query Functions

Query contract state without submitting transactions:

```typescript
import {
  getStates,
  getPublicStates,
  getUnshieldedBalances,
  verifyContractState,
} from "@midnight-ntwrk/midnight-js-contracts";

// Public states (contract state, zswap chain state, ledger parameters) plus private state
const { contractState, privateState } = await getStates(
  providers.publicDataProvider,
  providers.privateStateProvider,
  contractAddress,
  PRIVATE_STATE_ID,
);

// Public states only, still serialized; decode with deserialize({ v9: ContractState })
const publicStates = await getPublicStates(providers.publicDataProvider, contractAddress);

// Unshielded token balances held by the contract
const balances = await getUnshieldedBalances(providers.publicDataProvider, contractAddress);
// Returns { balance: bigint; tokenType }[]

// Throws ContractTypeError if a local verifier key is missing or differs on-chain
await verifyContractState(verifierKeys, publicStates.contractState, contractAddress);
```

## Contract Maintenance

### Verifier Key Management

Verifier keys authorize which circuits can be called on a deployed contract. Manage them post-deployment through the contract's maintenance interfaces, or the standalone functions:

```typescript
import {
  submitInsertVerifierKeyTx,
  submitRemoveVerifierKeyTx,
} from "@midnight-ntwrk/midnight-js-contracts";

// Add a verifier key (enables a circuit)
await deployed.circuitMaintenanceTx.newCircuit.insertVerifierKey(newVerifierKey);
// or
await submitInsertVerifierKeyTx(providers, compiledContract, contractAddress, "newCircuit", newVerifierKey);

// Remove a verifier key (disables a circuit)
await deployed.circuitMaintenanceTx.oldCircuit.removeVerifierKey();
// or
await submitRemoveVerifierKeyTx(providers, compiledContract, contractAddress, "oldCircuit");
```

Verifier key insertion is required when upgrading contract logic or enabling circuits that were not included in the original deployment. Recompiling a contract changes its verifier keys, so a contract recompiled with a newer toolchain no longer matches the keys already on-chain.

### Authority Management

The contract authority controls who can modify verifier keys. Transfer authority to enable governance transitions:

```typescript
import { submitReplaceAuthorityTx } from "@midnight-ntwrk/midnight-js-contracts";

await deployed.contractMaintenanceTx.replaceAuthority(newSigningKey);
// or
await submitReplaceAuthorityTx(providers, compiledContract, contractAddress)(newSigningKey);
```

Authority replacement is irreversible. Keep the new `SigningKey` safe: it is what signs every later maintenance transaction.

## Observable Patterns

The SDK uses RxJS observables for reactive state management:

### Contract State Subscriptions

```typescript
import { map } from "rxjs";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import { ledger } from "./managed/mycontract/contract/index.js";

// Each emission is { value: ContractStateRead, blockHeight, blockHash }
const stateSubscription = providers.publicDataProvider
  .contractStateObservable(contractAddress, { type: "latest" })
  .pipe(
    map(({ value }) => ledger(value.contractState.deserialize({ v9: ContractState }).data)),
  )
  .subscribe({
    next: (ledgerState) => {
      console.log("State updated:", ledgerState);
    },
    error: (err) => {
      console.error("Subscription error:", err);
    },
  });

// Clean up when done
stateSubscription.unsubscribe();
```

The template's `contractStateData(read)` in `api/src/index.ts` wraps the decode step and throws if a state is not ledger 9.

### Transaction Finalization Watchers

```typescript
// Resolves once the deployment appears on-chain
const deployData = await providers.publicDataProvider.watchForDeployTxData(contractAddress, {
  maxWaitMs: 120_000,
});
console.log("Contract deployed in block", deployData.blockHeight);
```

### Combining Observables for UI State

```typescript
import { combineLatest, map } from "rxjs";

// Combine contract state with balance updates
const appState$ = combineLatest([
  providers.publicDataProvider
    .contractStateObservable(contractAddress, { type: "latest" })
    .pipe(map(({ value }) => ledger(value.contractState.deserialize({ v9: ContractState }).data))),
  balanceObservable$,
]).pipe(
  map(([ledgerState, balance]) => ({
    contractValue: ledgerState.counter,
    userBalance: balance,
  })),
);
```

## testkit-js

`@midnight-ntwrk/testkit-js` (5.0.1) runs integration tests against a real environment: a local devnet started with Docker, or Preview and Preprod. It does not simulate the network; for circuit-level tests without a network, see `midnight-cq:compact-testing`.

### Environment and Wallet Setup

```typescript
import {
  createDefaultTestLogger,
  getTestEnvironment,
  initializeMidnightProviders,
  type MidnightWalletProvider,
  type TestEnvironment,
} from "@midnight-ntwrk/testkit-js";

const logger = createDefaultTestLogger();
const env: TestEnvironment = getTestEnvironment(logger);
const envConfig = await env.start();

// Funded wallets, serving both ledger eras
const [wallet]: MidnightWalletProvider[] = await env.startMidnightWalletProviders(1);

// The full MidnightProviders set, with config = { networkId, ttlSeconds: 3600 }
const providers = initializeMidnightProviders(wallet, envConfig, {
  privateStateStoreName: "my-contract-private-state",
  zkConfigPath: "path/to/managed/mycontract",
});
```

`MidnightWalletProvider` implements both `WalletProvider` and `MidnightProvider` on top of a wallet SDK `WalletFacade`.

### Contract Testing Pattern

```typescript
import { deployContract, getPublicStates } from "@midnight-ntwrk/midnight-js-contracts";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";

describe("MyContract", () => {
  let env: TestEnvironment;
  let providers: ReturnType<typeof initializeMidnightProviders>;

  beforeAll(async () => {
    env = getTestEnvironment(createDefaultTestLogger());
    const envConfig = await env.start();
    const [wallet] = await env.startMidnightWalletProviders(1);
    providers = initializeMidnightProviders(wallet, envConfig, contractConfig);
  });

  afterAll(async () => {
    await env.shutdown();
  });

  it("deploys and calls a circuit", async () => {
    const deployed = await deployContract(providers, {
      compiledContract: myCompiledContract,
      privateStateId: "testState",
      initialPrivateState: { secretKey: testKey },
    });

    const result = await deployed.callTx.increment();
    expect(result.public.status).toBe("SucceedEntirely");

    const { contractState } = await getPublicStates(
      providers.publicDataProvider,
      deployed.deployTxData.public.contractAddress,
    );
    expect(ledger(contractState.deserialize({ v9: ContractState }).data).counter).toBe(1n);
  });
});
```

### Multi-Party Testing

```typescript
// Two funded wallets, one provider set each
const [alice, bob] = await env.startMidnightWalletProviders(2);
const aliceProviders = initializeMidnightProviders(alice, envConfig, { ...contractConfig, privateStateStoreName: "alice" });
const bobProviders = initializeMidnightProviders(bob, envConfig, { ...contractConfig, privateStateStoreName: "bob" });

// Alice deploys
const deployed = await deployContract(aliceProviders, deployOptions);

// Bob joins and stores his own private state
const found = await findDeployedContract(bobProviders, {
  contractAddress: deployed.deployTxData.public.contractAddress,
  compiledContract: myCompiledContract,
  privateStateId: "bobState",
  initialPrivateState: { secretKey: bobKey },
});

// Bob calls a circuit on Alice's contract
const result = await found.callTx.transfer(aliceAddress, 100n);
```

## FinalizedTxData Types

### FinalizedDeployTxData

```typescript
interface Ledger9FinalizedDeployTxData<C> {
  era: "v9";
  public: {
    contractAddress: ContractAddress;
    initialContractState: SerializedContractState<"v9">;
    // plus the finalized record: txId, txHash, blockHash, blockHeight, status, fees, ...
  };
  private: {
    signingKey: SigningKey;
    initialPrivateState: PS;
  };
}
```

### FinalizedCallTxData

```typescript
interface Ledger9FinalizedCallTxData<C, PCK> {
  public: {
    // the finalized record: txId, txHash, blockHash, blockHeight, status, fees, ...
    // plus the call's nextContractState and public transcript
  };
  private: { /* unproven tx, private transcript, next private state: do not log */ };
}
```

Both types provide the on-chain confirmation data needed to verify that the operation succeeded. Check `public.status` before treating a call as done. Treat `private` as confidential.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Importing `NodeZkConfigProvider` in browser code | Use `FetchZkConfigProvider` for browser environments |
| Calling `setNetworkId()` or installing `@midnight-ntwrk/midnight-js-network-id` | Both are gone in Midnight.js 5. Pass `config: { networkId, ttlSeconds }` in the providers bundle |
| Decoding state with `MyContract.ledger(state.data)` | Reads are serialized now. Use `ledger(read.contractState.deserialize({ v9: ContractState }).data)` |
| Deploying a contract compiled with toolchain 0.31.x | Midnight.js 5 refuses it with `EraMismatchError`. Recompile with toolchain 0.36.x (`compact-runtime` 0.21.0) |
| Passing `initialPrivateState` to `findDeployedContract` to "rejoin" | That key, even set to `undefined`, overwrites the stored private state. Omit it to reuse what is stored |
| Importing types from `@midnight-ntwrk/ledger-v8` or a standalone `compact-runtime` | Import from `@midnight-ntwrk/midnight-js-protocol/v9` and its `compact-runtime` / `compact-js` subpaths |
| Forgetting to unsubscribe from observables | Store subscription references and call `unsubscribe()` in cleanup |
| Using `callTx` when you only need to submit | Use `submitCallTxAsync` to avoid blocking on finalization |
| Mixing circuit keys from different contracts | Each contract has its own provable circuit ID type; do not share providers across contracts with different circuit sets |
| Using mismatched versions of `@midnight-ntwrk` packages | Pin all Midnight.js packages to the same release version (5.0.1) |

## Reference Files

| Topic | Reference File |
|-------|---------------|
| Detailed exports, constructor signatures, and configuration for the SDK packages | `references/package-reference.md` |
| Complete transaction lifecycle with low-level API, proving flow, balancing internals, and finalization | `references/transaction-lifecycle.md` |
| Deploying to mainnet: who can deploy, the compiler to use, Blockfrost endpoints and token, DUST funding, readiness checklist | `references/mainnet-deployment.md` |
