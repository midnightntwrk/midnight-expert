# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ci-compact-core-examples` workflow and `plugins/compact-core/scripts/compile-compact-core-examples.sh`, which compile the compact-core skill example contracts against the network-supported compiler (0.31.1) — previously only the `compact-examples` contracts had compile coverage.
- README "Network & Component References" section documenting the `proof-server`, `midnight-indexer`, and `midnight-node` plugins.

### Changed

- Bumped the `compact-core` plugin to `0.13.0` so the PR #253 `compact-init-project` rewrite actually ships. The skill was reworked from `create-mn-app` onto the vendored, zero-dependency `new-example.mjs` generator (+ `templates/example/`), but the plugin version was left at `0.12.0` — meaning already-installed users stayed pinned to the stale, cached `0.12.0` and never received the new generator or templates. Version-keyed plugin caching requires the bump to propagate the change.
- README "At a glance" now reflects all 16 marketplace plugins (was 13) and updated skill/command counts.
- Aligned the proof-server Docker example to the current `8.1.0` image tag.
- Refreshed the compact-tokens "Known Limitations" note from compiler 0.29.0 to the current 0.31.1.

### Known issues

- Four `compact-core/skills/compact-tokens/examples` contracts (`FungibleToken`, `MultiToken`, `NonFungibleToken`, `ShieldedFungibleToken`) import OpenZeppelin/security building-block modules that are not present alongside them, so they cannot be compiled standalone and are skipped by the new CI. Vendoring those modules (or relocating the examples) is a tracked follow-up.
