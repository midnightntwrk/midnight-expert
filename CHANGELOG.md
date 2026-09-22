# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ci-compact-core-examples` workflow and `plugins/compact-core/scripts/compile-compact-core-examples.sh`, which compile the compact-core skill example contracts against the network-supported compiler (0.31.1) — previously only the `compact-examples` contracts had compile coverage.
- README "Network & Component References" section documenting the `proof-server`, `midnight-indexer`, and `midnight-node` plugins.

- `plugins/midnight-tooling/network-supported-compiler.txt`, a single-line pin of the network-supported Compact compiler (currently `0.31.1`) read by `install-cli` and both example-compile CI workflows.
- `install-cli` Step 3D: after any install or update, compare the installed compiler to the network-supported version and warn on mismatch, linking the compatibility matrix.

### Changed

- Bumped the `compact-core` plugin to `0.13.0` so the PR #253 `compact-init-project` rewrite actually ships. The skill was reworked from `create-mn-app` onto the vendored, zero-dependency `new-example.mjs` generator (+ `templates/example/`), but the plugin version was left at `0.12.0` — meaning already-installed users stayed pinned to the stale, cached `0.12.0` and never received the new generator or templates. Version-keyed plugin caching requires the bump to propagate the change.
- README "At a glance" now reflects all 16 marketplace plugins (was 13) and updated skill/command counts.
- `install-cli` passes an explicit version to every `compact update` instead of downloading the latest published compiler; project-local installs use an absolute `--directory` path.
- CI example-compile workflows read the compiler pin from `network-supported-compiler.txt` instead of a hardcoded `0.31.1`.

### Fixed

- A fresh install via `install-cli` produced compiler `0.34.0`, which no live network accepts, while the compact-cli skill documented `0.31.1` as the supported version. Contracts compiled with the wrong version pass every local check and fail at deploy. (#261)
- Aligned the proof-server Docker example to the current `8.1.0` image tag.
- Refreshed the compact-tokens "Known Limitations" note from compiler 0.29.0 to the current 0.31.1.
- The compact-tokens example contracts now compile standalone and are covered by `ci-compact-core-examples` (#256). Their OpenZeppelin dependencies (`security/Initializable`, `utils/Utils`, `crypto/ElGamal`, `crypto/EcdhMask`) are vendored into `plugins/compact-core/skills/compact-tokens/{security,utils,crypto}/` from `OpenZeppelin/compact-contracts` v0.3.0-alpha.2 (matching the 0.31.1 compiler pin), and all four are removed from the CI `SKIP` list. The shielded example (`ShieldedFungibleToken`, which depended on the removed-upstream `ShieldedERC20`) is replaced by upstream `ConfidentialFungibleToken` (ElGamal encrypted-balance model).
