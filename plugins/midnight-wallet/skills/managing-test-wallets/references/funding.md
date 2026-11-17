# Funding test wallets

Funding strategy depends on the active network.

## Local devnet (`undeployed`)

The `dev` preset pre-mints NIGHT to the wallet derived from the genesis
seed. To fund a new wallet:

1. Build a sender `WalletFacade` from the genesis seed (see
   `midnight-tooling:devnet#genesis-seed` for the seed value).
2. Wait for the sender to be synced and settled (`isSynced` and
   `protocol._tag === 'Settled'`).
3. Build an unshielded NIGHT transfer via `wallet.transferTransaction(outputs, { ttl })`
   to the recipient's UNSHIELDED address.
4. Sign the recipe with `wallet.signRecipe(recipe, unshieldedKeystore.signDataAsync)`.
5. Finalize via `wallet.finalizeRecipe(recipe)`.
6. Submit via `wallet.submitTransaction(finalizedTx)`.
7. Optionally wait for the recipient to observe the incoming balance.

See `examples/fund-wallet-undeployed.ts` for the runnable script. It
sends 1000 NIGHT by default: much less and the recipient's first DUST
registration waits a long time for the NIGHT to generate its fee (see
`dust-registration.md`).

## Public testnets (`preprod`, `preview`)

There is no programmatic faucet API for the public testnets — the user
funds the address manually via the faucet web page.

| Network | Faucet URL |
|---------|------------|
| preprod | https://midnight-tmnight-preprod.nethermind.dev/ |
| preview | https://midnight-tmnight-preview.nethermind.dev/ |

The funding pattern is "print the address and the URL, watch for the
balance to arrive":

1. Print the recipient's UNSHIELDED address and the faucet URL.
2. Subscribe to wallet state.
3. Poll until `state.unshielded.balances[ledger.unshieldedToken().raw] > 0n`,
   or a timeout fires.

See `examples/fund-wallet-public-faucet.ts` for the runnable script.

## Address rules

Faucets and the genesis-seed airdrop fund the UNSHIELDED address.
Shielded tokens are minted via Zswap (`wallet.initSwap`), not via
faucets. See `addresses-and-tokens.md`.
