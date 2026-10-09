---
name: compact-core:compact-debugging
description: This skill should be used when a user needs help debugging Compact smart contract errors, including compiler failures ("parse error", "unbound identifier"), proof generation issues, TypeScript witness type mismatches, disclosure errors ("potential witness-value disclosure must be declared"), or compatibility problems between Midnight components. Also applies when a user says their contract "won't compile", "worked before but broke after update", or when consecutive fix attempts keep revealing new errors. This skill orchestrates the debugging process and routes to domain-specific compact-core skills.
version: 0.1.0
---

# Compact Contract Debugging

## Overview

Core principle: **NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Debugging flow: Don't guess → Hypothesize → Instrument → Reproduce → Analyze → Fix → Verify.

This skill is process orchestration — it routes to existing compact-core skills for domain knowledge and does NOT duplicate their content.

## Early Triage Fork

First determine: **"Is this a code bug or a compatibility issue?"**

**Code bug indicators:**
- Compiler error with specific line/char reference
- Logic error in circuit behavior
- Type mismatch in contract code
- Disclosure error

**Compatibility issue indicators:**
- "Worked before, broke after update"
- Deployment succeeds but runtime rejects
- SDK types don't match generated types
- Proof server rejects valid proof
- Version mismatch mentioned

**If compatibility:** fetch live support matrix from `midnightntwrk/midnight-docs` (`docs/relnotes/support-matrix.mdx`), compare against installed versions. Recommend `/midnight-tooling:doctor` for automated diagnostics.

| Functional Area | Components |
|-----------------|------------|
| Network | Node |
| Runtime & Contracts | Compact Compiler, Compact Runtime, Compact JS, On-chain Runtime, Ledger |
| SDKs & APIs | Wallet SDK, Midnight.js, DApp Connector API |
| Indexing & Data | Midnight Indexer |
| ZK & Proving | Proof Server |

**If code bug:** proceed to triage table.

## Step 0 — Mechanical Verification Baseline

Before any investigation, run `/midnight-verify:verify` on the contract:

```bash
/midnight-verify:verify <file.compact>
```

If the issue involves witnesses:

```bash
/midnight-verify:verify <contract.compact> <witnesses.ts>
```

The verification result immediately narrows the problem space:
- **Compilation failure** → the issue is in the Compact source (proceed to triage table with compiler error)
- **Type check failure** → the witness types don't match the contract (check type mappings)
- **Structural check failure** → witness patterns are wrong (name mismatch, missing tuple wrapper, etc.)
- **Execution failure** → the contract logic fails at runtime (proceed to hypothesis phase)
- **All pass** → the contract is mechanically correct; the issue may be environmental or integration-related

If `/midnight-verify:verify` identifies the issue directly, present the finding — no further investigation may be needed.

## Symptom-Driven Triage Table

| Symptom | Route To Skill | Investigation Phase |
|---------|---------------|-------------------|
| `parse error: found...` | compact-language-ref (troubleshooting) | Root Cause |
| `unbound identifier` | compact-language-ref + compact-standard-library (hallucination traps) | Root Cause |
| `potential witness-value disclosure` | compact-privacy-disclosure (debugging-disclosure) | Root Cause |
| `incompatible combination of types` | compact-language-ref (types-and-values) | Root Cause |
| `cannot cast from type` | compact-language-ref (types-and-values) | Root Cause |
| `cannot prove assertion` | compact-language-ref (troubleshooting, runtime section) | Hypothesis |
| `operation undefined for type` | compact-ledger (types-and-operations) | Root Cause |
| TypeScript type mismatch | compact-witness-ts (type-mappings) | Root Cause |
| Witness returns unexpected value | compact-witness-ts (witness-implementation) | Hypothesis |
| Token mint/transfer fails | compact-tokens (token-operations) | Pattern Analysis |
| MerkleTree proof fails | compact-privacy-disclosure + compact-standard-library | Hypothesis |
| "Works locally, fails on devnet" | compact-witness-ts (contract-runtime) | Pattern Analysis |
| Contract deploys but can't query state | Compatibility check (Indexer ↔ Ledger) | Compatibility |
| Proof generation hangs or fails | Compatibility check (Proof Server ↔ Compiler) | Compatibility |
| Wallet can't sign transactions | Compatibility check (Wallet SDK ↔ DApp Connector ↔ Midnight.js) | Compatibility |
| SDK bindings don't match generated types | Compatibility check (Compact JS ↔ Compiler) | Compatibility |
| Node rejects transaction | Compatibility check (Node ↔ On-chain Runtime) | Compatibility |
| `import not found` / `module not found` | compact-language-ref (modules-and-imports) | Root Cause |
| Adding `disclose()` keeps causing new errors | compact-privacy-disclosure (step 5: restructure) | Pattern Analysis |
| Constructor errors or missing initialization | compact-structure (patterns) + compact-ledger (state-design) | Root Cause |
| Enum variant access errors | compact-language-ref (troubleshooting) | Root Cause |

## Investigation Phases

Entered based on triage result, not enforced sequentially.

### Phase 1 — Root Cause Investigation

- Read the full error message, including the compiler's path trace if present
- Trace data flow from source (witness/parameter) to error point
- Cross-reference with the routed skill's reference material
- Identify the specific line and expression causing the issue

### Phase 2 — Pattern Analysis

- Is this a known pattern from the triage table?
- Have we seen this category of error before in this session?
- Are consecutive failures appearing in different areas? (escalation trigger)
- Check if the issue is structural (design problem) vs. local (typo/oversight)

### Phase 3 — Hypothesis and Testing

- Form a specific, testable hypothesis about WHY the error occurs
- State the hypothesis explicitly before attempting any fix
- If compiler available: instrument and verify with `skipZk=true`
- If not: reason through the hypothesis against the contract logic

### Phase 4 — Implementation

- Apply the fix based on confirmed hypothesis
- Verify via compilation (if tools available)
- Audit side effects:
  - For `disclose()` additions: "What can an on-chain observer learn from this value?"
  - For structural changes: check that other circuits still have access to what they need
  - For type changes: verify downstream cast chains still hold

## Silent Fix Tracking

Track every fix attempt internally using this format:

```
Fix #1: [category] [what was tried] [result: resolved | new error | same error]
Fix #2: ...
```

**Escalation triggers:**

- **3+ consecutive fixes revealing new errors in different areas:** Surface: "Multiple fixes are uncovering errors in different areas. This may indicate an architectural issue. Before continuing, let's step back and review what we've found so far." Present summary of all attempted fixes and outcomes. Recommend discussing design before further patching.
- **Same error category attempted 3+ times:** Surface: "We've attempted this category of fix multiple times. Let's reconsider our hypothesis."

## Process Violation Detection

Surface a warning (non-blocking) when detecting:

| Pattern | Warning |
|---------|---------|
| Fix applied without stated hypothesis | "What's our hypothesis for why this will work?" |
| Same error category failed 3+ times | "We've tried this approach multiple times. Let's reconsider." |
| Fix in area A causes new error in area B | "This fix introduced a new issue elsewhere. Possible architectural concern." |
| Rapid successive fix attempts | "Let's slow down and verify our understanding before the next attempt." |

## Red Flags — Stop Immediately

Stop immediately if the reasoning pattern matches any of the following.

- Applying a quick fix with the intention of investigating later
- Attempting yet another fix after multiple consecutive failures without re-evaluating the approach
- Proceeding with a fix without understanding why it should work
- Trying something without first forming a testable hypothesis
- Dismissing an environment difference without investigating it

**If any of these apply:** Stop. Return to Phase 1 (Root Cause Investigation) before attempting any fix.

## Warning Signs of Deeper Problems

Consecutive fixes revealing new problems in different areas indicates architectural issues: stop patching, document findings, discuss with team, consider design rethink.

## Verification Protocol

After every fix:

1. **Compile** — if tools available, run with `skipZk=true`. If unavailable, advise manual compilation.
2. **Privacy audit** — for any `disclose()` added, trace value to source and document what becomes public.
3. **Regression check** — verify the fix didn't break other circuits or change intended privacy properties.
4. **Update fix tracker** — record result for escalation monitoring.

## Referenced Skills and Tools

**Skills (loaded on demand via triage routing):**
- `compact-language-ref` — compiler errors, syntax, types, troubleshooting
- `compact-privacy-disclosure` — disclosure errors, privacy patterns, debugging process
- `compact-structure` — contract anatomy, common mistakes
- `compact-standard-library` — stdlib verification, hallucination traps
- `compact-witness-ts` — TypeScript witnesses, type mappings, contract runtime
- `compact-ledger` — state design, ADT operations
- `compact-tokens` — token operations, mint/transfer patterns

**Cross-plugin references:**
- `/midnight-tooling:doctor` — automated version diagnostics, environment health
- Live support matrix: `midnightntwrk/midnight-docs` → `docs/relnotes/support-matrix.mdx`

## What This Skill Does NOT Contain

- No compiler error explanations (in compact-language-ref)
- No disclosure debugging steps (in compact-privacy-disclosure)
- No wrong→correct syntax patterns (in compact-structure)
- No hallucination traps (in compact-standard-library)
- No type mapping tables (in compact-witness-ts)

This skill is purely process orchestration + triage routing + fix tracking.
