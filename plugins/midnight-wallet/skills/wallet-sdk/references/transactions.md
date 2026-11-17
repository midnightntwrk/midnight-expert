# Transactions

The Wallet SDK transaction pipeline moves a payment or contract interaction through five stages: create, balance, sign, prove, and submit. Every public method on `WalletFacade` that touches transactions follows this lifecycle.

> **Wallet SDK 2.0.0:** none of these methods take secret keys any more. The wallet holds the keys it derived from the seeds passed to `wallet.start(seeds)`. Build transactions only once the wallet is synced **and** `state.protocol._tag === 'Settled'` (see [state-and-balances.md](state-and-balances.md#protocol-phase)); a recipe also records the `protocolVersion` it was built for, and using it at a different version fails with `ProtocolVersionMismatchError`.

## Transaction Lifecycle Overview

| Stage | Input | Output | What happens |
|-------|-------|--------|--------------|
| **Create** | Transfer outputs, TTL | `UnprovenTransactionRecipe` | Builds the raw transaction and balances it in one call |
| **Balance** | Unproven, unbound, or finalized tx + TTL | `BalancingRecipe` (one of three recipe types) | Adds shielded, unshielded, and dust/fee inputs to cover outputs |
| **Sign** | `BalancingRecipe` + signing callback | `BalancingRecipe` (signed) | Attaches cryptographic signatures to each transaction segment |
| **Prove** | `BalancingRecipe` or `UnprovenTransaction` | `FinalizedTransaction` | Generates ZK proofs via the proof server (most expensive step) |
| **Submit** | `FinalizedTransaction` | `TransactionIdentifier` | Sends the proven transaction to the network |

Three recipe types flow through the pipeline:

- **`UnprovenTransactionRecipe`** -- `transaction` (unproven)
- **`UnboundTransactionRecipe`** -- `baseTransaction` (unbound) plus an optional balancing unproven transaction
- **`FinalizedTransactionRecipe`** -- `originalTransaction` (finalized) plus a balancing unproven transaction

Every recipe also carries `protocolVersion`, the version its parts have to be proved and submitted at. The transactions inside are SDK handles (`UnprovenTx`, `UnboundTx`, `FinalizedTx` from `@midnightntwrk/wallet-sdk-abstractions`) that seal the bytes together with that version.

## Creating Transfers

`transferTransaction()` creates and balances a transfer in a single call. It accepts both shielded and unshielded outputs, merges the resulting transactions, and adds fee balancing automatically.

```typescript
import { type CombinedTokenTransfer } from '@midnightntwrk/wallet-sdk-facade';
import * as ledger from '@midnightntwrk/ledger-v9';

const outputs: CombinedTokenTransfer[] = [
  {
    type: 'unshielded',
    outputs: [
      {
        type: ledger.unshieldedToken().raw, // NIGHT
        receiverAddress: recipientUnshieldedAddress,
        amount: 5_000_000n, // 5 NIGHT (6 decimal places)
      },
    ],
  },
  {
    type: 'shielded',
    outputs: [
      {
        type: ledger.shieldedToken().raw,
        receiverAddress: recipientShieldedAddress,
        amount: 10_000_000n,
      },
    ],
  },
];

const recipe = await wallet.transferTransaction(outputs, {
  ttl: new Date(Date.now() + 3600_000), // 1-hour TTL
});
// recipe.type === 'UNPROVEN_TRANSACTION'
```

`CombinedTokenTransfer` is a discriminated union -- either `{ type: 'shielded', outputs: TokenTransfer<ShieldedAddress>[] }` or `{ type: 'unshielded', outputs: TokenTransfer<UnshieldedAddress>[] }`. Each `TokenTransfer` specifies a `type` (the raw token type, e.g. `ledger.unshieldedToken().raw` for NIGHT), a `receiverAddress` (a decoded `UnshieldedAddress` / `ShieldedAddress`, such as what `wallet.unshielded.getAddress()` returns), and an `amount` in the smallest unit. For NIGHT, amounts use 6 decimal places (1 NIGHT = 1,000,000 units).

The `payFees` option defaults to `true`. Set it to `false` to skip dust/fee balancing (useful when composing transactions manually).

## Balancing

Balancing adds inputs to cover a transaction's outputs across shielded, unshielded, and dust token kinds. Three methods handle different input types:

| Method | Input type | Output type |
|--------|-----------|-------------|
| `balanceUnprovenTransaction` | `ledger.UnprovenTransaction` | `UnprovenTransactionRecipe` |
| `balanceUnboundTransaction` | `UnboundTransaction` | `UnboundTransactionRecipe` |
| `balanceFinalizedTransaction` | `ledger.FinalizedTransaction` | `FinalizedTransactionRecipe` |

All three take the transaction and an `options` object (no keys):

```typescript
const recipe = await wallet.balanceUnprovenTransaction(unprovenTx, {
  ttl: new Date(Date.now() + 3600_000),
  tokenKindsToBalance: 'all', // default
});
```

The optional `tokenKindsToBalance` parameter controls which token kinds are balanced. It accepts `'all'` (default) or an array of specific kinds: `'shielded'`, `'unshielded'`, `'dust'`. For example, `['shielded', 'dust']` skips unshielded balancing.

Internally, balancing runs in stages: unshielded balancing, shielded balancing, then dust/fee balancing. The results are merged into the appropriate recipe type.

## Signing

`signRecipe` signs all transaction segments in a recipe using an **async** callback:

```typescript
const signedRecipe = await wallet.signRecipe(recipe, unshieldedKeystore.signDataAsync);
```

The callback type is `SignSegment = (data: Uint8Array) => Promise<Signature>` (exported from `@midnightntwrk/wallet-sdk-facade` and `@midnightntwrk/wallet-sdk-unshielded-wallet`). It changed from synchronous in 1.x so that MPC and HSM signers fit. The keystore from `createKeystore` has `signDataAsync` with exactly that shape; its `signData` is the synchronous primitive. Only unshielded spends need signing — a shielded-only transfer can go straight to `finalizeRecipe`.

Two lower-level signing methods are also available:

- **`signUnprovenTransaction(tx, signSegment)`** -- signs a single unproven transaction, returns `Promise<UnprovenTx>`
- **`signUnboundTransaction(tx, signSegment)`** -- signs a single unbound transaction, returns `Promise<UnboundTx>`

Both accept the same async `SignSegment` callback.

## Proving

Proving generates zero-knowledge proofs for transactions. This is the most computationally expensive step and is delegated to the proof server.

- **`finalizeRecipe(recipe)`** -- proves and finalizes an entire `BalancingRecipe` at the recipe's `protocolVersion`. Handles all three recipe types internally, merges the results, and records the transaction as finalized in the lifecycle. Returns `Promise<FinalizedTx>`.
- **`finalizeTransaction(tx)`** -- proves a single unproven transaction via the proof server and binds it. Returns `Promise<FinalizedTx>`. On failure, automatically reverts the transaction across all wallet sub-systems.

## Submission

```typescript
const txId: TransactionIdentifier = await wallet.submitTransaction(finalizedTx);
```

`submitTransaction` submits the transaction via the submission service, records it as submitted in the lifecycle and the transaction history, and returns the `TransactionIdentifier` (a string). If submission fails, it automatically reverts the transaction.

## Fee Estimation

Two methods estimate transaction fees, both returning `bigint` values in DUST units (15 decimal places):

- **`calculateTransactionFee(tx)`** -- calculates the fee for the given transaction only. Does not include the cost of the balancing transaction.
- **`estimateTransactionFee(tx, options?)`** -- estimates the total fee including the balancing transaction. Accepts optional `ttl` and `currentTime`. No key argument in 2.0.0.

```typescript
const feeEstimate: bigint = await wallet.estimateTransactionFee(tx, {
  ttl: new Date(Date.now() + 3600_000),
});
```

## Dust Registration

Dust registration enables NIGHT UTXOs to generate DUST tokens for paying transaction fees. Registration pays its own fee from the DUST the UTXOs being registered have generated, so it works from a zero DUST balance — but in 2.0.0 a **first registration** has to wait until those UTXOs have generated enough to cover the fee. Try to register, and if it throws because the fee isn't covered yet, wait as long as the error estimates and retry (the pattern from the SDK's own docs):

```typescript
const NIGHT = ledger.unshieldedToken().raw;
const nightUtxos = state.unshielded.availableCoins.filter(
  (coin) => coin.utxo.type === NIGHT && !coin.meta.registeredForDustGeneration,
);

// Don't call this with an empty list — it fails with
// "No guaranteedUnshieldedOffer found in intent".
if (nightUtxos.length > 0) {
  const register = () =>
    wallet.registerNightUtxosForDustGeneration(
      nightUtxos,                         // readonly UtxoWithMeta[]
      unshieldedKeystore.getPublicKey(),  // SignatureVerifyingKey
      unshieldedKeystore.signDataAsync,   // SignSegment (async)
      // dustReceiverAddress?             // defaults to the wallet's own dust address
    );
  const recipe = await register().catch(async (error: unknown) => {
    // Only a reachable fee is worth waiting for.
    if (!isInsufficientDustForFeeError(error) || error.estimate._tag !== 'Reachable') throw error;
    const timeoutMs = Number(error.estimate.seconds) * 1000 + 60_000;
    await wallet.waitForGeneratedDust(nightUtxos, error.fee, { timeoutMs });
    return register();
  });
  // UnprovenTransactionRecipe -- still needs finalizeRecipe + submitTransaction
  await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
}
```

The error is `InsufficientDustForFeeError` (`_tag: 'Wallet.InsufficientDustForFee'`, from `@midnightntwrk/wallet-sdk-dust-wallet`). It carries `fee`, `claimableFeePayment`, `shortfall` and an `estimate` (`{ _tag: 'Reachable', at, seconds }` or `{ _tag: 'Unreachable', reason: 'NoGeneration' | 'ExceedsCap' }`); test for it with `isInsufficientDustForFeeError(err)`. How long the wait takes depends on how much NIGHT is being registered. On a local devnet, 5 NIGHT had not covered the fee after five minutes, while 1000 NIGHT was ready within the minute; fund test wallets generously. Calling `estimateRegistration` then `waitForGeneratedDust(utxos, fee)` up front also works, but `waitForGeneratedDust` gives up after 5 minutes by default, so the catch-and-retry form above is safer for small amounts.

`estimateRegistration(nightUtxos)` returns `{ fee, dustGenerationEstimations }` — the registration fee and per-UTXO dust generation details.

**Deregister:**

```typescript
const recipe = await wallet.deregisterFromDustGeneration(
  registeredUtxos,
  unshieldedKeystore.getPublicKey(),
  unshieldedKeystore.signDataAsync,
);
// Deregistering NIGHT can't pay its own fee: balance it with DUST before finalizing.
const balanced = await wallet.balanceUnprovenTransaction(recipe.transaction, {
  ttl: new Date(Date.now() + 30 * 60 * 1000),
  tokenKindsToBalance: ['dust'],
});
await wallet.submitTransaction(await wallet.finalizeRecipe(balanced));
```

## Reverting Transactions

When a transaction fails or needs to be abandoned, reverting releases locked UTXOs back to the wallet:

- **`revert(txOrRecipe, reason?)`** -- accepts either a transaction or a `BalancingRecipe`. Extracts all component transactions from a recipe and reverts each one.
- **`revertTransaction(tx, reason?)`** -- reverts a single transaction across all three wallet sub-systems (shielded, unshielded, dust), and records it as `Reverted` in the lifecycle.

Reverting happens automatically on `finalizeTransaction` failure and `submitTransaction` failure. The transaction lifecycle service also tracks submitted transactions against the indexer and releases coins for ones the chain rejects or whose TTL passes; read the outcome from `state.lifecycle` (see [state-and-balances.md](state-and-balances.md#lifecycle-entries)).

> **See also:** `errors-and-troubleshooting.md` for the per-wallet
> error types thrown when finalize or submit fails.

## Swap Initialization

`initSwap` creates a swap offer transaction:

```typescript
const recipe = await wallet.initSwap(
  desiredInputs,   // CombinedSwapInputs: { shielded?: Record<RawTokenType, bigint>, unshielded?: ... }
  desiredOutputs,  // CombinedSwapOutputs[] (same shape as CombinedTokenTransfer)
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

Transaction history depends on the `TransactionHistoryStorage` implementation provided during wallet construction (`txHistoryStorage`). Each `WalletEntry` has a `lifecycle` field (`pending`, `finalized` or `rejected`) and optional `shielded` / `unshielded` / `dust` sections; `isPendingWalletEntry` and `isFinalizedWalletEntry` narrow it.

---

**See also:**
- [`examples/transfer-flow.ts`](../examples/transfer-flow.ts) -- end-to-end transfer with signing, proving, and submission
- [`examples/dust-registration.ts`](../examples/dust-registration.ts) -- registering UTXOs for dust generation
- [State and Balances](./state-and-balances.md) -- querying wallet state and token balances
- [Wallet Construction](./wallet-construction.md) -- setting up WalletFacade with required services
