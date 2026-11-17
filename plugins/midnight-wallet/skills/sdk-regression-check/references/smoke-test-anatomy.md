# Smoke test anatomy

The smoke fixture executes the wallet construction pattern this plugin
documents and asserts that the local-devnet `dev` preset still pre-mints
NIGHT to the genesis seed.

## Steps the fixture performs

1. **Seed derivation (`seed-derive`).** Derive the three per-wallet seeds
   from the local-devnet genesis seed (`0x000…001`) with
   `WalletSeeds.fromMasterSeed(...)`. This walks the same HD path as wallet
   SDK 1.x (account 0, roles `Zswap` / `NightExternal` / `Dust`, index 0),
   so the genesis seed still lands on the pre-funded wallet.

2. **Keystore (`keystore`).** Create the unshielded keystore with
   `createKeystore({ kind: "schnorr", secret: seeds.unshielded }, "undeployed")`.
   The shielded and DUST wallets take their seeds directly.

3. **Facade init (`facade-init`).** Call `WalletFacade.init({ ... })`
   with a `DefaultConfiguration` pointing at the local devnet
   (`ws://localhost:9944`, `http://localhost:8088/api/v4/graphql`,
   `http://localhost:6300`, plus an in-memory `txHistoryStorage`) and
   factory functions for each sub-wallet (`startWithSeed` for shielded and
   DUST, `startWithPublicKey` for unshielded).

4. **Wallet start (`wallet-start`).** Call `wallet.start(seeds)`.

5. **Wait for sync (`wait-sync`).** Wait for the first state where
   `isSynced` is true and `protocol._tag` is `"Settled"` (the fixture's
   `waitForSettled` helper).

6. **Balance assertion (`balance-read`).** Read
   `state.unshielded.balances[ledger.unshieldedToken().raw]` and assert it
   is greater than `0n`. The NIGHT key is the token's raw bytes
   (64 hex zeros), NOT the empty string.

## What success means

If all six steps pass, the construction pattern in this plugin still
works end-to-end against the live devnet. The patterns documented in
`midnight-wallet:wallet-sdk` and `midnight-wallet:managing-test-wallets`
are validated.

## What failure means

A failure at any step is structured: the fixture prints
`{"ok":false,"step":"<step>","error":"<message>"}`. The step name
points at the layer to investigate first. See `temp-project-setup.md`
for the per-step interpretation.
