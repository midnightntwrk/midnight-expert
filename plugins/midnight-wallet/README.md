# midnight-wallet

<p align="center">
  <img src="assets/mascot.png" alt="midnight-wallet mascot" width="200" />
</p>

Wallet SDK reference, test-wallet management patterns, and SDK regression
checking for Midnight Network development. Programmatic SDK usage only —
browser extension wallets (Lace and others) are handled by
`midnight-dapp-dev:dapp-connector`.

## Skills

### midnight-wallet:wallet-sdk

Package-level reference for `@midnightntwrk/wallet-sdk-*` covering
construction (`WalletFacade.init`), HD key derivation, the three
sub-wallets (shielded, unshielded, dust), state and balances,
transactions, infrastructure clients, the variant/runtime pattern, the
Effect/Promise dual-API pattern, capability sub-exports, and runtime
errors.

### midnight-wallet:managing-test-wallets

Procedural skill for creating, funding, monitoring, and transferring
with test wallets. Eight runnable example scripts cover the common
scenarios on local devnet (`undeployed`) and the public testnets
(`preprod`, `preview`).

### midnight-wallet:sdk-regression-check

Drift detection and live smoke testing for the documented patterns. Two
modes: a fast no-network drift check, and a slow live-devnet smoke test.
Reports findings to the user; never edits documented patterns or the
lock file as part of running.

## Related plugins

| Need | Plugin / Skill |
|------|----------------|
| Local devnet management | `midnight-tooling:devnet` |
| Browser wallet (Lace) integration | `midnight-dapp-dev:dapp-connector` |
| DApp SDK provider wiring | `midnight-dapp-dev:midnight-sdk` |
| Testing wallet SDK code | `midnight-cq:wallet-testing` |
| Compact contract development | `compact-core` |

## Versioning

This plugin pins the wallet SDK package versions it has been verified
against in
`skills/sdk-regression-check/versions.lock.json`. The lock is updated
when the plugin is released, not when the regression-check skill is
run. To check current drift, invoke
`midnight-wallet:sdk-regression-check` and read its output.
