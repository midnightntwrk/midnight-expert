# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ci-compact-core-examples` workflow and `plugins/compact-core/scripts/compile-compact-core-examples.sh`, which compile the compact-core skill example contracts against the network-supported compiler (0.31.1) — previously only the `compact-examples` contracts had compile coverage.
- README "Network & Component References" section documenting the `proof-server`, `midnight-indexer`, and `midnight-node` plugins.
- `NOTICE` files at the repo root and in `compact-core` and `compact-examples`, crediting the project's original author (Aaron Bassett) and carrying the MIT notices for vendored OpenZeppelin and other MIT-licensed example code.

- `plugins/midnight-tooling/network-supported-compiler.txt`, a single-line pin of the network-supported Compact compiler (currently `0.31.1`) read by `install-cli` and both example-compile CI workflows.
- `install-cli` Step 3D: after any install or update, compare the installed compiler to the network-supported version and warn on mismatch, linking the compatibility matrix.

### Changed

- The project is now licensed under Apache-2.0, replacing MIT (no dual licensing). The root `LICENSE` and the per-plugin `LICENSE` files in `compact-core`, `midnight-tooling`, and `midnight-verify` contain the Apache-2.0 text with the copyright line `Copyright (c) 2026 Midnight Foundation and contributors`, and `LICENSE-APACHE` is removed. Every plugin manifest and package `license` field now reads `Apache-2.0`. Vendored OpenZeppelin files and other MIT-headered example files keep their original `SPDX-License-Identifier: MIT` headers, and their MIT notices are carried in `NOTICE`.
- Plugin manifest and package `author` is now Midnight Foundation.
- `CONTRIBUTING.md` asks for Developer Certificate of Origin sign-off (`git commit -s`) instead of a CLA via CLA assistant; the PR template gains a DCO checklist item.
- README "At a glance" now reflects all 16 marketplace plugins (was 13) and updated skill/command counts.
- `install-cli` passes an explicit version to every `compact update` instead of downloading the latest published compiler; project-local installs use an absolute `--directory` path.
- CI example-compile workflows read the compiler pin from `network-supported-compiler.txt` instead of a hardcoded `0.31.1`.

### Fixed

- Compact references now quote what the compiler actually prints. Each message was checked by compiling the pattern with compiler 0.31.1, and again with 0.35.0, across `compilation-review.md`, `troubleshooting.md`, `common-mistakes.md` and related files. Examples: `potential witness-value disclosure must be declared but is not: …` (not "implicit disclosure of witness value"), `unbound identifier Void`, `recursion involving <name>`, and `operation get undefined for ledger field type Map<…>`. The `found "{" looking for ";"` message comes from a witness with a body, not from `Void`. (#276)
- Valid Compact is no longer listed as a mistake. `else if` compiles, and so do `pragma language_version >= 0.22.0` and a direct `Uint<N> as Bytes<M>` cast. `Field == Uint` compiles on 0.31.1 but not on 0.35.0, so the docs now recommend the explicit cast. (#276)
- Fixes that were wrong when compiled or run:
  - The witness-division check now verifies both `q * b + r == a` and `r < b`. The old `q * b <= a` check accepted quotients that were too small, and any quotient for division by zero.
  - The recursion rewrite now uses `fold`, because the old version reassigned a `const` and didn't compile.
  - Self-mint no longer adds `receiveUnshielded`, because `mintUnshieldedToken` to `kernel.self()` already records the receipt.
  - The sealed-field fix in `midnight-status-codes` no longer suggests a non-exported helper called from an exported circuit, which the compiler also rejects.
  - Fixes that write circuit or constructor parameters to the ledger, or use them as `Map` keys, now `disclose()` them. The "PREFERRED" constructor example didn't compile without it. (#276)

- `template-engine` CI: the CLI tests now run a pinned `tsx` dev dependency directly instead of `npx tsx`, whose `npm notice` stderr lines (npm 12) broke the tests' JSON parsing of stderr; the lockfile is refreshed to clear the high-severity `nanoid` advisory (GHSA-2v37-7h3g-55p8) failing `npm audit`.
- A fresh install via `install-cli` produced compiler `0.34.0`, which no live network accepts, while the compact-cli skill documented `0.31.1` as the supported version. Contracts compiled with the wrong version pass every local check and fail at deploy. (#261)
- The compact-core `SessionStart` hook told agents to upgrade to the newest published compiler "before writing any compact code" whenever `compact check` reported an update. That contradicted the network-supported pin and recreated #261. The hook now reads `network-supported-compiler.txt` (repo sibling, `installed_plugins.json`, or the plugin cache) and bases its advice on it. On the pinned version, it says so and warns against upgrading. Older than the pin, it points to `install-cli`. Newer than the pin, it warns that contracts won't deploy and gives `compact update <pin>`. If the pin can't be read, it points to the support matrix and never says "upgrade". Pragma advice is only given for the supported language version. Covered by `test-sessionstart-compiler-advice.sh`, and the hooks CI now also runs when `SessionStart.sh` or the pin file changes. (#273)
- Aligned the proof-server Docker example to the current `8.1.0` image tag.
- Refreshed the compact-tokens "Known Limitations" note from compiler 0.29.0 to the current 0.31.1.
- The compact-tokens example contracts now compile standalone and are covered by `ci-compact-core-examples` (#256). Their OpenZeppelin dependencies (`security/Initializable`, `utils/Utils`, `crypto/ElGamal`, `crypto/EcdhMask`) are vendored into `plugins/compact-core/skills/compact-tokens/{security,utils,crypto}/` from `OpenZeppelin/compact-contracts` v0.3.0-alpha.2 (matching the 0.31.1 compiler pin), and all four are removed from the CI `SKIP` list. The shielded example (`ShieldedFungibleToken`, which depended on the removed-upstream `ShieldedERC20`) is replaced by upstream `ConfidentialFungibleToken` (ElGamal encrypted-balance model).
