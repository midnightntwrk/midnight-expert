# Transactions

The Wallet SDK transaction pipeline moves a payment or contract interaction through five stages: create, balance, sign, prove, and submit. Every public method on `WalletFacade` that touches transactions follows this lifecycle.

## Transaction Lifecycle Overview

| Stage | Input | Output | What happens |
|-------|-------|--------|--------------|
| **Create** | Transfer outputs, secret keys, TTL | `UnprovenTransactionRecipe` | Builds the raw transaction and balances it in one call |
| **Balance** | Unproven, unbound, or finalized tx + secret keys | `BalancingRecipe` (one of three recipe types) | Adds shielded, unshielded, and dust/fee inputs to cover outputs |
| **Sign** | `BalancingRecipe` + signing callback | `BalancingRecipe` (signed) | Attaches cryptographic signatures to each transaction segment |
| **Prove** | `BalancingRecipe` or `UnprovenTransaction` | `FinalizedTransaction` | Generates ZK proofs via the proof server (most expensive step) |
| **Submit** | `FinalizedTransaction` | `TransactionIdentifier` | Sends the proven transaction to the network |

Three recipe types flow through the pipeline:

- **`UnprovenTransactionRecipe`** -- wraps a single `ledger.UnprovenTransaction`
- **`UnboundTransactionRecipe`** -- wraps an `UnboundTransaction` plus an optional balancing `UnprovenTransaction`
- **`FinalizedTransactionRecipe`** -- wraps a `ledger.FinalizedTransaction` (the original) plus a balancing `UnprovenTransaction`

## Creating Transfers

`transferTransaction()` creates and balances a transfer in a single call. It accepts both shielded and unshielded outputs, merges the resulting transactions, and adds fee balancing automatically.

```typescript
import { WalletFacade, type CombinedTokenTransfer } from '@midnightntwrk/wallet-sdk-facade';

const outputs: CombinedTokenTransfer[] = [
  {
    type: 'unshielded',
    outputs: [
      {
        type: 'NIGHT',
        receiverAddress: recipientUnshieldedAddress,
        amount: 5_000_000n, // 5 NIGHT (6 decimal places)
      },
    ],
  },
  {
    type: 'shielded',
    outputs: [
      {
        type: 'NIGHT',
        receiverAddress: recipientShieldedAddress,
        amount: 10_000_000n, // 10 NIGHT
      },
    ],
  },
];

const recipe = await wallet.transferTransaction(
  outputs,
  { shieldedSecretKeys, dustSecretKey },
  { ttl: new Date(Date.now() + 3600_000) }, // 1-hour TTL
);
// recipe.type === 'UNPROVEN_TRANSACTION'
```

`CombinedTokenTransfer` is a discriminated union -- either `{ type: 'shielded', outputs: TokenTransfer<ShieldedAddress>[] }` or `{ type: 'unshielded', outputs: TokenTransfer<UnshieldedAddress>[] }`. Each `TokenTransfer` specifies a `type` (token type string, e.g. `'NIGHT'`), a `receiverAddress`, and an `amount` in the smallest unit. For NIGHT, amounts use 6 decimal places (1 NIGHT = 1,000,000 units).

The `payFees` option defaults to `true`. Set it to `false` to skip dust/fee balancing (useful when composing transactions manually).

## Balancing

Balancing adds inputs to cover a transaction's outputs across shielded, unshielded, and dust token kinds. Three methods handle different input types:

| Method | Input type | Output type |
|--------|-----------|-------------|
| `balanceUnprovenTransaction` | `ledger.UnprovenTransaction` | `UnprovenTransactionRecipe` |
| `balanceUnboundTransaction` | `UnboundTransaction` | `UnboundTransactionRecipe` |
| `balanceFinalizedTransaction` | `ledger.FinalizedTransaction` | `FinalizedTransactionRecipe` |

All three accept the same `secretKeys` and `options` parameters:

```typescript
const recipe = await wallet.balanceUnprovenTransaction(
  unprovenTx,
  { shieldedSecretKeys, dustSecretKey },
  {
    ttl: new Date(Date.now() + 3600_000),
    tokenKindsToBalance: 'all', // default
  },
);
```

The optional `tokenKindsToBalance` parameter controls which token kinds are balanced. It accepts `'all'` (default) or an array of specific kinds: `'shielded'`, `'unshielded'`, `'dust'`. For example, `['shielded', 'dust']` skips unshielded balancing.

Internally, balancing runs in stages: unshielded balancing, shielded balancing, then dust/fee balancing. The results are merged into the appropriate recipe type.

## Signing

`signRecipe` signs all transaction segments in a recipe using a synchronous callback:

```typescript
const signedRecipe = await wallet.signRecipe(
  recipe,
  (data: Uint8Array) => ledger.signData(signingKey, data),
);
```

The callback type is `(data: Uint8Array) => ledger.Signature` -- it is **synchronous**, not async. The method itself returns `Promise<BalancingRecipe>` because it awaits internal delegation, but the signing callback must return a `ledger.Signature` directly.

Two lower-level signing methods are also available:

- **`signUnprovenTransaction(tx, signSegment)`** -- signs a single `ledger.UnprovenTransaction`, returns `Promise<ledger.UnprovenTransaction>`
- **`signUnboundTransaction(tx, signSegment)`** -- signs a single `UnboundTransaction`, returns `Promise<UnboundTransaction>`

Both accept the same synchronous `(data: Uint8Array) => ledger.Signature` callback.

## Proving

Proving generates zero-knowledge proofs for transactions. This is the most computationally expensive step and is delegated to the proof server.

- **`finalizeRecipe(recipe)`** -- proves and finalizes an entire `BalancingRecipe`. Handles all three recipe types internally, merges the results, and adds the finalized transaction to pending tracking. Returns `Promise<ledger.FinalizedTransaction>`.
- **`finalizeTransaction(tx)`** -- proves a single `ledger.UnprovenTransaction` via the proof server, binds it, and adds it to pending tracking. Returns `Promise<ledger.FinalizedTransaction>`. On failure, automatically reverts the transaction across all wallet sub-systems.

## Submission

```typescript
const txId: TransactionIdentifier = await wallet.submitTransaction(finalizedTx);
```

`submitTransaction` adds the transaction to pending tracking, submits it to the network via the submission service, and returns the `TransactionIdentifier` (a string). If submission fails, it automatically reverts the transaction.

## Fee Estimation

Two methods estimate transaction fees, both returning `bigint` values in DUST units (15 decimal places):

- **`calculateTransactionFee(tx)`** -- calculates the fee for the given transaction only. Does not include the cost of the balancing transaction.
- **`estimateTransactionFee(tx, secretKey, options?)`** -- estimates the total fee including the balancing transaction. Accepts optional `ttl` and `currentTime` parameters.

```typescript
const feeEstimate: bigint = await wallet.estimateTransactionFee(
  tx,
  dustSecretKey,
  { ttl: new Date(Date.now() + 3600_000) },
);
```

## Dust Registration

Dust registration enables NIGHT UTXOs to generate DUST tokens for paying transaction fees.

**Register:**

```typescript
const recipe = await wallet.registerNightUtxosForDustGeneration(
  nightUtxos,          // readonly UtxoWithMeta[]
  nightVerifyingKey,   // ledger.SignatureVerifyingKey
  (payload: Uint8Array) => ledger.signData(signingKey, payload), // synchronous
  dustReceiverAddress, // optional DustAddress, defaults to wallet's own dust address
);
// Returns UnprovenTransactionRecipe -- still needs proving and submission
```

The sign callback for `registerNightUtxosForDustGeneration` is synchronous: `(payload: Uint8Array) => ledger.Signature`.

**Estimate registration economics:**

```typescript
const { fee, dustGenerationEstimations } = await wallet.estimateRegistration(nightUtxos);
// fee: bigint -- the registration transaction fee
// dustGenerationEstimations: array of UTXOs with dust generation details
```

`estimateRegistration` internally creates a mock registration transaction (using a sample signing key) to calculate the exact fee, and provides dust generation estimates for the given UTXOs.

**Deregister:**

```typescript
const recipe = await wallet.deregisterFromDustGeneration(
  nightUtxos,
  nightVerifyingKey,
  (payload: Uint8Array) => ledger.signData(signingKey, payload),
);
```

## Reverting Transactions

When a transaction fails or needs to be abandoned, reverting releases locked UTXOs back to the wallet:

- **`revert(txOrRecipe)`** -- accepts either an `AnyTransaction` or a `BalancingRecipe`. Extracts all component transactions from a recipe and reverts each one.
- **`revertTransaction(tx)`** -- reverts a single transaction across all three wallet sub-systems (shielded, unshielded, dust) in parallel, then clears it from pending tracking.

Reverting happens automatically on `finalizeTransaction` failure and `submitTransaction` failure. The facade also subscribes to the pending transactions service and auto-reverts any transactions that fail after submission.

> **See also:** `errors-and-troubleshooting.md` for the per-wallet
> error types thrown when finalize or submit fails.

## Swap Initialization

`initSwap` creates a swap offer transaction:

```typescript
const recipe = await wallet.initSwap(
  desiredInputs,   // CombinedSwapInputs: { shielded?: Record<RawTokenType, bigint>, unshielded?: ... }
  desiredOutputs,  // CombinedSwapOutputs[] (same shape as CombinedTokenTransfer)
  { shieldedSecretKeys, dustSecretKey },
  { ttl, payFees: false }, // payFees defaults to false for swaps
);
```

`CombinedSwapInputs` specifies the tokens the initiator wants to receive, while `desiredOutputs` specifies the tokens they are offering. At least one shielded or unshielded side must be present. The `payFees` option defaults to `false` for swaps (the counterparty typically pays).

## Transaction History

Two methods provide access to transaction history:

- **`queryTxHistoryByHash(hash)`** -- looks up a single transaction by its hash. Returns `Promise<WalletEntry | undefined>`.
- **`getAllFromTxHistory()`** -- returns a `Promise<WalletEntry[]>` resolving to all stored transaction history entries as a plain array.

```typescript
// Single lookup
const entry = await wallet.queryTxHistoryByHash(txHash);

// Retrieve all history
const entries = await wallet.getAllFromTxHistory();
for (const entry of entries) {
  console.log(entry);
}
```

Transaction history depends on the `TransactionHistoryStorage` implementation provided during wallet construction.

> **Note:** `queryTxHistoryByHash` and `getAllFromTxHistory` exist in the wallet SDK source but may not be available in all published versions of `@midnightntwrk/wallet-sdk-facade`. Check your installed version's type exports before using these methods.

---

**See also:**
- [`examples/transfer-flow.ts`](../examples/transfer-flow.ts) -- end-to-end transfer with signing, proving, and submission
- [`examples/dust-registration.ts`](../examples/dust-registration.ts) -- registering UTXOs for dust generation
- [State and Balances](./state-and-balances.md) -- querying wallet state and token balances
- [Wallet Construction](./wallet-construction.md) -- setting up WalletFacade with required services
