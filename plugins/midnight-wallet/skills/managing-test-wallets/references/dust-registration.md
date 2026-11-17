# DUST registration

DUST is the fee resource on Midnight. It is generated over time from
NIGHT UTXOs that have been REGISTERED for DUST generation. Without
registered NIGHT, a wallet cannot pay transaction fees.

## When to register

Immediately after the wallet receives its first NIGHT. The UTXOs only
start generating DUST once registered, so the sooner the better.

## How to register

```typescript
import * as ledger from '@midnightntwrk/ledger-v9';
import { isInsufficientDustForFeeError } from '@midnightntwrk/wallet-sdk-dust-wallet';

// After waitForSettled(wallet) — see wallet-creation.md
const state = await waitForSettled(wallet);
const NIGHT = ledger.unshieldedToken().raw;
const nightUtxos = state.unshielded.availableCoins.filter(
  (coin) => coin.utxo.type === NIGHT && !coin.meta.registeredForDustGeneration,
);

// registerNightUtxosForDustGeneration throws on an empty list, which is
// what a devnet genesis wallet (already registered) would pass.
if (nightUtxos.length === 0) {
  console.log('No unregistered NIGHT UTXOs. Fund the wallet first.');
  process.exit(0);
}

// Builds and signs the registration; the sign callback returns a Promise.
const register = () =>
  wallet.registerNightUtxosForDustGeneration(
    nightUtxos,
    unshieldedKeystore.getPublicKey(),
    unshieldedKeystore.signDataAsync,
  );

// If the NIGHT hasn't generated the fee yet, the error says when it will.
// Wait that long plus a margin and retry; an unreachable fee is a real error.
const recipe = await register().catch(async (error: unknown) => {
  if (!isInsufficientDustForFeeError(error) || error.estimate._tag !== 'Reachable') throw error;
  const timeoutMs = Number(error.estimate.seconds) * 1000 + 60_000;
  await wallet.waitForGeneratedDust(nightUtxos, error.fee, { timeoutMs });
  return register();
});
const finalizedTx = await wallet.finalizeRecipe(recipe);
const txId = await wallet.submitTransaction(finalizedTx);
console.log(`Registration tx: ${txId}`);
```

For the exact `registerNightUtxosForDustGeneration` signature, see
`wallet-sdk:references/transactions.md`.

## Registration pays its own fee — but only once the NIGHT has generated it

Registration is the step that *starts* DUST generation, so when it runs the
wallet's DUST balance is usually `0`. That is fine: **registration pays its own
fee from the DUST the registered NIGHT UTXOs have generated since they
arrived**, not from the wallet's DUST balance.

The catch is that fresh NIGHT may not have generated the fee yet. Registering
too early throws `InsufficientDustForFeeError` ("Insufficient generated dust to
cover registration fee", recognised with `isInsufficientDustForFeeError` from
`@midnightntwrk/wallet-sdk-dust-wallet`). The error's `estimate` says when the
fee will be covered, so the snippet above waits that long and retries. Waiting
up front with `estimateRegistration` and `waitForGeneratedDust(utxos, fee)` also
works, but that wait gives up after 5 minutes by default.

How long the wait takes depends on how much NIGHT the UTXOs hold. On a local
devnet a ~0.2 DUST fee is covered within seconds by 1000 NIGHT, but takes over
an hour at 5 NIGHT. That is why `examples/fund-wallet-undeployed.ts` and
`examples/full-test-wallet-setup.ts` fund 1000 NIGHT by default.

Two consequences:

- A 138 (`BalanceCheckOverspend`) during registration is **not** fixed by
  raising the NIGHT amount. Fees are denominated in DUST, not NIGHT.
- You do **not** need to set `additionalFeeOverhead` for registration. Add it on
  wallets that submit **transfers or contract calls**, which on an idle devnet
  otherwise compute a zero fee and are rejected as NotNormalized (error **117** —
  see `/midnight-status-codes:lookup 117`).

## DUST has expiry

DUST tokens expire. `state.dust.balance(time)` requires a `Date`
argument because the result depends on which DUST has not yet expired
at the queried time.

## Runnable example

`examples/register-dust.ts` — registers the unregistered NIGHT UTXOs of a
seed-derived wallet, waiting for them to cover the fee first, and prints the
resulting DUST balance.
