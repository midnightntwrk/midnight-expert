# Effect and Promise APIs

## Overview

Three infrastructure-client packages in the Wallet SDK expose a dual-API pattern: a Promise-based class for straightforward async/await usage, and an Effect-based layer at a `./effect` sub-export for advanced typed-error handling. The prover-client also follows this pattern. In addition, the `submission` and `proving` capability services in `@midnightntwrk/wallet-sdk-capabilities` expose `*Effect` variants of their factory functions.

All three `./effect` sub-exports have been import-verified in the test harness (`npx tsx check-effect-imports.ts` — all three resolve without error).

---

## The Dual-API Pattern

The pattern is consistent across the three infrastructure clients:

| Layer | Style | How to use |
|-------|-------|------------|
| Default export (main entry) | Promise-based class | `new HttpProverClient(config)` / `await PolkadotNodeClient.init(config)` |
| `./effect` sub-export | Effect-based service + Layer | Provide a Layer to the Effect runtime |

**Promise APIs** are the default for most application code. They wrap the underlying Effect service so you can use standard `async/await` without pulling in Effect.

**Effect APIs** return `Effect.Effect<T, E>` with fully typed errors. They are the right choice when you are building an Effect-based codebase, want to compose error types explicitly, or need fine-grained resource management via `Layer` and `Scope`.

---

## `@midnightntwrk/wallet-sdk-node-client`

### Promise API (main export)

```typescript
import { PolkadotNodeClient } from "@midnightntwrk/wallet-sdk-node-client";

const client = await PolkadotNodeClient.init({ nodeURL: new URL("ws://localhost:9944") });

// Returns an RxJS Observable
const stream = client.sendMidnightTransaction(serializedTx);

// Overloaded; waits for a specific submission stage
const result = await client.sendMidnightTransactionAndWait(serializedTx, "Finalized");

await client.close();
```

### Effect API (`./effect` sub-export)

```typescript
import {
  NodeClient,
  PolkadotNodeClient as EffectNodeClient,
  SubmissionEvent,
  NodeClientError,
  type Config,
  makeConfig,
  DEFAULT_CONFIG,
} from "@midnightntwrk/wallet-sdk-node-client/effect";
```

The `NodeClient` is an Effect `Context.Tag` — provide it via `EffectNodeClient.layer(config)`.

`NodeClient.Service` interface:

```typescript
interface Service {
  sendMidnightTransaction(
    serializedTx: SerializedTransaction,
  ): Stream.Stream<SubmissionEvent.SubmissionEvent, NodeClientError.NodeClientError>;
  getGenesis(): Effect.Effect<Genesis, NodeClientError.NodeClientError>;
}
```

**`SubmissionEvent`** is a tagged union (`Submitted | InBlock | Finalized`) with `_tag` discriminant. The three cases carry `txHash: HexString` and `blockHash: HexString` / `blockHeight: bigint` as applicable.

**`NodeClientError`** is a union of seven `Data.TaggedError` subclasses:

| Class | `_tag` | When raised |
|-------|--------|-------------|
| `SubmissionError` | `'SubmissionError'` | Transaction could not be submitted |
| `ConnectionError` | `'ConnectionError'` | WebSocket connection failure |
| `TransactionProgressError` | `'TransactionProgressError'` | Could not reach the desired submission stage |
| `ParseError` | `'ParseError'` | Malformed response from the node |
| `TransactionUsurpedError` | `'TransactionUsurpedError'` | Transaction was replaced by another |
| `TransactionDroppedError` | `'TransactionDroppedError'` | Transaction was dropped from the mempool |
| `TransactionInvalidError` | `'TransactionInvalidError'` | Transaction was rejected as invalid |

---

## `@midnightntwrk/wallet-sdk-indexer-client`

### Main export

The main entry exports GraphQL query documents, subscription documents, and generated types — it does not expose a Promise-based client class directly. Applications consuming the indexer typically either use the `./effect` sub-export or rely on the indexer integration inside the pending-transactions service.

```typescript
import { TransactionStatus, type TransactionStatusQuery } from "@midnightntwrk/wallet-sdk-indexer-client";
```

### Effect API (`./effect` sub-export)

```typescript
import {
  Query,
  Subscription,
  QueryClient,
  HttpQueryClient,
  SubscriptionClient,
  WsSubscriptionClient,
  ConnectionHelper,
  QueryRunner,
} from "@midnightntwrk/wallet-sdk-indexer-client/effect";
```

`QueryClient` is a `Context.Tag`. Its `Service` runs typed GraphQL queries:

```typescript
interface Service {
  query<R, V, T extends Query.Document<R, V>>(
    document: T,
    variables: V,
  ): Effect.Effect<Query.Result<T>, ClientError | ServerError>;
}
```

Errors are `ClientError` and `ServerError` from `@midnightntwrk/wallet-sdk-utilities/networking` — see the error model section below.

---

## `@midnightntwrk/wallet-sdk-prover-client`

### Promise API (main export)

```typescript
import { HttpProverClient } from "@midnightntwrk/wallet-sdk-prover-client";

const prover = new HttpProverClient({ url: "http://localhost:6300" });
const provenTx = await prover.proveTransaction(unprovenTx);
```

### Effect API (`./effect` sub-export)

```typescript
import {
  ProverClient,
  HttpProverClient,
  WasmProver,
} from "@midnightntwrk/wallet-sdk-prover-client/effect";
```

`ProverClient` is a `Context.Tag`. Its `Service` proves transactions and can expose a `ledger.ProvingProvider`:

```typescript
interface Service {
  proveTransaction<S extends Signaturish, B extends Bindingish>(
    tx: Transaction<S, PreProof, B>,
    costModel?: CostModel,
  ): Effect.Effect<Transaction<S, Proof, B>, ClientError | ServerError>;

  asProvingProvider(): ledger.ProvingProvider;
}
```

`HttpProverClient.layer(config)` and `WasmProver.layer(config)` produce the `Layer` needed to provide `ProverClient`.

---

## Capability Services with Effect Variants

The `@midnightntwrk/wallet-sdk-capabilities` package exposes `*Effect` factory functions alongside their Promise equivalents. Both are in the same import path — there is no separate `./effect` sub-export at the capabilities level.

### Submission service

```typescript
import {
  makeDefaultSubmissionService,       // Promise-based
  makeDefaultSubmissionServiceEffect, // Effect-based
  makeSimulatorSubmissionService,     // In-memory, for testing
  SubmissionError,
  SubmissionEvent,
} from "@midnightntwrk/wallet-sdk-capabilities/submission";
```

`SubmissionError` (`_tag: 'SubmissionError'`) is the typed failure for the Effect variants.

### Proving service

```typescript
import {
  makeDefaultProvingService,           // Promise-based (delegates to HTTP proof server)
  makeDefaultProvingServiceEffect,     // Effect-based
  makeServerProvingService,            // Promise-based, HTTP
  makeServerProvingServiceEffect,
  makeWasmProvingService,              // Promise-based, Wasm
  makeWasmProvingServiceEffect,
  makeSimulatorProvingService,         // In-memory proof erasure for testing
  makeSimulatorProvingServiceEffect,
  fromProvingProvider,                 // Wrap an existing ledger.ProvingProvider
  fromProvingProviderEffect,
  ProvingError,
  type ProvingService,
  type ProvingServiceEffect,
  type UnboundTransaction,
} from "@midnightntwrk/wallet-sdk-capabilities/proving";
```

`ProvingError` (`_tag: 'Wallet.Proving'`) is the typed failure for the Effect variants.

---

## The Error Model

All errors in the Effect API extend `Data.TaggedError` from the `effect` library. This gives each error class:

- A `_tag: string` discriminant for exhaustive pattern matching with `Effect.catchTag` or `Effect.catchTags`.
- Value-object equality semantics.
- A standard `message: string` field.

**Cross-cutting networking errors** (from `@midnightntwrk/wallet-sdk-utilities/networking`):

| Class | `_tag` | When raised |
|-------|--------|-------------|
| `ClientError` | `'ClientError'` | Connection issues or bad request data sent to a server |
| `ServerError` | `'ServerError'` | Server-side failure |
| `InvalidProtocolSchemeError` | `'InvalidProtocolSchemeError'` | Wrong URL scheme (e.g. `ftp:` instead of `http:`) |
| `FailedToDeriveWebSocketUrlError` | `'FailedToDeriveWebSocketUrlError'` | Could not derive a WebSocket URL from the given config |

---

## When to Reach for the Effect API

Use the Promise API by default. Reach for the Effect API when:

1. **You are building an Effect-based service** and want to compose layers and typed errors without manually wrapping Promises.
2. **You need exhaustive error handling** — the Effect API surfaces every error class in the return type, making it impossible to accidentally swallow errors.
3. **You need fine-grained resource management** — Effect `Scope` and `Layer` ensure WebSocket connections and Wasm workers are closed deterministically.
4. **You are writing tests** — the `makeSimulatorProvingServiceEffect` and `makeSimulatorSubmissionService` factories produce in-memory implementations that slot directly into the same Effect service interfaces.
