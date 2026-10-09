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

Comprehensive reference for the Midnight.js SDK (v4.1.1 — all `@midnight-ntwrk/midnight-js-*` packages move in lockstep): the core packages, the MidnightProviders architecture, the full transaction lifecycle, advanced contract operations, observable patterns, and testkit-js. For the deployment workflow, see `references/transaction-lifecycle.md`; for deploying to mainnet, see `references/mainnet-deployment.md`. For TypeScript witness implementation, see `compact-core:compact-witness-ts`. For browser wallet integration via the DApp Connector, see `midnight-dapp-dev:dapp-connector`.

For the underlying Wallet SDK packages (WalletFacade, HD derivation, three-wallet architecture), see `midnight-wallet:wallet-sdk`.

## SDK Package Map

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `@midnight-ntwrk/midnight-js-contracts` | Contract deployment and interaction | `deployContract`, `findDeployedContract`, `submitCallTx`, `callTx`, `submitCallTxAsync`, `submitTxAsync`, `createUnprovenCallTx`, `getStates`, `getPublicStates`, `getUnshieldedBalances`, `verifyContractState`, `submitInsertVerifierKeyTx`, `submitRemoveVerifierKeyTx`, `submitReplaceAuthorityTx`, `replaceAuthority` |
| `@midnight-ntwrk/midnight-js-types` | Core type definitions | `MidnightProviders`, `WalletProvider`, `MidnightProvider`, `PublicDataProvider`, `PrivateStateProvider`, `ProofProvider`, `ZKConfigProvider` |
| `@midnight-ntwrk/midnight-js-network-id` | Network configuration | `setNetworkId` |
| `@midnight-ntwrk/midnight-js-indexer-public-data-provider` | Indexer connection | `indexerPublicDataProvider()` |
| `@midnight-ntwrk/midnight-js-http-client-proof-provider` | Proof server communication | `httpClientProofProvider()` |
| `@midnight-ntwrk/midnight-js-level-private-state-provider` | LevelDB private state (Node.js) | `levelPrivateStateProvider()` |
| `@midnight-ntwrk/midnight-js-node-zk-config-provider` | Node.js ZK asset loading | `NodeZkConfigProvider` |
| `@midnight-ntwrk/midnight-js-fetch-zk-config-provider` | Browser ZK asset loading | `FetchZkConfigProvider` |
| `@midnight-ntwrk/midnight-js-logger-provider` | Optional structured logging (pino wrapper) | `LoggerProvider` (class; `new LoggerProvider(pinoLogger)`) |
| `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider` | Browser wallet-delegated proving | `dappConnectorProofProvider(api, zkConfigProvider, costModel)` |
| `@midnight-ntwrk/midnight-js-utils` | Utility functions | `toHex` (as of the current release, `toHex` is the primary utility export) |

All packages are published on the **public npm registry** under the `@midnight-ntwrk` scope. Do not configure custom registries or `.npmrc` overrides.

## MidnightProviders Deep Dive

`MidnightProviders<PCK, PSI, PS>` bundles the six required providers (plus an optional logger) for contract deployment and interaction:

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
  readonly loggerProvider?: LoggerProvider;
}
```

### Type Parameters

| Parameter | Meaning | Example |
|-----------|---------|---------|
| `PCK` | Provable circuit keys -- union of circuit names that have witnesses (`AnyProvableCircuitId`) | `"transfer" \| "mint"` |
| `PSI` | Private state identifier (`PrivateStateId`, a `string`) -- the key used in the private state store | `"myContractState"` |
| `PS` | Private state type -- the shape of off-chain state | `{ secretKey: Uint8Array }` |

### Provider Details

#### WalletProvider

Handles transaction balancing (adding fee inputs/outputs) and provides signing keys:

```typescript
interface WalletProvider {
  /** Get the shielded coin public key for receiving funds */
  getCoinPublicKey(): CoinPublicKey;

  /** Get the encryption public key for encrypted outputs */
  getEncryptionPublicKey(): EncPublicKey;

  /** Balance an unbound (proven) transaction by adding fee inputs/outputs */
  balanceTx(
    tx: UnboundTransaction,
    ttl?: Date,
  ): Promise<FinalizedTransaction>;
}
```

`getCoinPublicKey()` / `getEncryptionPublicKey()` are synchronous and return the `CoinPublicKey` / `EncPublicKey` types (string aliases) from the ledger.

- **Node.js**: Built from `WalletFacade` (see the Deployment section below)
- **Browser**: Built from `ConnectedAPI.balanceUnsealedTransaction` (see `midnight-dapp-dev:dapp-connector`)

#### MidnightProvider

Submits finalized transactions to the Midnight node:

```typescript
interface MidnightProvider {
  /** Submit a finalized (balanced + proven) transaction */
  submitTx(tx: FinalizedTransaction): Promise<TransactionId>;
}
```

- **Node.js**: Built from `WalletFacade`
- **Browser**: Built from `ConnectedAPI.submitTransaction`

#### PublicDataProvider

Connects to the indexer for on-chain state queries and subscriptions:

```typescript
interface PublicDataProvider {
  queryContractState(
    address: ContractAddress,
    config?: BlockHeightConfig | BlockHashConfig,
  ): Promise<ContractState | null>;
  // Resolves once when the deploy tx appears on-chain (NOT an observable):
  watchForDeployTxData(address: ContractAddress): Promise<FinalizedTxData>;
  watchForTxData(txId: TransactionId): Promise<FinalizedTxData>;
  contractStateObservable(
    address: ContractAddress,
    config: ContractStateObservableConfig,
  ): Observable<ContractState>;
  // ...also queryZSwapAndContractState, queryDeployContractState,
  // queryUnshieldedBalances, watchForContractState, unshieldedBalancesObservable
}
```

`ContractStateObservableConfig` is required and selects where the stream starts:
`{ type: "latest" }`, `{ type: "all" }`, `{ type: "txId"; txId }`,
`{ type: "blockHeight"; blockHeight }`, or `{ type: "blockHash"; blockHash }`
(the last three take an optional `inclusive` flag, default `true`). As of v4.1.1 the
`blockHeight` / `blockHash` configurations correctly emit the state at that block.

Created identically in both Node.js and browser via `indexerPublicDataProvider(httpUrl, wsUrl)`.

#### PrivateStateProvider

Persists off-chain contract state that witnesses access:

```typescript
interface PrivateStateProvider<PSI extends string, PS> {
  get(id: PSI): Promise<PS | null>;
  set(id: PSI, state: PS): Promise<void>;
  remove(id: PSI): Promise<void>;
}
```

- **Node.js**: `levelPrivateStateProvider()` using LevelDB
- **Browser**: In-memory `Map` or IndexedDB (see `midnight-dapp-dev:dapp-connector`)

#### ZKConfigProvider

Loads ZK circuit configurations from compiled assets:

```typescript
abstract class ZKConfigProvider<K extends string> {
  abstract getZKIR(circuitId: K): Promise<ZKIR>;
  abstract getProverKey(circuitId: K): Promise<ProverKey>;
  abstract getVerifierKey(circuitId: K): Promise<VerifierKey>;
  getVerifierKeys(circuitIds: K[]): Promise<[K, VerifierKey][]>;
  get(circuitId: K): Promise<ZKConfig<K>>;  // bundles ZKIR + prover + verifier keys
}
```

- **Node.js**: `NodeZkConfigProvider` reads from filesystem
- **Browser**: `FetchZkConfigProvider` fetches via HTTP

#### ProofProvider

Communicates with the proof server to generate ZK proofs:

```typescript
interface ProofProvider {
  proveTx(
    unprovenTx: UnprovenTransaction,
    proveTxConfig?: ProveTxConfig,
  ): Promise<UnboundTransaction>;
}
```

Created via `httpClientProofProvider(proofServerUrl, zkConfigProvider)` in both environments. For browser DApps, `dappConnectorProofProvider(api, zkConfigProvider, costModel)` from `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider` returns a `ProofProvider` that delegates proving to the connected Lace wallet.

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

// txData contains:
txData.public.txId;         // TransactionId
txData.public.txHash;       // string
txData.public.blockHeight;  // number
```

### Low-Level API

For fine-grained control, use individual functions:

```typescript
import {
  createUnprovenCallTx,
  submitCallTx,
  submitCallTxAsync,
} from "@midnight-ntwrk/midnight-js-contracts";

// Step 1: Build the unproven transaction
const unproven = await createUnprovenCallTx(
  deployed,
  providers,
  "myCircuit",
  [arg1, arg2],
);

// Step 2+3+4+5: Prove, balance, submit, and finalize
const txData = await submitCallTx(providers, unproven);

// OR: Steps 2+3+4 only (return after submission, don't wait for finalization)
const txId = await submitCallTxAsync(providers, unproven);
```

### Async Submission Variants

For operations that do not need to wait for on-chain confirmation:

| Function | Waits for finalization? | Returns |
|----------|------------------------|---------|
| `callTx.circuitName()` | Yes | `FinalizedCallTxData` |
| `submitCallTx(providers, unproven)` | Yes | `FinalizedCallTxData` |
| `submitCallTxAsync(providers, unproven)` | No | `TransactionId` |
| `submitTxAsync(providers, tx)` | No | `TransactionId` |

Use async variants for fire-and-forget operations or when managing finalization separately via observables.

## State Query Functions

Query contract and balance state without submitting transactions:

```typescript
import {
  getStates,
  getPublicStates,
  getUnshieldedBalances,
  verifyContractState,
} from "@midnight-ntwrk/midnight-js-contracts";

// Get both public and private state
const { publicState, privateState } = await getStates(
  deployed,
  providers,
);

// Get only public (on-chain) state
const publicState = await getPublicStates(deployed, providers);

// Get unshielded token balances for the connected wallet
const balances = await getUnshieldedBalances(providers);
// Returns Record<string, bigint>

// Verify that on-chain state matches expected state
const isValid = await verifyContractState(deployed, providers);
```

## Contract Maintenance

### Verifier Key Management

Verifier keys authorize which circuits can be called on a deployed contract. Manage them post-deployment:

```typescript
import {
  submitInsertVerifierKeyTx,
  submitRemoveVerifierKeyTx,
} from "@midnight-ntwrk/midnight-js-contracts";

// Add a new verifier key (enables a new circuit)
await submitInsertVerifierKeyTx(providers, {
  contractAddress,
  circuitId: "newCircuit",
  verifierKey: newVerifierKeyBytes,
});

// Remove a verifier key (disables a circuit)
await submitRemoveVerifierKeyTx(providers, {
  contractAddress,
  circuitId: "oldCircuit",
});
```

Verifier key insertion is required when upgrading contract logic or enabling circuits that were not included in the original deployment.

### Authority Management

The contract authority controls who can modify verifier keys. Transfer authority to enable governance transitions:

```typescript
import {
  submitReplaceAuthorityTx,
  replaceAuthority,
} from "@midnight-ntwrk/midnight-js-contracts";

// Replace the contract authority
await submitReplaceAuthorityTx(providers, {
  contractAddress,
  newAuthority: newAuthorityPublicKey,
});

// Alternative: replaceAuthority() for use within contract interactions
const result = await replaceAuthority(deployed, providers, newAuthorityPublicKey);
```

Authority replacement is irreversible. The new authority must be a valid public key that controls the signing key for subsequent verifier key operations.

## Observable Patterns

The SDK uses RxJS observables for reactive state management:

### Contract State Subscriptions

```typescript
import { map, distinctUntilChanged } from "rxjs";
import { MyContract } from "./managed/mycontract/contract/index.js";

// Subscribe to all state changes
const stateSubscription = providers.publicDataProvider
  .contractStateObservable(contractAddress, { type: "latest" })
  .pipe(
    map((state) => MyContract.ledger(state.data)),
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

### Transaction Finalization Watchers

```typescript
// Watch for a specific transaction to finalize
providers.publicDataProvider
  .watchForDeployTxData(contractAddress)
  .subscribe({
    next: (deployData) => {
      console.log("Contract deployed:", deployData.contractAddress);
    },
  });
```

### Combining Observables for UI State

```typescript
import { combineLatest, map } from "rxjs";

// Combine contract state with balance updates
const appState$ = combineLatest([
  providers.publicDataProvider
    .contractStateObservable(contractAddress, { type: "latest" })
    .pipe(map((s) => MyContract.ledger(s.data))),
  balanceObservable$,
]).pipe(
  map(([ledger, balance]) => ({
    contractValue: ledger.counter,
    userBalance: balance,
  })),
);
```

## testkit-js

The `@midnight-ntwrk/testkit-js` package provides utilities for integration testing without a live network:

### Test Wallet Setup

```typescript
import { TestWallet } from "@midnight-ntwrk/testkit-js";

// Create a test wallet with pre-funded balances
const testWallet = await TestWallet.create({
  networkId: "undeployed",
  initialBalance: 1_000_000n,
});

const walletProvider = testWallet.walletProvider();
const midnightProvider = testWallet.midnightProvider();
```

### Contract Testing Pattern

```typescript
import { TestEnvironment } from "@midnight-ntwrk/testkit-js";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";

describe("MyContract", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  });

  afterAll(async () => {
    await env.stop();
  });

  it("deploys and calls a circuit", async () => {
    const providers = env.createProviders(witnesses);

    const deployed = await deployContract(providers, {
      compiledContract: myCompiledContract,
      privateStateId: "testState",
      initialPrivateState: { secretKey: testKey },
    });

    const result = await deployed.callTx.increment();
    expect(result.public.txId).toBeDefined();

    const state = await getPublicStates(deployed, providers);
    expect(state.counter).toBe(1n);
  });
});
```

### Multi-Party Testing

```typescript
// Simulate two different users interacting with the same contract
const alice = await TestWallet.create({ networkId: "undeployed", initialBalance: 1_000_000n });
const bob = await TestWallet.create({ networkId: "undeployed", initialBalance: 1_000_000n });

// Alice deploys
const aliceProviders = env.createProvidersWithWallet(alice, witnesses);
const deployed = await deployContract(aliceProviders, deployOptions);

// Bob joins
const bobProviders = env.createProvidersWithWallet(bob, witnesses);
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
interface FinalizedDeployTxData<C> {
  public: {
    contractAddress: ContractAddress;
    txId: TransactionId;
    txHash: string;
    blockHeight: number;
  };
  private: {
    signingKey: Uint8Array;
    initialPrivateState: PS;
  };
}
```

### FinalizedCallTxData

```typescript
interface FinalizedCallTxData<C, ICK> {
  public: {
    txId: TransactionId;
    txHash: string;
    blockHeight: number;
  };
}
```

Both types provide the on-chain confirmation data needed to verify that the operation succeeded.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Importing `NodeZkConfigProvider` in browser code | Use `FetchZkConfigProvider` for browser environments |
| Not calling `setNetworkId()` before creating providers | Call once at application startup, before any provider construction |
| Forgetting to unsubscribe from observables | Store subscription references and call `unsubscribe()` in cleanup |
| Using `callTx` when you only need to submit | Use `submitCallTxAsync` to avoid blocking on finalization |
| Mixing circuit keys from different contracts | Each contract has its own `ImpureCircuitId` type; do not share providers across contracts with different circuit sets |
| Using mismatched versions of `@midnight-ntwrk` packages | Pin all SDK dependencies to the same release version. |

## Reference Files

| Topic | Reference File |
|-------|---------------|
| Detailed exports, constructor signatures, and configuration for the SDK packages | `references/package-reference.md` |
| Complete transaction lifecycle with low-level API, proving flow, balancing internals, and finalization | `references/transaction-lifecycle.md` |
| Deploying to mainnet: who can deploy, the compiler to use, Blockfrost endpoints and token, DUST funding, readiness checklist | `references/mainnet-deployment.md` |
