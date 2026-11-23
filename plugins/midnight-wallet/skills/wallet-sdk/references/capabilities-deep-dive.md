# Capabilities Deep Dive

## Overview

`@midnightntwrk/wallet-sdk-capabilities` (4.0.1 in wallet SDK 2.0.1) is a single package with nine sub-exports. Each is a self-contained service module that `WalletFacade.init()` wires together internally.

| Sub-export | What it is | Injectable in `WalletFacade.init()` |
|---|---|---|
| `./balancer` | Coin selection and balancing building blocks | No (per-wallet builder hook) |
| `./submission` | Submits finalized transactions to the node | `submissionService` |
| `./proving` | Proof server / Wasm / simulator provers, one per ledger version | `provingService` |
| `./transactionLifecycle` | Tracks transactions from balancing to inclusion (replaces 1.x `./pendingTransactions`) | `transactionLifecycleService` |
| `./validation` | Pre-submission well-formedness checks and block data | `validationService`, `fetchBlockData` |
| `./simulation` | In-memory ledger simulators for tests | No |
| `./chainVersion` | Reads which protocol version the chain is at (indexer probe) | Via `chainVersionProbe` in configuration |
| `./signatures` | `Signing` types; lift/lower signatures between ledger versions | No |
| `./codecs` | `LedgerParametersCodec` | No |

The sub-export names above, and the export lists in this file, were checked against the installed 4.0.0 package at runtime.

See [wallet-construction.md — Optional Service Overrides](wallet-construction.md#optional-service-overrides) for the facade injection API.

Source of truth: `/tmp/midnight-wallet/packages/capabilities/src/`

---

## `./balancer`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/balancer`

The balancer sub-module provides a coin-selection and transaction-balancing algorithm. It is not a single shared "Balancer" instance that rebalances across all three wallet types. Instead, it exports the building blocks (`getBalanceRecipe`, `chooseCoin`, `CounterOffer`, `Imbalances`, etc.) that each wallet's transacting implementation (v1 and v2) uses independently. Shielded, unshielded, and dust wallets each call `getBalanceRecipe` with their own coin types.

**Exports:**

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

**When to touch this directly:** If you are implementing a custom coin-selection strategy, pass a `CoinSelection<TInput>` implementation through `withCoinSelection()` on the relevant wallet's variant builder (`V1Builder` for ledger 8, `V2Builder` for ledger 9; you need both for a wallet that spans the fork). You do not interact with the balancer sub-export directly during normal facade usage.

---

## `./submission`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/submission`

Provides the service that serialises and submits finalised transactions to the Midnight node, then tracks their progress through `Submitted → InBlock → Finalized` stages.

**Exports:**

| Symbol | Kind | Description |
|--------|------|-------------|
| `SubmissionError` | `Data.TaggedError` (`_tag: 'SubmissionError'`) | Typed failure for Effect submission variants |
| `SubmissionEvent` | Re-export | Tagged union of submission stages from `wallet-sdk-node-client/effect` |
| `makeDefaultSubmissionService<T>` | Function | Promise-based; creates a `SubmissionService<T>` backed by a real node WebSocket |
| `makeDefaultSubmissionServiceEffect<T>` | Function | Effect-based; creates a `SubmissionServiceEffect<T>` |
| `makeV9SimulatorSubmissionService` | Function | `(waitForStatus?) => (config: { simulator }) => SubmissionServiceEffect<T>` — submits into a ledger 9 simulator, for tests (1.x `makeSimulatorSubmissionService`) |

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

**When to override in `WalletFacade.init()`:** Override `submissionService` when testing against a simulator, or when you need to route submissions through a custom relay, add retry logic, or log submission events. The factory must return a Promise-style `SubmissionService<FinalizedTx>`; the simulator factory returns the Effect form, so wrap it as the SDK's own `wallet-integration-tests` do.

---

## `./proving`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/proving`

Provides the services that take an unproven transaction and return a proven one, via a Proof Server, an in-process Wasm prover, or (for tests) a simulator that erases proofs. In 2.0.0 there is one service per ledger version, and the facade uses a **versioned** proving service that routes each transaction to the prover for the protocol version it was built at.

**Exports (main ones):**

| Symbol | Kind | Description |
|--------|------|-------------|
| `ProvingError` | `Data.TaggedError` (`_tag: 'Wallet.Proving'`) | Typed proving failure |
| `ProvingEpochMismatchError`, `UnsupportedProvingVersionError`, `ProvingConfigurationError` | Tagged errors | Wrong-epoch prover, no prover for a version, bad `provers` config |
| `makeDefaultVersionedProvingService` / `…Effect` | Function | `(configuration, forks) => Either<VersionedProvingService…, ProvingConfigurationError>` — what the facade uses by default |
| `makeDefaultProvingServices` | Function | The per-version registry behind the above |
| `makeV9ServerProvingService` / `…Effect` | Function | Ledger 9 Proof Server prover (`{ provingServerUrl }`) |
| `makeV9WasmProvingService` / `…Effect`, `makeV9WasmProvingServices` | Function | Ledger 9 in-process Wasm prover |
| `makeV9SimulatorProvingService` / `…Effect` | Function | Proof-erasing prover for tests |
| `makeV8ServerProvingServiceEffect`, `makeV8WasmProvingServiceEffect`, `makeV8SimulatorProvingService` / `…Effect` | Function | Ledger 8 counterparts |
| `fromV9ProvingProvider` / `…Effect`, `fromV8ProvingProvider` / `…Effect` | Function | Wrap an existing ledger `ProvingProvider` |
| `makeVersionedProvingServiceEffect`, `singleVersionProvingServiceEffect`, `wrapVersionedEffectService` | Function | Build or wrap a versioned service from per-version ones |

1.x's unversioned `makeDefaultProvingService`, `makeServerProvingService`, `makeWasmProvingService`, `makeSimulatorProvingService` and `fromProvingProvider` are gone.

**Key types:**

```typescript
interface ProvingService<TProven, TUnproven> {
  readonly prove: (transaction: TUnproven) => Promise<TProven>;
}
interface VersionedProvingService<TProven, TUnproven> {
  readonly prove: (transaction: TUnproven, protocolVersion: ProtocolVersion) => Promise<TProven>;
}

type DefaultProvingConfiguration = {
  provingServerUrl?: URL;     // one Proof Server for every version
  provers?: ProvingBackends;  // or per version: { v8?: backend, v9: backend }
};
type ProvingBackend =
  | { kind: 'server'; url: URL }
  | { kind: 'wasm'; keyMaterialProvider?: KeyMaterialProvider };
```

**When to override in `WalletFacade.init()`:** Most of the time you don't need to — set `provers` in the configuration to pick server or Wasm per ledger version. Override `provingService` (it must return a `VersionedProvingService`) to swap in a simulator prover during tests or add instrumentation.

Note: the facade needs `provingServerUrl` or `provers` in the configuration, or an explicit `provingService` factory.

---

## `./transactionLifecycle`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/transactionLifecycle`

Replaces 1.x's `./pendingTransactions`. Tracks every transaction the wallet builds from the moment it is balanced, through finalization and submission, until the chain includes it, rejects it, or its TTL passes. It polls the indexer for inclusion and feeds `FacadeState.lifecycle` (see [state-and-balances.md](state-and-balances.md#lifecycle-entries)).

**Exports:**

| Symbol | Kind | Description |
|--------|------|-------------|
| `TransactionLifecycleServiceImpl<T>` | Class | Promise-based service backed by the indexer (`init`, `restore`) |
| `TransactionLifecycleServiceEffectImpl<T>` | Class | Effect-based implementation |
| `Lifecycle` | Namespace | `TransactionLifecycle<T>`, `TransactionFacts<T>` and helpers |
| `LifecycleFormat`, `TransactionTraits` | Namespaces | Serialization format and per-version transaction traits |

**Key types:**

```typescript
type TransactionLifecycleService<TTransaction> = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  state: () => Observable<Lifecycle.TransactionLifecycle<TTransaction>>;
  balanced: (facts: Lifecycle.TransactionFacts<TTransaction>) => Promise<void>;
  finalized: (facts: Lifecycle.TransactionFacts<TTransaction>) => Promise<void>;
  submitted: (facts: Lifecycle.TransactionFacts<TTransaction>) => Promise<void>;
  reverted: (identifiers: readonly string[]) => Promise<void>;
  orphanBeyond: (chainNow: ProtocolVersion) => Promise<void>;
  included: (identifiers: readonly string[], verdict: InclusionVerdict) => Promise<void>;
  serializeState: () => Promise<string>;
};

type DefaultTransactionLifecycleServiceConfiguration = {
  indexerClientConnection: IndexerClientConnection;
};
```

**When to override in `WalletFacade.init()`:** Override `transactionLifecycleService` (factory `(config, { clock }) => service`) to restore lifecycle state saved with `serializeState()` (`TransactionLifecycleServiceImpl.restore(...)`), to use a different indexer endpoint, or to inject a stub in tests. The facade's own default uses `lifecycleTransactionTraits` (exported from `@midnightntwrk/wallet-sdk-facade`).

---

## `./simulation`

**Import:** `@midnightntwrk/wallet-sdk-capabilities/simulation`

In-memory ledger simulators for testing, replacing the node, indexer and proof server in unit and integration tests. In 2.0.0 there is **one simulator per ledger version**, exported under namespaces, plus a composite that crosses the fork:

| Symbol | Kind | Description |
|--------|------|-------------|
| `V9` | Namespace | The ledger 9 simulator: `V9.Simulator`, `V9.immediateBlockProducer`, `V9.SimulatorState`, `V9.blankState`, `V9.processTransaction`, `V9.createBlock`, `V9.getLastBlock`, `V9.scheduleFork`, … |
| `V8` | Namespace | The ledger 8 twin, same API over ledger 8 types |
| `ForkSimulator` | Class | The two composed into one chain that crosses the ledger 9 fork (`ForkSimulator.init(config)`) |
| `LedgerTranslationError`, `translatorFromAsync`, `unavailableTranslator` | | Translating ledger state across the fork |

There is no unqualified `Simulator` export any more: always name the ledger version, `V9.Simulator` or `V8.Simulator`.

`V9.Simulator.init(config?)` returns an `Effect<Simulator, never, Scope>` (not a constructor). `SimulatorConfig` is `{ genesisMints?, networkId?, blockProducer?, protocolVersion?, genesisBlockNumber?, genesisTime? }`.

```typescript
import { Effect } from 'effect';
import { V9 } from '@midnightntwrk/wallet-sdk-capabilities/simulation';

const program = Effect.scoped(
  Effect.gen(function* () {
    const simulator = yield* V9.Simulator.init({
      networkId: 'undeployed',
      blockProducer: V9.immediateBlockProducer(),
    });
    // ... drive wallets against `simulator`
  }),
);
```

**When to use:** Use the simulators whenever you want wallet tests that run without a devnet; use `ForkSimulator` to test behaviour across the ledger 8 → 9 fork. `makeV9SimulatorSubmissionService` and `makeV9SimulatorProvingService` target the ledger 9 simulator.

See the `wallet-integration-tests` package in the SDK source (`/tmp/midnight-wallet/packages/wallet-integration-tests/`) for complete examples of simulator-based wallet tests, including how they plug the simulator services into `WalletFacade.init()`.
