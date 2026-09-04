---
version: 0.2.0
name: compact-examples:code-examples
description: Use this skill when an agent needs real, compilable examples of Compact smart contracts, TypeScript witnesses, or tests. Covers beginner contracts (hello-world, bulletin board), reusable modules (access control, security, tokens, math, crypto, data structures, identity, utils), composed token contracts (fungible, NFT, multi-token, shielded), and full applications (CryptoKitties, ZK lending, real-world assets). All examples compile with pragma language_version >= 0.22 and full proof generation.
---

# Compact Code Examples

Compilable Compact smart contracts, TypeScript witnesses, and tests sourced from 8 repositories. All code uses `pragma language_version >= 0.22` and passes `compact compile` with full proof generation.

## How to use this skill

1. Find your topic in the routing table below
2. Read the reference file — it catalogues every example with file paths and descriptions
3. Read only the specific `.compact` and witness files you need

Do NOT load all examples into context. Use the reference files to pick precisely what you need.

## Routing Table

| Topic | Reference | When to use |
|---|---|---|
| Beginner examples | references/getting-started.md | Simple contracts, learning basics, minimal state management |
| Reusable modules | references/modules.md | Access control, math, crypto, data structures, utils — building blocks you import |
| Token contracts | references/tokens.md | Fungible, NFT, multi-token, shielded tokens — complete deployable contracts |
| Privacy & cryptography | references/privacy-and-cryptography.md | ZK patterns, signatures, identity proofs, privacy techniques |
| Full applications | references/applications.md | Multi-module DApps, real-world architecture, how pieces compose |
