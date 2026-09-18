# Transfers

Three transfer kinds, all built via `wallet.transferTransaction`:
- **Unshielded** — public NIGHT transfer between two unshielded addresses
- **Shielded** — private transfer of shielded tokens between two shielded addresses
- **Combined** — atomic shielded + unshielded in one transaction

## The lifecycle

Every transfer goes through five stages:

1. **Build** the transfer recipe via `wallet.transferTransaction(outputs, secretKeys, options)`
2. **Sign** the recipe via `wallet.signRecipe(recipe, callback)`
3. **Finalize** (proves the ZK component) via `wallet.finalizeRecipe(recipe)`
4. **Submit** to the network via `wallet.submitTransaction(finalizedTx)`
5. (Optional) **Watch** the recipient's wallet state until the balance arrives

## Unshielded NIGHT transfer

```typescript
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format';

const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
const recipientAddress = MidnightBech32m
  .parse(recipientBech32)
  .decode(UnshieldedAddress, 'undeployed');

const recipe = await wallet.transferTransaction(
  [{
    type: 'unshielded',
    outputs: [{ type: NIGHT_TOKEN_TYPE, receiverAddress: recipientAddress, amount: 5_000_000n }],
  }],
  { shieldedSecretKeys, dustSecretKey },
  { ttl: new Date(Date.now() + 3_600_000) },
);

const signed = await wallet.signRecipe(recipe, (data) => unshieldedKeystore.signData(data));
const finalized = await wallet.finalizeRecipe(signed);
const txId = await wallet.submitTransaction(finalized);
```

## Shielded transfer

Same shape but `type: 'shielded'` and `receiverAddress` is a `ShieldedAddress`:

```typescript
const recipe = await wallet.transferTransaction(
  [{
    type: 'shielded',
    outputs: [{ type: NIGHT_TOKEN_TYPE, receiverAddress: recipientShieldedAddress, amount: 1_000_000n }],
  }],
  { shieldedSecretKeys, dustSecretKey },
  { ttl: new Date(Date.now() + 3_600_000) },
);
```

The sender must hold shielded tokens. To convert unshielded to shielded,
see `wallet.initSwap` in the wallet-sdk reference.

## Combined transfer

Pass both kinds in the outputs array. The transaction is atomic — either
both legs apply or neither.

## Fee estimation

```typescript
const fee = await wallet.estimateTransactionFee(tx, dustSecretKey, { ttl });
```

`estimateTransactionFee` includes the cost of the balancing transaction;
`calculateTransactionFee` does not.

## The `payFees` option

Defaults to `true`. Set to `false` when the counterparty pays (e.g. swap
intents).

## Runnable examples

- `examples/transfer-night.ts` — unshielded NIGHT transfer
- `examples/transfer-shielded.ts` — shielded transfer (handles the
  no-balance case gracefully)

## See also

`wallet-sdk:references/transactions.md` — full lifecycle reference.
