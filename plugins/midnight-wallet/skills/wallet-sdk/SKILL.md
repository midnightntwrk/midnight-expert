---
name: midnight-wallet:wallet-sdk
description: >-
  This skill should be used when the user asks about the Midnight Wallet SDK
  packages (@midnightntwrk/wallet-sdk-*), how to construct a wallet with
  WalletFacade, deriving wallet seeds from a master seed or mnemonic,
  the three-wallet architecture (shielded, unshielded, dust), observing wallet
  state and sync progress, transaction balancing and signing, proving and
  submission services, connecting to infrastructure (indexer client, node client,
  prover client), or Bech32m address formatting. Also covers ProtocolVersion,
  SyncProgress, FacadeState, the ledger 9 protocol boundary, and the wallet
  runtime
---

# Wallet SDK Reference

Reference for the `@midnightntwrk/wallet-sdk-*` packages.

## Critical caveat — verify SDK is current

Patterns in this skill were verified against the package versions pinned
in `midnight-wallet:sdk-regression-check/versions.lock.json`. The
Midnight Network ecosystem moves quickly, and there may be breaking
changes between SDK versions. Run `midnight-wallet:sdk-regression-check`
before trusting any pattern here.

## Scope — browser wallets are out of scope

This skill is the package-level reference for the wallet SDK
(`@midnightntwrk/wallet-sdk-*`), used in programmatic contexts where
the script owns the keys directly. If the user is integrating their
DApp with a browser extension wallet (Lace or other), load
`midnight-dapp-dev:dapp-connector` instead.

## Quick Start: Wallet Construction

The most common task is constructing a `WalletFacade` from a seed. In wallet
SDK 2.0.0 (ledger 9) the flow is:

    Master seed (32 bytes / 64 hex chars)
      → WalletSeeds.fromMasterSeed() → { shielded, unshielded, dust }
        → ShieldedWallet(config).startWithSeed(seeds.shielded)
        → UnshieldedWallet(config).startWithPublicKey(
            PublicKey.fromKeyStore(createKeystore({ kind: "schnorr", secret: seeds.unshielded }, networkId)))
        → DustWallet(config).startWithSeed(seeds.dust)
          → WalletFacade.init({ configuration, shielded, unshielded, dust })
            → wallet.start(seeds)
              → wait for isSynced && protocol._tag === "Settled"

Seeds, not key objects, are what the wallet starts from: each ledger version
derives its own keys from a seed, so a seed is the only key material that
crosses the ledger 8 / ledger 9 boundary. `WalletSeeds.fromMasterSeed` walks
the same HD path as the 1.x `HDWallet` code, so a 1.x master seed restores the
same wallet and addresses.

Key packages involved:

| Package | What it provides |
|---------|-----------------|
| `@midnightntwrk/wallet-sdk-hd` | `WalletSeeds`, `generateRandomSeed`, mnemonic helpers (`HDWallet` / `Roles` for lower-level derivation) |
| `@midnightntwrk/wallet-sdk-facade` | `WalletFacade`, `FacadeState`, `WalletEntrySchema`, `mergeWalletEntries` |
| `@midnightntwrk/wallet-sdk-shielded` | `ShieldedWallet` factory |
| `@midnightntwrk/wallet-sdk-unshielded-wallet` | `UnshieldedWallet` factory, `createKeystore`, `PublicKey` |
| `@midnightntwrk/wallet-sdk-dust-wallet` | `DustWallet` factory, `isInsufficientDustForFeeError` |
| `@midnightntwrk/wallet-sdk-abstractions` | `InMemoryTransactionHistoryStorage` |
| `@midnightntwrk/ledger-v9` | Ledger types and token helpers (`unshieldedToken()`, `shieldedToken()`) |

For the full construction code, see `examples/basic-wallet-setup.ts`.
For configuration details, see `references/wallet-construction.md`.

## Deep Dive References

| Task | Reference |
|------|-----------|
| Look up a package name, import path, or key type | `references/quick-reference.md` |
| Generate a seed or derive wallet seeds / keys | `references/key-derivation.md` |
| Construct and configure a WalletFacade | `references/wallet-construction.md` |
| Read wallet state, balances, or sync progress | `references/state-and-balances.md` |
| Create, balance, sign, prove, or submit a transaction | `references/transactions.md` |
| Connect to indexer, node, or proof server | `references/infrastructure-clients.md` |
| Look up the variant/runtime pattern (advanced) | `references/variants-and-runtime.md` |
| Choose between Promise and Effect APIs | `references/effect-and-promise-apis.md` |
| Customize wallet services (balancer, prover, etc.) | `references/capabilities-deep-dive.md` |
| Resolve runtime errors and exceptions | `references/errors-and-troubleshooting.md` |

## Related Skills

| Need | Skill |
|------|-------|
| DApp browser wallet integration (DApp Connector API) | `midnight-dapp-dev:dapp-connector` |
| DApp SDK providers (MidnightProviders, WalletProvider) | `midnight-dapp-dev:midnight-sdk` |
| Testing wallet SDK code | `midnight-cq:wallet-testing` |
| CLI wallet construction patterns | `compact-cli-dev:core` |
| Test wallet patterns + runnable examples | `midnight-wallet:managing-test-wallets` |
| SDK drift detection / smoke test | `midnight-wallet:sdk-regression-check` |
