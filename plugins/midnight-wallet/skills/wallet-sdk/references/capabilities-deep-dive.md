# Capabilities Deep Dive

## Overview

`@midnightntwrk/wallet-sdk-capabilities` is a single package with five sub-exports. Each sub-export is a self-contained service module that `WalletFacade.init()` wires together internally. Three of the five (`submission`, `proving`, `pendingTransactions`) can be overridden in `WalletFacade.init()` via optional factory functions; `balancer` and `simulation` are not injected through the facade but are used internally or directly in tests.

All five sub-exports have been import-verified with `npx tsx check-capabilities-imports.ts` against the installed package.

See [wallet-construction.md — Optional Service Overrides](wallet-construction.md#optional-service-overrides) for the facade injection API.

Source of truth: `/tmp/midnight-wallet/packages/capabilities/src/`

---

## `./balancer`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/balancer`

The balancer sub-module provides a coin-selection and transaction-balancing algorithm. It is not a single shared "Balancer" instance that rebalances across all three wallet types. Instead, it exports the building blocks (`getBalanceRecipe`, `chooseCoin`, `CounterOffer`, `Imbalances`, etc.) that each wallet's v1 transacting implementation uses independently. Shielded, unshielded, and dust wallets each call `getBalanceRecipe` with their own coin types.

**Verified exports (from tsx import check):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `CounterOffer<TInput, TOutput>` | Class | Accumulates selected inputs and change outputs while tracking imbalances against a target |
| `Imbalances` | Class + namespace | `Map<TokenType, TokenValue>` with static factory helpers (`empty`, `fromEntry`, `fromEntries`, `fromMap`) |
| `InsufficientFundsError` | Class (plain Error) | Thrown when coin selection cannot cover the required amount for a token type; carries `tokenType` |
| `chooseCoin` | Function | Default coin-selection strategy — picks the first coin that covers the needed amount |
| `createCounterOffer` | Function | Creates a `CounterOffer` and runs the selection loop to produce input/output sets |

**Additional exports (from source):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `getBalanceRecipe<TInput, TOutput>` | Function | Top-level balancing entry point; takes `BalanceRecipeProps` and returns `BalanceRecipe<TInput, TOutput>` |
| `CoinSelection<TInput>` | Type | `(coins, tokenType, amountNeeded, costModel) => TInput \| undefined` — pluggable coin-selection callback |
| `BalanceRecipe<TInput, TOutput>` | Type | `{ inputs: TInput[]; outputs: TOutput[] }` result from balancing |
| `BalanceRecipeProps<TInput, TOutput>` | Type | Full input shape for `getBalanceRecipe` |

**Types from `Imbalances.ts`:**

```typescript
type TokenType = string;
type TokenValue = bigint;
type Imbalance = [TokenType, TokenValue];
type CoinRecipe = { type: TokenType; value: TokenValue };
```

**When to touch this directly:** If you are implementing a custom coin-selection strategy, pass a `CoinSelection<TInput>` implementation through the `V1Builder.withCoinSelection()` method on the relevant wallet builder. You do not interact with the balancer sub-export directly during normal facade usage.

---

## `./submission`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/submission`

Provides the service that serialises and submits finalised transactions to the Midnight node, then tracks their progress through `Submitted → InBlock → Finalized` stages.

**Verified exports (from tsx import check):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `SubmissionError` | `Data.TaggedError` (`_tag: 'SubmissionError'`) | Typed failure for Effect submission variants |
| `SubmissionEvent` | Re-export | Tagged union of submission stages from `wallet-sdk-node-client/effect` |
| `makeDefaultSubmissionService<T>` | Function | Promise-based; creates a `SubmissionService<T>` backed by a real node WebSocket |
| `makeDefaultSubmissionServiceEffect<T>` | Function | Effect-based; creates a `SubmissionServiceEffect<T>` |
| `makeSimulatorSubmissionService` | Function | In-memory submission service for testing |

**Key types:**

```typescript
interface SubmissionService<TTransaction> {
  submitTransaction: SubmitTransactionMethod<TTransaction>;
  close(): Promise<void>;
}

// submitTransaction is overloaded:
// (tx) => Promise<InBlock>
// (tx, 'Submitted') => Promise<Submitted>
// (tx, 'InBlock')   => Promise<InBlock>
// (tx, 'Finalized') => Promise<Finalized>

type DefaultSubmissionConfiguration = {
  relayURL: URL;  // ws:// or wss:// WebSocket URL of the Midnight node
};
```

**When to override in `WalletFacade.init()`:** Override `submissionService` when testing (use `makeSimulatorSubmissionService`), or when you need to route submissions through a custom relay, add retry logic, or log submission events.

```typescript
WalletFacade.init({
  configuration,
  submissionService: (config) => makeSimulatorSubmissionService({
    simulator: mySimulator,
  }),
  // ...
});
```

---

## `./proving`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/proving`

Provides the service that takes an unproven transaction (containing pre-proof placeholders) and returns a proven transaction by calling a Proof Server or Wasm prover.

**Verified exports (from tsx import check):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `ProvingError` | `Data.TaggedError` (`_tag: 'Wallet.Proving'`) | Typed failure for Effect proving variants |
| `fromProvingProvider` | Function | Wraps an existing `ledger.ProvingProvider` into a `ProvingServiceEffect` |
| `fromProvingProviderEffect` | Function | Same as above but the provider is an `Effect` |
| `makeDefaultProvingService` | Function | Promise-based; delegates to HTTP Proof Server |
| `makeDefaultProvingServiceEffect` | Function | Effect-based version of above |

**Additional exports (from source):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `makeServerProvingService` | Function | Explicit HTTP proving service (Promise) |
| `makeServerProvingServiceEffect` | Function | Explicit HTTP proving service (Effect) |
| `makeWasmProvingService` | Function | Wasm-based proving, runs in-process (Promise) |
| `makeWasmProvingServiceEffect` | Function | Wasm-based proving (Effect) |
| `makeSimulatorProvingService` | Function | Returns `ProvingService<ProofErasedTransaction>` — for testing, erases proofs instead of computing them |
| `makeSimulatorProvingServiceEffect` | Function | Effect-based simulator prover |
| `ProvingService<TTransaction>` | Interface | `{ prove(tx: UnprovenTransaction): Promise<TTransaction> }` |
| `ProvingServiceEffect<TTransaction>` | Interface | Same but returns `Effect.Effect<TTransaction, ProvingError>` |
| `UnboundTransaction` | Type alias | `ledger.Transaction<SignatureEnabled, Proof, PreBinding>` — the output of a live prover |

**Key configurations:**

```typescript
type ServerProvingConfiguration = {
  provingServerUrl: URL;    // http:// or https://
};
type WasmProvingConfiguration = {
  keyMaterialProvider?: KeyMaterialProvider;  // from @midnight-ntwrk/zkir-v2
};
```

**When to override in `WalletFacade.init()`:** Override `provingService` to use the Wasm prover (browser environments without a local Proof Server), to use a custom proof server URL, or to swap in the simulator prover during tests.

```typescript
// Testing: skip proof computation
WalletFacade.init({
  configuration,
  provingService: () => makeSimulatorProvingService(),
  // ...
});
```

Note: The facade requires either `provingServerUrl` in the configuration or an explicit `provingService` factory. Without either, `WalletFacade.init()` throws at startup.

---

## `./pendingTransactions`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/pendingTransactions`

Tracks in-flight transactions from submission through to indexer confirmation. The service polls the indexer to update the status of each pending transaction and exposes the current set as an RxJS `Observable`.

**Verified exports (from tsx import check):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `PendingTransactions` | Namespace (re-export) | Contains `PendingTransactions<TTransaction>` type and helpers (`has`, etc.) |
| `PendingTransactionsServiceImpl<T>` | Class | Promise-based pending-transactions service backed by the indexer |
| `PendingTransactionsServiceEffectImpl<T>` | Class | Effect-based implementation |

**Key types:**

```typescript
type PendingTransactionsService<TTransaction> = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  state: () => Observable<PendingTransactions.PendingTransactions<TTransaction>>;
  addPendingTransaction: (tx: TTransaction) => Promise<void>;
  clear: (tx: TTransaction) => Promise<void>;
};

type DefaultPendingTransactionsServiceConfiguration = {
  indexerClientConnection: {
    indexerHttpUrl: string;
    indexerWsUrl?: string;
  };
};
```

The service requires a `TransactionTrait<TTransaction>` — a structural interface that describes how to extract IDs, serialise/deserialise, and check TTL expiry for a given transaction type. The facade's default uses `ledger.FinalizedTransaction`.

**When to override in `WalletFacade.init()`:** Override `pendingTransactionsService` when you need to:
- Persist pending transaction state across page reloads (the default is in-memory).
- Use a different indexer endpoint from the one in `configuration`.
- Inject an in-memory stub for testing.

```typescript
WalletFacade.init({
  configuration,
  pendingTransactionsService: async (config) => {
    const svc = await PendingTransactionsServiceImpl.init({
      txTrait: myTxTrait,
      initialState: await loadPersistedPending(),
      configuration: { indexerClientConnection: { indexerHttpUrl: config.indexerUrl } },
    });
    return svc;
  },
  // ...
});
```

---

## `./simulation`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/simulation`

An in-memory ledger simulator for testing. It replaces the real Midnight node, indexer, and proof server in unit and integration tests. The `Simulator` class manages a complete in-memory `SimulatorState` — including mempool, blocks, ledger state, and time — and exposes it as an Effect `Stream`.

**Verified exports (from tsx import check, partial list):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `Simulator` | Class | Full-featured in-memory blockchain simulator |
| `addToMempool` | Function | State transform: adds a transaction to the in-memory mempool |
| `advanceTime` | Function | State transform: advances the simulator's internal clock |
| `allMempoolTransactions` | Function | State accessor: returns all current mempool transactions |
| `appendBlock` | Function | State transform: appends a new block (used by `BlockProducer`) |

**Additional key exports (from source):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `SimulatorState` | Type | The complete in-memory ledger state: blocks, mempool, ledger, time |
| `immediateBlockProducer` | Const | `BlockProducer` that produces a block after each transaction — useful for tests that want deterministic block progression |
| `SimulatorConfig` | Type | `{ networkId, genesisMints?, blockProducer? }` |
| `blankState` | Function | Produces an initial empty `SimulatorState` |
| `processTransaction` | Function | Validate and apply a single transaction to a `SimulatorState` |
| `createBlock` | Function | Produce a new block from mempool transactions |
| `getLastBlock` | Function | State accessor |

**When to use:** Use `Simulator` whenever you want wallet tests that run without a devnet. The simulator is what `makeSimulatorSubmissionService` and `makeSimulatorProvingService` target internally.

```typescript
import { Simulator, immediateBlockProducer } from "@midnightntwrk/wallet-sdk-capabilities/simulation";
import { makeSimulatorSubmissionService, makeSimulatorProvingService }
  from "@midnightntwrk/wallet-sdk-capabilities/submission";

const simulator = new Simulator({ networkId: 'undeployed', blockProducer: immediateBlockProducer });
const submissionService = makeSimulatorSubmissionService({ simulator });
const provingService = makeSimulatorProvingService();
```

See the `wallet-integration-tests` package in the SDK source (`/tmp/midnight-wallet/packages/wallet-integration-tests/`) for complete examples of simulator-based wallet tests.
