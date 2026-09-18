---
name: midnight-verify:verify-wallet-sdk
description: >-
  Wallet SDK claim classification and method routing. Determines what kind of
  wallet SDK claim is being verified and which verification methods apply:
  type-checking (pre-flight only), source investigation (primary), or devnet
  E2E (fallback). Handles claims about @midnightntwrk/wallet-sdk-* packages,
  WalletFacade, WalletBuilder, the DApp Connector API, HD derivation, Bech32m
  addresses, branded types, and the three-wallet architecture. Loaded by the
  /midnight-verify:verify command alongside the hub skill.
version: 0.1.0
---

# Wallet SDK Claim Classification

This skill classifies wallet SDK claims and determines which verification method to use. The /midnight-verify:verify command loads this alongside the `midnight-verify:verify-correctness` hub skill.

## Verification Flow

Every wallet SDK claim follows the same three-step flow:

1. **Type-check (pre-flight)** — dispatch @"midnight-verify:type-checker (agent)" in wallet-sdk-workspace mode. Fails fast if the claim is fundamentally broken. Type-checking alone NEVER produces a verdict for wallet SDK claims.
2. **Source investigation (primary)** — always runs. Dispatch @"midnight-verify:source-investigator (agent)", which loads `verify-by-wallet-source`. This is the primary evidence source for all wallet SDK verdicts.
3. **Devnet E2E (fallback)** — dispatch @"midnight-verify:sdk-tester (agent)" in wallet-devnet mode ONLY if source investigation returns Inconclusive.

## Claim Type → Method Routing

When you receive a wallet SDK claim, classify it using this table:

### Claims About SDK Package API

| Claim Type | Example | Pre-flight | Primary | Fallback |
|---|---|---|---|---|
| Package/type existence | "WalletFacade exports balanceFinalizedTransaction" | @"midnight-verify:type-checker (agent)" | @"midnight-verify:source-investigator (agent)" | — |
| Function signature | "submitTransaction returns Observable\<SubmissionEvent\>" | @"midnight-verify:type-checker (agent)" | @"midnight-verify:source-investigator (agent)" | — |
| Interface shape | "ShieldedAddress has coinPublicKey and encryptionPublicKey" | @"midnight-verify:type-checker (agent)" | @"midnight-verify:source-investigator (agent)" | — |
| Branded type structure | "ProtocolVersion is a branded bigint" | @"midnight-verify:type-checker (agent)" | @"midnight-verify:source-investigator (agent)" | — |
| Transaction lifecycle | "SubmissionEvent goes Submitted → InBlock → Finalized" | @"midnight-verify:type-checker (agent)" | @"midnight-verify:source-investigator (agent)" | — |

### Claims About Wallet Architecture

| Claim Type | Example | Pre-flight | Primary | Fallback |
|---|---|---|---|---|
| HD derivation paths | "Role 2 is Dust, path m/44'/2400'/0'/2/0" | — | @"midnight-verify:source-investigator (agent)" | — |
| Address encoding | "Bech32m prefix for shielded is mn_shield-addr" | — | @"midnight-verify:source-investigator (agent)" | — |
| Three-token architecture | "Dust balance is time-dependent" | — | @"midnight-verify:source-investigator (agent)" | — |
| Variant/runtime behavior | "WalletRuntime migrates state between protocol versions" | — | @"midnight-verify:source-investigator (agent)" | @"midnight-verify:sdk-tester (agent)" |
| Indexer/node integration | "IndexerClient retries 3 times on 502-504" | — | @"midnight-verify:source-investigator (agent)" | — |

### Claims About DApp Connector API

| Claim Type | Example | Pre-flight | Primary | Fallback |
|---|---|---|---|---|
| Connector API methods | "ConnectedAPI.makeTransfer creates a shielded transfer" | @"midnight-verify:type-checker (agent)" | @"midnight-verify:source-investigator (agent)" | @"midnight-verify:sdk-tester (agent)" |
| Connector error handling | "PermissionRejected is permanent per session" | — | @"midnight-verify:source-investigator (agent)" | — |
| Connector types | "DesiredOutput has kind, type, value, recipient fields" | @"midnight-verify:type-checker (agent)" | @"midnight-verify:source-investigator (agent)" | — |

### Claims About Behavioral Outcomes

| Claim Type | Example | Pre-flight | Primary | Fallback |
|---|---|---|---|---|
| Facade lifecycle | "WalletFacade.init syncs all three wallets" | — | @"midnight-verify:source-investigator (agent)" | @"midnight-verify:sdk-tester (agent)" |
| Proving behavior | "WasmProver uses web-worker for background proving" | — | @"midnight-verify:source-investigator (agent)" | — |
| Submission behavior | "PolkadotNodeClient auto-disconnects after metadata fetch" | — | @"midnight-verify:source-investigator (agent)" | — |

### Routing Rules

**When in doubt:**
- API surface (types, exports, signatures) → @"midnight-verify:type-checker (agent)" pre-flight + @"midnight-verify:source-investigator (agent)"
- Architecture or protocol design → @"midnight-verify:source-investigator (agent)" only
- Runtime behavior → @"midnight-verify:source-investigator (agent)", with @"midnight-verify:sdk-tester (agent)" fallback if Inconclusive

**Type-checking is NEVER sufficient alone.** It is a fast pre-flight gate. Every wallet SDK claim must be resolved by source investigation (or devnet E2E as a last resort).

## Hints from Existing Skills

Sub-agents may load these skills for context. They are **hints only** — never cite skill content as evidence in the verdict.

- `midnight-dapp-dev:midnight-sdk` skill — provider setup, SDK component overview
- `midnight-dapp-dev:dapp-connector` skill — wallet integration patterns
- `compact-core:compact-witness-ts` skill — witness implementation patterns (if claim spans wallet + witness)
- `midnight-wallet:wallet-sdk` skill — comprehensive wallet SDK package reference, API surface, construction patterns

Load only what's relevant to the specific claim.
