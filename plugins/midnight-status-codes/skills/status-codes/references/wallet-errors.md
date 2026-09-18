# Midnight Wallet SDK — Error Reference

> **Last verified:** 2026-05-04 against published npm tarballs of `@midnightntwrk/wallet-sdk-*` packages (source repo `midnight-ntwrk/artifacts` is private; package versions per section). Most packages last published 2026-04-23.

All errors in the Midnight wallet SDK are Effect `Data.TaggedError` instances unless noted otherwise. Catch them with `Effect.catchTag` using the `_tag` field shown for each error. Union types can be caught with `Effect.catchTags`.

---

## Node Client (`@midnightntwrk/wallet-sdk-node-client`)

These 7 errors form the `NodeClientError` union type.

### `SubmissionError`

| Field | Value |
|-------|-------|
| `_tag` | `'SubmissionError'` |
| Fields | `message: string`, `txData: unknown`, `cause?: unknown` |

Transaction submission to the node failed.

**Fix:** Inspect `message` and `cause` for the underlying reason. Check node connectivity and that the transaction is well-formed.

```ts
Effect.catchTag('SubmissionError', (e) => ...)
```

---

### `ConnectionError`

| Field | Value |
|-------|-------|
| `_tag` | `'ConnectionError'` |

WebSocket connection to the node failed.

**Known messages:**
- `"Could not connect within specified time range (5s)"` — node is unreachable or slow to respond
- `"Failed to retrieve genesis transactions"` — connected but genesis data unavailable

**Fix:** Verify the node WebSocket URL is correct and the node is running. Increase connection timeout if the node is on a slow network.

```ts
Effect.catchTag('ConnectionError', (e) => ...)
```

---

### `TransactionProgressError`

| Field | Value |
|-------|-------|
| `_tag` | `'TransactionProgressError'` |

A submitted transaction did not reach the desired lifecycle stage within the expected time.

**Known messages:**
- `"Transaction did not reach finality within expected time"`

**Fix:** Check network congestion and node health. The transaction may still be in the mempool — query its status before resubmitting.

```ts
Effect.catchTag('TransactionProgressError', (e) => ...)
```

---

### `ParseError`

| Field | Value |
|-------|-------|
| `_tag` | `'ParseError'` |

Failed to parse a result returned by the node.

**Fix:** Usually indicates a protocol version mismatch between the SDK and the node. Check that SDK and node versions are compatible.

```ts
Effect.catchTag('ParseError', (e) => ...)
```

---

### `TransactionUsurpedError`

| Field | Value |
|-------|-------|
| `_tag` | `'TransactionUsurpedError'` |

The transaction was replaced by another transaction that matched the same discriminators.

**Fix:** The original transaction is no longer relevant. If the replacement was unintended, investigate which process submitted a conflicting transaction.

```ts
Effect.catchTag('TransactionUsurpedError', (e) => ...)
```

---

### `TransactionDroppedError`

| Field | Value |
|-------|-------|
| `_tag` | `'TransactionDroppedError'` |

The transaction was dropped, most likely because the mempool is full.

**Fix:** Wait for the mempool to drain and resubmit. Consider increasing the transaction fee if fee-prioritisation is supported.

```ts
Effect.catchTag('TransactionDroppedError', (e) => ...)
```

---

### `TransactionInvalidError`

| Field | Value |
|-------|-------|
| `_tag` | `'TransactionInvalidError'` |

The transaction was rejected by the node as invalid.

**Fix:** The transaction itself is malformed or violates node validation rules. Review the transaction construction logic. Do not resubmit without changes.

```ts
Effect.catchTag('TransactionInvalidError', (e) => ...)
```

---

## Shielded Wallet (`@midnightntwrk/wallet-sdk-shielded`)

> **Package version:** 3.0.0.

The exported `WalletError` union has **8 members** — 7 wallet-specific errors plus the shared `LedgerError` from the utilities package:

```ts
export type WalletError =
  | OtherWalletError | InsufficientFundsError | SubmissionError
  | AddressError | SyncWalletError | InvalidCoinHashesError
  | TransactingError | LedgerOps.LedgerError;
```

`TransactionHistoryError` is also exported by the package but is **not a member of the union type**.

### `OtherWalletError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.Other'` |

Catch-all for wallet errors that do not fit a more specific category.

**Fix:** Inspect the error details. If this surfaces in production, consider opening an issue with a reproduction case.

```ts
Effect.catchTag('Wallet.Other', (e) => ...)
```

---

### `SyncWalletError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.Sync'` |

Error encountered while syncing the wallet with the blockchain.

**Fix:** Check connectivity to the node. Retry the sync operation. Persistent failures may indicate a corrupted local state.

```ts
Effect.catchTag('Wallet.Sync', (e) => ...)
```

---

### `SubmissionError` (Shielded Wallet)

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.SubmissionWalletError'` |

A wrapper around submission errors that occur at the wallet layer (distinct from the node-client `SubmissionError`).

**Fix:** Unwrap and inspect the underlying cause. Usually delegates to the node-client submission path.

```ts
Effect.catchTag('Wallet.SubmissionWalletError', (e) => ...)
```

---

### `InsufficientFundsError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.InsufficientFunds'` |
| Fields | `message: string`, `tokenType: ledger.RawTokenType`, `amount: bigint` |

The wallet does not hold enough tokens of the specified type to complete the operation.

**Fix:** Check the wallet balance for `tokenType` before constructing the transaction. Request a top-up or reduce the transfer amount.

```ts
Effect.catchTag('Wallet.InsufficientFunds', (e) => {
  console.log(`Need more ${e.tokenType}, shortfall: ${e.amount}`)
})
```

---

### `AddressError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.Address'` |
| Fields | `message: string`, `originalAddress: string`, `cause?: unknown` |

The provided address is invalid.

**Fix:** Validate the address format before use. See `@midnightntwrk/wallet-sdk-address-format` for format rules. The `originalAddress` field contains the rejected input.

```ts
Effect.catchTag('Wallet.Address', (e) => ...)
```

---

### `InvalidCoinHashesError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.InvalidCoinHashes'` |
| Fields | `missingNonces: Set<ledger.Nonce>` |

One or more coins are missing their required nonce hashes.

**Fix:** Ensure coins are fully synced before spending. The `missingNonces` field identifies which coins are affected.

```ts
Effect.catchTag('Wallet.InvalidCoinHashes', (e) => ...)
```

---

### `TransactingError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.Transacting'` |

Error during transaction construction or fee balancing.

**Fix:** Check that inputs are valid and that the fee token balance is sufficient. Review transaction parameters.

```ts
Effect.catchTag('Wallet.Transacting', (e) => ...)
```

---

### `TransactionHistoryError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.TransactionHistory'` |

Error reading or writing the transaction history store.

**Fix:** Check local storage availability and permissions. The history store may be corrupted — clearing and resyncing is a recovery option.

```ts
Effect.catchTag('Wallet.TransactionHistory', (e) => ...)
```

---

## Unshielded Wallet (`@midnightntwrk/wallet-sdk-unshielded-wallet`)

> **Package version:** 3.0.0.

The exported `WalletError` union has **9 members** (note: this differs from the shielded wallet — `SubmissionError`, `InvalidCoinHashesError`, and `TransactionHistoryError` are NOT in the unshielded union):

```ts
export type WalletError =
  | OtherWalletError | InsufficientFundsError | AddressError | SyncWalletError
  | TransactingError | SignError | ApplyTransactionError
  | RollbackUtxoError | SpendUtxoError;
```

In addition, the package exports `UtxoNotFoundError` and `TransactionHistoryError` as standalone classes — they are not members of the union but can be thrown by package APIs.

### `SignError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.Sign'` |

Failed to sign a transaction.

**Fix:** Ensure the signing key is available and not locked. Check hardware wallet connectivity if applicable.

```ts
Effect.catchTag('Wallet.Sign', (e) => ...)
```

---

### `ApplyTransactionError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.ApplyTransaction'` |

Failed to apply a transaction to the local UTXO set.

**Fix:** Usually follows a submission error. Verify the transaction was accepted by the node before attempting to apply it locally.

```ts
Effect.catchTag('Wallet.ApplyTransaction', (e) => ...)
```

---

### `RollbackUtxoError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.RollbackUtxo'` |

Failed to roll back a UTXO during a chain reorganisation.

**Fix:** Chain reorgs are expected. If rollback fails repeatedly, the local UTXO state may be inconsistent — a full resync may be required.

```ts
Effect.catchTag('Wallet.RollbackUtxo', (e) => ...)
```

---

### `SpendUtxoError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.SpendUtxo'` |

Failed to mark a UTXO as spent.

**Fix:** The UTXO may already be spent or not present in the local set. Resync the wallet to reconcile state.

```ts
Effect.catchTag('Wallet.SpendUtxo', (e) => ...)
```

---

### `UtxoNotFoundError`

| Field | Value |
|-------|-------|
| `_tag` | `'UtxoNotFoundError'` |

A referenced UTXO could not be found in the local set.

**Fix:** Ensure the wallet is fully synced. The UTXO may have already been spent or the sync may be behind the chain tip.

```ts
Effect.catchTag('UtxoNotFoundError', (e) => ...)
```

---

## Dust Wallet (`@midnightntwrk/wallet-sdk-dust-wallet`)

> **Package version:** 4.0.0.

The exported `WalletError` union has **6 members**:

```ts
export type WalletError =
  | OtherWalletError | SyncWalletError | TransactingError
  | InsufficientFundsError | TransactionHistoryError | LedgerOps.LedgerError;
```

| Error | `_tag` |
|-------|--------|
| `OtherWalletError` | `'Wallet.Other'` |
| `SyncWalletError` | `'Wallet.Sync'` |
| `TransactingError` | `'Wallet.Transacting'` |
| `InsufficientFundsError` | `'Wallet.InsufficientFunds'` |
| `TransactionHistoryError` | `'Wallet.TransactionHistory'` |
| `LedgerError` | `'LedgerError'` (from utilities) |

See the [Shielded Wallet](#shielded-wallet-midnight-ntwrkwallet-sdk-shielded) section for field details and fixes.

---

## Capabilities (`@midnightntwrk/wallet-sdk-capabilities`)

### `ProvingError`

| Field | Value |
|-------|-------|
| `_tag` | `'Wallet.Proving'` |

Wraps errors from the proving provider (e.g. the proof server).

**Fix:** Check proof server connectivity and that the correct circuit keys are loaded. Inspect the wrapped cause for the underlying provider error.

```ts
Effect.catchTag('Wallet.Proving', (e) => ...)
```

---

### `SubmissionError` (Capabilities)

| Field | Value |
|-------|-------|
| `_tag` | `'SubmissionError'` |

Submission error raised at the capabilities/service layer.

**Fix:** Same as node-client `SubmissionError`. Check node connectivity and transaction validity.

```ts
Effect.catchTag('SubmissionError', (e) => ...)
```

---

### `InsufficientFundsError` (Capabilities — native Error)

This is a plain JavaScript `Error`, **not** a `Data.TaggedError`. It is thrown (not yielded as an Effect failure) during coin selection.

**Known messages:**
- `"Insufficient Funds: could not balance <tokenType>"` — where `<tokenType>` is the token identifier

**Fix:** Catch with standard `try/catch` or `Effect.tryPromise`. Ensure the wallet has enough of the specified token type before invoking coin selection.

---

## Utilities (`@midnightntwrk/wallet-sdk-utilities`)

### `LedgerError`

| Field | Value |
|-------|-------|
| `_tag` | `'LedgerError'` |

Wraps exceptions thrown by the ledger WASM module.

**Fix:** Inspect the wrapped cause. Usually indicates invalid state passed to the ledger. Check that ledger inputs are well-formed.

```ts
Effect.catchTag('LedgerError', (e) => ...)
```

---

### `LeftError<L>`

| Field | Value |
|-------|-------|
| `_tag` | `'LeftError'` |

Raised when an `Either.Left` value is encountered where a `Right` was expected.

**Fix:** Check the logic that produces the `Either` value. A `Left` here indicates an unhandled error branch.

```ts
Effect.catchTag('LeftError', (e) => ...)
```

---

### `InvalidProtocolSchemeError`

| Field | Value |
|-------|-------|
| `_tag` | `'InvalidProtocolSchemeError'` |

The URL provided uses a protocol scheme that is not supported.

**Fix:** Ensure URLs use the expected scheme (e.g. `ws://` or `wss://` for WebSocket connections, `http://` or `https://` for HTTP).

```ts
Effect.catchTag('InvalidProtocolSchemeError', (e) => ...)
```

---

### `FailedToDeriveWebSocketUrlError`

| Field | Value |
|-------|-------|
| `_tag` | `'FailedToDeriveWebSocketUrlError'` |

The system could not derive a WebSocket URL from the provided input.

**Fix:** Check that the input URL is well-formed and that the derivation logic covers the provided scheme/host combination.

```ts
Effect.catchTag('FailedToDeriveWebSocketUrlError', (e) => ...)
```

---

### `ClientError`

| Field | Value |
|-------|-------|
| `_tag` | `'ClientError'` |

A client-side networking error, corresponding to HTTP 400–499 status codes.

**Fix:** These indicate a problem with the request (bad input, authentication failure, not found). Do not retry without changing the request. Inspect the error for the specific status code.

```ts
Effect.catchTag('ClientError', (e) => ...)
```

---

### `ServerError`

| Field | Value |
|-------|-------|
| `_tag` | `'ServerError'` |

A server-side error, corresponding to HTTP 500+ status codes.

**Retry behaviour:** The SDK automatically retries on HTTP 502, 503, and 504 (gateway/service unavailable errors).

**Fix:** For persistent 500 errors, check server logs. Transient 502–504 errors are retried automatically.

```ts
Effect.catchTag('ServerError', (e) => ...)
```

---

## Runtime (`@midnightntwrk/wallet-sdk-runtime`)

### `WalletRuntimeError`

| Field | Value |
|-------|-------|
| `_tag` | `'WalletRuntimeError'` |

A configuration error in the wallet runtime.

**Known messages:**
- `"No variant to init"` — no wallet variant was provided during initialisation
- `"Empty variants list"` — the variants list supplied to the runtime is empty
- `"NumericRange error"` — emitted from `dist/testing/variants.js` for numeric range failures

**Fix:** Ensure at least one wallet variant is configured before initialising the runtime.

```ts
Effect.catchTag('WalletRuntimeError', (e) => ...)
```

---

## Address Format (`@midnightntwrk/wallet-sdk-address-format`)

These are plain JavaScript `Error` throws, not `Data.TaggedError` instances. Catch with standard `try/catch`.

| Message (verbatim) | Cause |
|---------|-------|
| `` `Expected prefix ${MidnightBech32m.prefix}` `` | Address does not start with the configured prefix. The prefix is dynamic (`mn` for mainnet; `mn_<network>` for non-mainnet) — the message inlines the actual expected value. |
| `` `Segment ${segmentName}: ${segment} contains disallowed characters. Allowed characters are only numbers, latin letters and a hyphen` `` | Named address segment has characters outside the allowed set |
| `"Expected type <expected>, got <actual>"` | Address type byte does not match the expected type |
| `` `Expected ${networkId} address, got ${other} one` `` | Address belongs to a different network than expected |
| `"Coin public key needs to be 32 bytes long"` | Public key component is the wrong length |
| `"Unshielded address needs to be 32 bytes long"` | Unshielded address payload is the wrong length |
| `"Dust address is too large"` | Dust address exceeds the maximum allowed size |

**Fix:** Validate address strings before passing them to the address-format API. Use the shielded wallet's `AddressError` (`'Wallet.Address'`) for higher-level address validation.

---

## Pallet Errors (`augment-api-errors.ts` — auto-generated)

These errors originate from the `midnight` pallet on-chain. They are surfaced as decoded extrinsic events and are not `Data.TaggedError` instances.

| Pallet Error | Description |
|--------------|-------------|
| `ContractCallCostError` | The cost of a contract call could not be computed |
| `Deserialization` | Failed to deserialise pallet input data |
| `LedgerCacheError` | Error accessing the ledger cache |
| `LedgerStateScaleDecodingError` | Failed to SCALE-decode ledger state |
| `NewStateOutOfBounds` | The new contract state exceeds size bounds |
| `NoLedgerState` | No ledger state found for the contract |
| `Serialization` | Failed to serialise pallet output data |
| `Transaction` | Generic pallet transaction error |

**Fix:** These errors indicate on-chain validation failures. Review the contract call parameters and ensure ledger state is within bounds. `Deserialization`/`Serialization` errors often indicate a SDK–node version mismatch.

---

## Complete Tag Registry

All 29 `_tag` values, alphabetically:

| `_tag` | Package | Error type |
|--------|---------|-----------|
| `'ClientError'` | utilities | `ClientError` |
| `'ConnectionError'` | node-client | `ConnectionError` |
| `'FailedToDeriveWebSocketUrlError'` | utilities | `FailedToDeriveWebSocketUrlError` |
| `'InvalidProtocolSchemeError'` | utilities | `InvalidProtocolSchemeError` |
| `'LeftError'` | utilities | `LeftError<L>` |
| `'LedgerError'` | utilities | `LedgerError` |
| `'ParseError'` | node-client | `ParseError` |
| `'ServerError'` | utilities | `ServerError` |
| `'SubmissionError'` | node-client, capabilities | `SubmissionError` |
| `'TransactionDroppedError'` | node-client | `TransactionDroppedError` |
| `'TransactionInvalidError'` | node-client | `TransactionInvalidError` |
| `'TransactionProgressError'` | node-client | `TransactionProgressError` |
| `'TransactionUsurpedError'` | node-client | `TransactionUsurpedError` |
| `'UtxoNotFoundError'` | unshielded-wallet | `UtxoNotFoundError` |
| `'Wallet.Address'` | shielded-wallet, unshielded-wallet | `AddressError` |
| `'Wallet.ApplyTransaction'` | unshielded-wallet | `ApplyTransactionError` |
| `'Wallet.InsufficientFunds'` | shielded-wallet, unshielded-wallet, dust-wallet | `InsufficientFundsError` |
| `'Wallet.InvalidCoinHashes'` | shielded-wallet, unshielded-wallet | `InvalidCoinHashesError` |
| `'Wallet.Other'` | shielded-wallet, unshielded-wallet, dust-wallet | `OtherWalletError` |
| `'Wallet.Proving'` | capabilities | `ProvingError` |
| `'Wallet.RollbackUtxo'` | unshielded-wallet | `RollbackUtxoError` |
| `'Wallet.Sign'` | unshielded-wallet | `SignError` |
| `'Wallet.SpendUtxo'` | unshielded-wallet | `SpendUtxoError` |
| `'Wallet.SubmissionWalletError'` | shielded-wallet, unshielded-wallet | `SubmissionError` (wallet) |
| `'Wallet.Sync'` | shielded-wallet, unshielded-wallet, dust-wallet | `SyncWalletError` |
| `'Wallet.Transacting'` | shielded-wallet, unshielded-wallet, dust-wallet | `TransactingError` |
| `'Wallet.TransactionHistory'` | shielded-wallet, unshielded-wallet | `TransactionHistoryError` |
| `'WalletRuntimeError'` | runtime | `WalletRuntimeError` |

> Note: The two tags not shown in the 28 above — `'FailedToDeriveWebSocketUrlError'` and `'InvalidProtocolSchemeError'` — bring the total to 29 distinct tags. The `InsufficientFundsError` in `capabilities` is a native `Error` with no `_tag` and is excluded from this registry.

---

## Wallet Facade (`@midnightntwrk/wallet-sdk-facade`)

> **Package version:** 4.0.0.

The facade orchestration layer throws **plain `Error` instances** (not `Data.TaggedError`). Catch with `try/catch` and inspect `error.message`:

| Message | Meaning | Fix |
|---------|---------|-----|
| `"Missing required configuration: 'provingServerUrl' must be set in config, or provide a custom provingService in init parameters."` | Init was called without a proving service or proving-server URL | Either pass `provingServerUrl` in the config or supply a custom `provingService` |
| `"Terms and Conditions are not currently set on the network."` | The chain has no T&C state set | Operator/governance must set the T&C before this flow can proceed |
| `"Dust generation transaction is missing intent segment 1."` | Dust generation tx missing required intent segment | Internal SDK error; rebuild the dust generation tx via the facade |
| `"No balancing transaction was created. Please check your transaction."` | Balancer produced no balancing tx (raised from 2 sites) | Check that inputs and outputs need balancing; verify the source tx |
| `"At least one shielded or unshielded output is required."` | Tx has no outputs | Add at least one output before submission |
| `"At least one shielded or unshielded swap is required."` | Swap tx has no swap entries | Add at least one swap entry |
| `"Unexpected transaction state."` | State machine in a transitional state it doesn't expect | Internal SDK error; report with reproduction |
| `"At least one Night UTXO is required."` | Operation requires at least one NIGHT UTXO | Acquire NIGHT before submitting |

## Other Packages (no own tagged errors)

These packages are part of the wallet SDK but expose no `Data.TaggedError` types of their own — failures surface via utilities `ClientError`/`ServerError` or as native `Error`/`TypeError`:

| Package | Version | Notes |
|---------|---------|-------|
| `@midnightntwrk/wallet-sdk` | 1.0.0 | Barrel re-export only; the recommended entry point. |
| `@midnightntwrk/wallet-sdk-indexer-client` | 1.2.1 | Uses utilities `ClientError`/`ServerError`. |
| `@midnightntwrk/wallet-sdk-prover-client` | 1.2.1 | Used by `ProvingError` in capabilities. Surfaces utilities client/server errors. |
| `@midnightntwrk/wallet-sdk-abstractions` | 2.1.0 | Throws `new TypeError('Invalid protocol version range.')` from `dist/ProtocolVersion.js`. Native `TypeError`, not tagged. |
| `@midnightntwrk/wallet-sdk-hd` | 3.0.2 | No errors. |
