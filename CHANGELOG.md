# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ci-compact-core-examples` workflow and `plugins/compact-core/scripts/compile-compact-core-examples.sh`, which compile the compact-core skill example contracts against the network-supported compiler (0.31.1) — previously only the `compact-examples` contracts had compile coverage.
- README "Network & Component References" section documenting the `proof-server`, `midnight-indexer`, and `midnight-node` plugins.

### Changed

- README "At a glance" now reflects all 16 marketplace plugins (was 13) and updated skill/command counts.
- Aligned the proof-server Docker example to the current `8.1.0` image tag.
- Refreshed the compact-tokens "Known Limitations" note from compiler 0.29.0 to the current 0.31.1.
- The compact-tokens example contracts now compile standalone and are covered by `ci-compact-core-examples` (#256). Their OpenZeppelin dependencies (`security/Initializable`, `utils/Utils`, `crypto/ElGamal`, `crypto/EcdhMask`) are vendored into `plugins/compact-core/skills/compact-tokens/{security,utils,crypto}/` from `OpenZeppelin/compact-contracts` v0.3.0-alpha.2 (matching the 0.31.1 compiler pin), and all four are removed from the CI `SKIP` list. The shielded example (`ShieldedFungibleToken`, which depended on the removed-upstream `ShieldedERC20`) is replaced by upstream `ConfidentialFungibleToken` (ElGamal encrypted-balance model).
