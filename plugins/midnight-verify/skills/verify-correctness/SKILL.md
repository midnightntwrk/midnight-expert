---
name: midnight-verify:verify-correctness
description: >-
  Hub skill for the midnight-verify plugin. Classifies claims by domain,
  routes to the appropriate domain skill, dispatches sub-agents based on the
  domain skill's routing, and synthesizes final verdicts. Loaded by the
  /midnight-verify:verify command — the main thread acts as orchestrator.
version: 0.5.0
---

# Verification Hub

You are the verification orchestrator. This skill tells you how to classify claims, route them to the correct domain skill, dispatch sub-agents, and synthesize verdicts.

## Process

### 1. Classify the Domain

Determine what domain the claim belongs to:

| Domain | Indicators | Route To |
|---|---|---|
| **Compact language** | Compact syntax, stdlib functions, types, disclosure, compiler behavior, patterns, privacy, circuit costs | Load `midnight-verify:verify-compact` |
| **SDK/TypeScript** | API signatures, @midnight-ntwrk packages, import paths, type definitions, providers, DApp connector | Load `midnight-verify:verify-sdk` |
| **ZKIR** | ZKIR opcodes, circuit constraints, field elements, proof data, `.zkir` files, transcript protocol, checker behavior, circuit structure | Load `midnight-verify:verify-zkir` |
| **Witness** | Witness implementation, WitnessContext, private state, `[PrivateState, T]` return tuple, `.compact` + `.ts` file pair, witness declarations, type mappings | Load `midnight-verify:verify-witness` |
| **Cross-domain** | Spans Compact and SDK, Compact and ZKIR, Witness and ZKIR, or protocol/architecture | Load applicable domain skills |
| **Wallet SDK** | @midnightntwrk/wallet-sdk-* packages, WalletFacade, WalletBuilder, WalletRuntime, RuntimeVariant, DApp Connector API (ConnectedAPI, InitialAPI, window.midnight), HD derivation, Bech32m addresses, branded types (ProtocolVersion, WalletSeed), three-wallet architecture, capabilities (Balancer, ProvingService, SubmissionService) | Load `midnight-verify:verify-wallet-sdk` |
| **Ledger/Protocol** | Transaction structure (intents, segments, offers, binding), token mechanics (Night UTXO, Zswap commitment/nullifier, Dust generation), cost model (SyntheticCost, fee pricing, block limits), on-chain VM (opcodes, StateValue, stack machine), contract execution (deployment, calls, effects, transcripts), cryptographic primitives (Pedersen, Fiat-Shamir, signatures, Merkle trees), @midnight-ntwrk/ledger-v8 API, well-formedness rules, FAB encoding, formal security properties | Load `midnight-verify:verify-ledger` |
| **Tooling** | Compact CLI commands (compact compile, compactc), CLI flags (--skip-zk, --language-version, --help), compiler output structure, compiler error messages, exit codes, CLI version/installation, CLI wrapper vs compactc distinction | Load `midnight-verify:verify-tooling` |

### 2. Load the Domain Skill

Load the appropriate domain skill(s) using the Skill tool. The domain skill provides a routing table that tells you which verification method(s) to use.

### 3. Dispatch Sub-Agents

Based on the domain skill's routing:

- **Compact execution needed** → dispatch @"midnight-verify:contract-writer (agent)" with the claim
- **Source inspection needed** → dispatch @"midnight-verify:source-investigator (agent)" with the claim
- **Type-checking needed** → dispatch @"midnight-verify:type-checker (agent)" with the claim and what type assertion to make
- **Devnet E2E needed** → dispatch @"midnight-verify:sdk-tester (agent)" with the claim and what behavior to observe
- **Package/version check needed** → dispatch @"devs:deps-maintenance (agent)" with the package name and version claim. If deps-maintenance is not available (plugin not installed), run `npm view` directly as a fallback.
- **ZKIR checker verification needed** → dispatch @"midnight-verify:zkir-checker (agent)" with the claim and whether to use the checker method, inspection method, or both
- **ZKIR regression sweep needed** → dispatch @"midnight-verify:zkir-checker (agent)" and instruct it to load the `midnight-verify:zkir-regression` skill for the regression claim list and expected verdicts
- **Witness verification needed** → dispatch @"midnight-verify:witness-verifier (agent)" with the claim and both file paths (if provided)
- **Witness + ZKIR verification needed** → dispatch @"midnight-verify:witness-verifier (agent)" first (it compiles and verifies), then pass the build output path to @"midnight-verify:zkir-checker (agent)" for PLONK verification. These are sequential, not concurrent.

**Wallet SDK verification:**
- Pre-flight type-check → dispatch @"midnight-verify:type-checker (agent)" with `domain: 'wallet-sdk'` context
- Source investigation (primary, always runs) → dispatch @"midnight-verify:source-investigator (agent)" with instruction to load the `midnight-verify:verify-by-wallet-source` skill for wallet-specific repo routing
- Devnet E2E (fallback, only if source is Inconclusive) → dispatch @"midnight-verify:sdk-tester (agent)" with `domain: 'wallet-sdk'` context

**For wallet SDK claims, dispatch @"midnight-verify:type-checker (agent)" and @"midnight-verify:source-investigator (agent)" concurrently.** Wait for source-investigator. Only dispatch sdk-tester if source returned Inconclusive.

**Ledger/Protocol verification:**
- Source investigation (primary, always runs) → dispatch @"midnight-verify:source-investigator (agent)" with instruction to load the `midnight-verify:verify-by-ledger-source` skill for Rust crate-level routing
- Type-check (pre-flight, TS API claims only) → dispatch @"midnight-verify:type-checker (agent)" (uses existing sdk-workspace)
- Compilation/execution (secondary) → dispatch @"midnight-verify:contract-writer (agent)" with instruction to extract ledger-level evidence
- ZKIR inspection (secondary) → dispatch @"midnight-verify:zkir-checker (agent)" for VM/opcode claims
- Ledger-v8 execution (secondary) → dispatch @"midnight-verify:type-checker (agent)" in ledger execution mode

**For ledger claims, source investigation always runs.** Secondary methods provide corroborating evidence and are dispatched concurrently when the claim is testable.

**Tooling verification:**
- CLI execution (primary) → dispatch @"midnight-verify:cli-tester (agent)" for behavioral claims
- Source investigation (secondary) → dispatch @"midnight-verify:source-investigator (agent)" for internal/architectural claims

**For tooling claims, prefer CLI execution.** Running the command is more authoritative than reading source.

- **Multiple methods needed** → dispatch applicable agents **concurrently** (they are independent and can run in parallel)

When dispatching, pass:
- The claim verbatim
- Any relevant context (file path, code snippet, what specifically to check)
- For @"midnight-verify:contract-writer (agent)": what observable behavior would confirm/refute the claim
- For @"midnight-verify:source-investigator (agent)": which repo/area to focus on (from the domain skill's routing)
- For @"midnight-verify:type-checker (agent)": what type assertion to write, or the file path to check
- For @"midnight-verify:sdk-tester (agent)": what runtime behavior to observe

### 4. Synthesize the Verdict

Collect the sub-agent report(s) and produce the final verdict.

**Verdict options:**

| Verdict | Qualifier | When to Use |
|---|---|---|
| **Confirmed** | (tested) | Contract-writer compiled and ran code; output matched the claim |
| **Confirmed** | (source-verified) | Source-investigator found definitive source evidence confirming the claim |
| **Confirmed** | (tested + source-verified) | Both methods used and both agree the claim is correct |
| **Refuted** | (tested) | Contract-writer compiled and ran code; output contradicts the claim |
| **Refuted** | (source-verified) | Source-investigator found definitive source evidence contradicting the claim |
| **Refuted** | (tested + source-verified) | Both methods disagree with the claim |
| **Refuted** | (tested, source disagrees) | Execution contradicts but source seems to support — execution wins, disagreement noted |
| **Inconclusive** | — | Couldn't test via execution AND couldn't find definitive source evidence |
| **Confirmed** | (type-checked) | Type-checker ran tsc --noEmit; types match the claim |
| **Confirmed** | (type-checked + tested) | Both tsc and devnet E2E agree |
| **Confirmed** | (package-verified) | npm view / deps-maintenance confirms package/version |
| **Refuted** | (type-checked) | tsc produced type errors contradicting the claim |
| **Refuted** | (package-verified) | Package doesn't exist or version doesn't match |
| **Inconclusive** | (devnet unavailable) | Claim needs E2E testing but devnet is not running |
| **Inconclusive** | (type-check insufficient) | Types match but claim is about runtime behavior — can't verify without devnet |
| **Confirmed** | (zkir-checked) | WASM checker accepted the circuit with expected inputs |
| **Confirmed** | (zkir-checked + tested) | Both WASM checker and Compact JS runtime agree |
| **Confirmed** | (zkir-inspected) | Circuit structure analysis confirms the claim |
| **Confirmed** | (zkir-checked + source-verified) | Checker result corroborated by source inspection |
| **Refuted** | (zkir-checked) | WASM checker produced unexpected accept/reject for the claim |
| **Refuted** | (zkir-inspected) | Circuit structure contradicts the claim |
| **Inconclusive** | (zkir-checker unavailable) | `@midnight-ntwrk/zkir-v2` could not be installed or loaded |
| **Confirmed** | (witness-verified) | Type check + structural checklist + execution all pass |
| **Confirmed** | (witness-verified + tested) | Local verification + devnet E2E both pass |
| **Confirmed** | (witness-verified + zkir-checked) | Witness verification + PLONK proof valid |
| **Refuted** | (witness-verified) | Type check, structural check, or execution failed |
| **Inconclusive** | (devnet unavailable) | Local witness verification passed but devnet E2E needed and unavailable |
| **Confirmed** | (source-verified) | Source investigation found definitive wallet SDK source evidence (wallet SDK domain) |
| **Confirmed** | (source-verified + tested) | Source confirmed and devnet E2E also passed (wallet SDK domain) |
| **Refuted** | (source-verified) | Source contradicts the wallet SDK claim |
| **Refuted** | (type-checked + source-verified) | Type-check failed and source confirms it's wrong (wallet SDK domain) |
| **Inconclusive** | (source insufficient, devnet unavailable) | Couldn't confirm via source, devnet not running (wallet SDK domain) |
| **Confirmed** | (source-verified) | Rust source confirms the ledger/protocol claim |
| **Confirmed** | (source-verified + tested) | Rust source confirmed, compilation/execution also confirms (ledger domain) |
| **Confirmed** | (tested) | Compilation/execution directly confirms (e.g., cost model output, well-formedness check) (ledger domain) |
| **Refuted** | (source-verified) | Rust source contradicts the ledger/protocol claim |
| **Refuted** | (tested) | Compilation/execution contradicts the claim (ledger domain) |
| **Inconclusive** | — | Source investigation insufficient, no execution path available (ledger domain) |
| **Confirmed** | (cli-tested) | Ran the CLI command, output matches the claim (tooling domain) |
| **Confirmed** | (cli-tested + source-verified) | CLI output and source code both confirm (tooling domain) |
| **Confirmed** | (source-verified) | Internal claim verified via source, not testable via CLI (tooling domain) |
| **Refuted** | (cli-tested) | Ran the CLI command, output contradicts the claim (tooling domain) |
| **Refuted** | (source-verified) | Source contradicts the internal claim (tooling domain) |
| **Inconclusive** | (cli unavailable) | Compact CLI not installed or not on PATH (tooling domain) |

**Critical rule for wallet SDK claims:** Type-checking is a fast pre-flight only. It NEVER produces a standalone verdict for wallet SDK claims. Every wallet SDK verdict must come from source investigation (or devnet E2E as a fallback). There is no `Confirmed (type-checked)` for wallet SDK claims.

**When sub-agents disagree:** Execution evidence wins. The code ran and produced a result — that's more authoritative than interpreting source. But you MUST note the disagreement in your report so the user is aware.

**When WASM checker and Compact JS runtime disagree:** The checker is more authoritative for constraint behavior (it operates at the proof system level). The JS runtime is more authoritative for output values (it runs the actual contract logic). Flag the disagreement in your report.

**Inconclusive verdicts must explain:**
- Why the claim couldn't be tested via execution
- Why source inspection was insufficient
- What the user could do to resolve it (e.g., "this requires runtime benchmarking on a live network")

**Critical rule for SDK claims:** A clean `tsc` run does NOT confirm behavioral claims. If the claim is about what happens at runtime (deploy, call, state changes), type-checking can confirm the type/signature part but must note that runtime verification requires devnet. When a claim has both type and behavioral components, dispatch type-checker and sdk-tester concurrently.

### 5. Format the Final Report

```markdown
## Verdict: [Confirmed|Refuted|Inconclusive] ([qualifier])

**Claim:** [the claim as stated — verbatim]

**Method:** [tested|source-verified|tested + source-verified]

**Evidence:**
[Summarize what was done and what was observed. For execution: describe the test
contract, compilation result, and runtime output. For source: describe where you
looked, what you found, with file paths and links. Include enough detail that the
user can independently verify your finding.]

**Conclusion:**
[One or two sentences: why the evidence confirms, refutes, or is inconclusive.]
```

**For file verification** (when given a `.compact` file to verify):

Extract individual claims from the file — assertions in comments, patterns used, stdlib functions called, type annotations, disclosure usage. Verify each claim separately. Group findings by line/section. Provide an overall summary at the end.

## What This Skill Does NOT Do

- It does not contain domain-specific verification logic — that lives in domain skills like the `midnight-verify:verify-compact` skill and the `midnight-verify:verify-sdk` skill
- It does not contain method-specific instructions — those live in method skills like the `midnight-verify:verify-by-execution` skill, the `midnight-verify:verify-by-source` skill, the `midnight-verify:verify-by-type-check` skill, and the `midnight-verify:verify-by-devnet` skill
- It does not directly verify anything — it classifies, routes, dispatches, and synthesizes
