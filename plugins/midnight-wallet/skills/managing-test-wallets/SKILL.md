---
name: midnight-wallet:managing-test-wallets
description: >-
  This skill should be used when the user asks to create a test wallet,
  fund a wallet, get tNight from a faucet, register DUST, monitor wallet
  balance, transfer NIGHT or shielded tokens, derive a wallet from a seed
  or BIP-39 mnemonic, set up wallets for tests, watch an address for
  incoming funds, generate dust, fund their DApp's test fixtures, or run
  end-to-end test scenarios that need real wallets on the local devnet
  or a public testnet.
---

# Managing Test Wallets

SDK-driven patterns for creating, funding, and managing Midnight test
wallets. Network-aware (`undeployed` / `preprod` / `preview`).

## Critical caveat — verify SDK is current

Every pattern here was verified against the package versions pinned in
`midnight-wallet:sdk-regression-check/versions.lock.json`. The Midnight
Network ecosystem moves quickly, and there may be breaking changes
between SDK versions.

The patterns target wallet SDK 2.0.1 (ledger 9): wallets start from
`WalletSeeds.fromMasterSeed(...)` seeds, and transactions are built only
once the wallet is synced and its protocol phase is `Settled`.

Before using any pattern from this skill, run
`midnight-wallet:sdk-regression-check` (drift check). If a major
version has shifted, run the smoke test before trusting the patterns.

## Scope — browser wallets are out of scope

Browser wallets (Lace and other extensions) are out of scope for this
skill. This skill teaches programmatic wallet patterns where the script
owns the keys directly. If the user is integrating their DApp with a
browser extension wallet, load `midnight-dapp-dev:dapp-connector`
instead. The two skills are complementary: a DApp typically uses the
extension wallet in production and uses the patterns in this skill for
development and test wallets.

## When to use this skill

| Scenario | Pattern |
|----------|---------|
| Wiring wallet setup into an example DApp's startup or tests | Lift the relevant `examples/*.ts` block, adapt to the host project's config and pin SDK versions in its `package.json` |
| One-off: user asks for a funded test wallet, balance check, transfer, etc. | Write a throwaway script in `/tmp/` or the project's `scripts/`, run with `npx tsx`, report results |

## Read this first — three-address model

A `WalletFacade` owns three sub-wallets, each with its own address and
balance. Faucets and the genesis-seed airdrop fund the UNSHIELDED
address only. See `references/addresses-and-tokens.md`.

## Decision tree

| User wants… | Reference | Example |
|-------------|-----------|---------|
| Generate a brand-new wallet | `wallet-creation.md` | `create-wallet.ts` |
| Restore from BIP-39 mnemonic / hex seed | `wallet-creation.md` | `create-wallet.ts` |
| Fund on local devnet | `funding.md` | `fund-wallet-undeployed.ts` |
| Fund on preprod or preview | `funding.md` | `fund-wallet-public-faucet.ts` |
| Register DUST | `dust-registration.md` | `register-dust.ts` |
| Watch balance changes | `balance-monitoring.md` | `monitor-wallet.ts` |
| Transfer NIGHT | `transfers.md` | `transfer-night.ts` |
| Transfer shielded tokens | `transfers.md` | `transfer-shielded.ts` |
| End-to-end (create + fund + dust) | all of the above | `full-test-wallet-setup.ts` |

## References

| Reference | Topic |
|-----------|-------|
| `references/addresses-and-tokens.md` | Three-address model |
| `references/wallet-creation.md` | Seed sources, `WalletSeeds` derivation, construction |
| `references/funding.md` | Per-network funding strategy |
| `references/dust-registration.md` | DUST mechanics + registration |
| `references/balance-monitoring.md` | State subscription patterns |
| `references/transfers.md` | Three transfer kinds |
| `references/network-config.md` | DefaultConfiguration per network |
| `references/troubleshooting.md` | Common symptoms |

## Examples

| Example | Demonstrates |
|---------|--------------|
| `examples/create-wallet.ts` | Wallet construction (random, mnemonic, hex seed) |
| `examples/fund-wallet-undeployed.ts` | Genesis-seed airdrop on local devnet |
| `examples/fund-wallet-public-faucet.ts` | Print-and-wait pattern for testnets |
| `examples/register-dust.ts` | DUST registration |
| `examples/monitor-wallet.ts` | Live balance ticker |
| `examples/transfer-night.ts` | Unshielded NIGHT transfer |
| `examples/transfer-shielded.ts` | Shielded transfer |
| `examples/full-test-wallet-setup.ts` | End-to-end |

## Related skills

| Need | Skill |
|------|-------|
| Wallet SDK package reference | `midnight-wallet:wallet-sdk` |
| SDK drift detection / smoke test | `midnight-wallet:sdk-regression-check` |
| Local devnet management | `midnight-tooling:devnet` |
| Genesis seed for local devnet | `midnight-tooling:devnet#genesis-seed` |
| Browser wallet (Lace) integration | `midnight-dapp-dev:dapp-connector` |
| DApp SDK provider wiring | `midnight-dapp-dev:midnight-sdk` |
| Testing wallet SDK code | `midnight-cq:wallet-testing` |
