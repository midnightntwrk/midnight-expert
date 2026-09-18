# Errors and Troubleshooting

## Overview

This reference covers the typed error classes emitted by the Wallet SDK at the Effect-API level. All errors extend `Data.TaggedError` from the `effect` library, giving each class a `_tag: string` discriminant for exhaustive pattern matching. The wallet-layer errors are internal to the variant implementations; they propagate to callers through `WalletFacade` method rejections or through the `rawState` stream.

For symptom-to-fix guidance for end-users and test script authors, see [managing-test-wallets: references/troubleshooting.md](../../managing-test-wallets/references/troubleshooting.md).

Source of truth:
- `/tmp/midnight-wallet/packages/shielded-wallet/src/v1/WalletError.ts`
- `/tmp/midnight-wallet/packages/unshielded-wallet/src/v1/WalletError.ts`
- `/tmp/midnight-wallet/packages/dust-wallet/src/v1/WalletError.ts`
- `/tmp/midnight-wallet/packages/runtime/src/abstractions/WalletRuntimeError.ts`
- `/tmp/midnight-wallet/packages/utilities/src/networking/`
- `/tmp/midnight-wallet/packages/node-client/src/effect/NodeClientError.ts`

---

## The Error Model

```typescript
// Pattern: every SDK error extends Data.TaggedError from effect
class SomeError extends Data.TaggedError('SomeError')<{ message: string; cause?: unknown }> {}
```

The `_tag` field on each instance equals the string passed to `Data.TaggedError(...)`. Use this for discriminated union handling:

```typescript
import { Effect } from "effect";

Effect.catchTags(someEffect, {
  'Wallet.InsufficientFunds': (err) => handleInsufficientFunds(err.tokenType, err.amount),
  'Wallet.Sync':              (err) => handleSyncError(err.message),
  'WalletRuntimeError':       (err) => handleRuntimeError(err.message),
});
```

---

## Per-Wallet Errors

### Shielded Wallet (`@midnightntwrk/wallet-sdk-shielded`)

Source: `/tmp/midnight-wallet/packages/shielded-wallet/src/v1/WalletError.ts`

`type WalletError` is a union of:

| Class | `_tag` | Fields | When raised |
|-------|--------|--------|-------------|
| `OtherWalletError` | `'Wallet.Other'` | `message`, `cause?` | Catch-all for unclassified errors |
| `InsufficientFundsError` | `'Wallet.InsufficientFunds'` | `message`, `tokenType: RawTokenType`, `amount: bigint` | Coin selection cannot cover the required amount |
| `SubmissionError` | `'Wallet.SubmissionWalletError'` | `message`, `cause?` | Transaction rejected by the submission pipeline |
| `AddressError` | `'Wallet.Address'` | `message`, `originalAddress: string`, `cause?` | Malformed or invalid shielded address |
| `SyncWalletError` | `'Wallet.Sync'` | `message`, `cause?` | Error during sync — typically a network or decryption failure |
| `InvalidCoinHashesError` | `'Wallet.InvalidCoinHashes'` | `message`, `missingNonces: Set<Nonce>` | Some expected coin nonces are absent from the state |
| `TransactingError` | `'Wallet.Transacting'` | `message`, `cause?` | Error during transaction construction |
| `TransactionHistoryError` | `'Wallet.TransactionHistory'` | `message`, `cause?` | Error accessing or writing transaction history |
| `LedgerOps.LedgerError` | `'LedgerError'` | `message`, `cause?` | Error returned by the `@midnight-ntwrk/ledger-v8` library |

Note: `SubmissionError` here is a *wallet-level* error (tag `'Wallet.SubmissionWalletError'`), distinct from `SubmissionError` in `@midnightntwrk/wallet-sdk-capabilities/submission` (tag `'SubmissionError'`).

### Unshielded Wallet (`@midnightntwrk/wallet-sdk-unshielded-wallet`)

Source: `/tmp/midnight-wallet/packages/unshielded-wallet/src/v1/WalletError.ts`

`type WalletError` is a union of:

| Class | `_tag` | Fields | When raised |
|-------|--------|--------|-------------|
| `OtherWalletError` | `'Wallet.Other'` | `message`, `cause?` | Catch-all |
| `SyncWalletError` | `'Wallet.Sync'` | `message`, `cause?` | Sync failure |
| `InsufficientFundsError` | `'Wallet.InsufficientFunds'` | `message`, `tokenType: RawTokenType`, `amount: bigint` | Cannot cover amount |
| `AddressError` | `'Wallet.Address'` | `message`, `originalAddress: string`, `cause?` | Invalid unshielded address |
| `TransactingError` | `'Wallet.Transacting'` | `message`, `cause?` | Transaction construction error |
| `SignError` | `'Wallet.Sign'` | `message`, `cause?` | Failed to sign a transaction segment |
| `ApplyTransactionError` | `'Wallet.ApplyTransaction'` | `message`, `cause?` | Error applying a confirmed transaction to wallet state |
| `RollbackUtxoError` | `'Wallet.RollbackUtxo'` | `message`, `utxo: Utxo`, `cause?` | Error rolling back a UTXO (e.g. stale UTXO handling) |
| `SpendUtxoError` | `'Wallet.SpendUtxo'` | `message`, `utxo: Utxo`, `cause?` | Error spending a UTXO |
| `TransactionHistoryError` | `'Wallet.TransactionHistory'` | `message`, `cause?` | Transaction history error |

Also exported (not in the union): `UtxoNotFoundError` (`_tag: 'UtxoNotFoundError'`, field `utxo: Utxo`) — raised when a specific UTXO is expected but absent.

### Dust Wallet (`@midnightntwrk/wallet-sdk-dust-wallet`)

Source: `/tmp/midnight-wallet/packages/dust-wallet/src/v1/WalletError.ts`

`type WalletError` is a union of:

| Class | `_tag` | Fields | When raised |
|-------|--------|--------|-------------|
| `OtherWalletError` | `'Wallet.Other'` | `message`, `cause?` | Catch-all |
| `SyncWalletError` | `'Wallet.Sync'` | `message`, `cause?` | Sync failure |
| `TransactingError` | `'Wallet.Transacting'` | `message`, `cause?` | Transaction construction |
| `InsufficientFundsError` | `'Wallet.InsufficientFunds'` | `message`, `tokenType: string` | Cannot cover DUST amount (note: no `amount` field — lighter version) |
| `TransactionHistoryError` | `'Wallet.TransactionHistory'` | `message`, `cause?` | Transaction history error |
| `LedgerOps.LedgerError` | `'LedgerError'` | `message`, `cause?` | Ledger library error |

The dust wallet has a narrower error surface than shielded or unshielded — it does not handle address errors, coin-hash errors, or UTXO rollback directly.

---

## Cross-Cutting Errors

### `WalletRuntimeError`

Source: `/tmp/midnight-wallet/packages/runtime/src/abstractions/WalletRuntimeError.ts`

```typescript
class WalletRuntimeError extends Data.TaggedError('WalletRuntimeError')<{
  message: string;
  cause?: unknown;
}>
```

Emitted by `Runtime.dispatch` and through the `stateChanges` stream when the runtime itself encounters a failure: empty variant list, variant initialization failure, or an unrecoverable error in the running variant stream. This is the error that surfaces if the variant system breaks down — it wraps lower-level failures.

**Import:** `import { WalletRuntimeError } from "@midnightntwrk/wallet-sdk-runtime/abstractions";`

### Networking Errors

Source: `/tmp/midnight-wallet/packages/utilities/src/networking/`

These are shared across all infrastructure clients:

| Class | `_tag` | When raised |
|-------|--------|-------------|
| `ClientError` | `'ClientError'` | Connection failure or bad request sent to a server |
| `ServerError` | `'ServerError'` | Server-side failure |
| `InvalidProtocolSchemeError` | `'InvalidProtocolSchemeError'` | Wrong URL scheme (e.g. `ftp:` for an HTTP endpoint) |
| `FailedToDeriveWebSocketUrlError` | `'FailedToDeriveWebSocketUrlError'` | Cannot derive WebSocket URL from config |

`URLError = InvalidProtocolSchemeError | FailedToDeriveWebSocketUrlError`

**Import:** `import { ClientError, ServerError, InvalidProtocolSchemeError } from "@midnightntwrk/wallet-sdk-utilities/networking";`

### Node Client Errors

Source: `/tmp/midnight-wallet/packages/node-client/src/effect/NodeClientError.ts`

```typescript
type NodeClientError =
  | SubmissionError
  | ConnectionError
  | TransactionProgressError
  | ParseError
  | TransactionUsurpedError
  | TransactionDroppedError
  | TransactionInvalidError;
```

| Class | `_tag` | Key fields | When raised |
|-------|--------|------------|-------------|
| `SubmissionError` | `'SubmissionError'` | `message`, `txData`, `cause?` | Transaction could not be submitted to the node |
| `ConnectionError` | `'ConnectionError'` | `message`, `cause?` | WebSocket disconnection or connection failure |
| `TransactionProgressError` | `'TransactionProgressError'` | `message`, `txData`, `desiredStage` | Could not reach the requested submission stage (`InBlock`, `Finalized`) |
| `ParseError` | `'ParseError'` | `message`, `cause?` | Malformed response from the node |
| `TransactionUsurpedError` | `'TransactionUsurpedError'` | `message`, `txData: Uint8Array` | Transaction was replaced by another (nonce collision) |
| `TransactionDroppedError` | `'TransactionDroppedError'` | `message`, `txData: Uint8Array` | Transaction was dropped from the mempool |
| `TransactionInvalidError` | `'TransactionInvalidError'` | `message`, `txData: Uint8Array`, `cause?` | Node rejected the transaction as invalid |

**Import:** `import { NodeClientError } from "@midnightntwrk/wallet-sdk-node-client/effect";`

### `LedgerError`

Source: `/tmp/midnight-wallet/packages/utilities/src/LedgerOps.ts`

```typescript
class LedgerError extends Data.TaggedError('LedgerError')<{ message: string; cause?: unknown }>
```

Wraps errors thrown by `@midnight-ntwrk/ledger-v8` operations. It is included in the `WalletError` union for shielded and dust wallets. The `cause` field holds the original ledger exception.

---

## Symptom → Error Type

| Symptom | Likely error type(s) | Where to look |
|---------|---------------------|---------------|
| Sync progress never reaches zero (`sourceGap > 0`) | `ConnectionError` (node), `SyncWalletError` | Check node WebSocket URL; inspect `rawState` errors |
| Sync applies but state stream emits `WalletRuntimeError` | `WalletRuntimeError` | Variant initialization failed; check configuration |
| Transaction submit throws or rejects | `SubmissionError` (capability-level), `TransactionInvalidError` (node-level) | Inspect rejection reason; check ledger version compatibility |
| Transfer fails with insufficient funds | `InsufficientFundsError` (`_tag: 'Wallet.InsufficientFunds'`) | Check `tokenType` and `amount` fields for which token is short |
| DUST-related failure | `InsufficientFundsError` from the dust wallet (`tokenType` will be the DUST token type) | Ensure DUST has been registered and accrued |
| Stale UTXO / UTXO not found | `SpendUtxoError`, `RollbackUtxoError`, `UtxoNotFoundError` (unshielded) | A concurrent spend or sync gap consumed the UTXO; wait for sync and retry |
| Address parsing failure | `AddressError` | Verify address format; check `networkId` matches the address prefix |
| Proof server unreachable | `ClientError` or `ServerError` (networking), `ProvingError` (capabilities) | Check `provingServerUrl`; ensure proof server is running |
| Transaction dropped or usurped | `TransactionDroppedError`, `TransactionUsurpedError` | Resubmit; check for nonce collision; inspect node mempool |

---

## Working with Typed Errors in Practice

Because the facade's Promise methods throw plain `Error`-derived objects when they fail, typed matching is most practical when using the Effect API directly.

When using the Promise API, check `error.constructor.name` or `error._tag` (if the Error subclass exposes it) to identify the type:

```typescript
try {
  await facade.shielded.transferNight({ ... });
} catch (err) {
  if (err && typeof err === 'object' && '_tag' in err) {
    switch ((err as { _tag: string })._tag) {
      case 'Wallet.InsufficientFunds':
        console.error('Not enough funds for token:', (err as InsufficientFundsError).tokenType);
        break;
      case 'Wallet.Sync':
        console.error('Wallet is not yet synced');
        break;
    }
  }
}
```

For full typed-error composition, use the Effect API sub-exports and `Effect.catchTags`.
