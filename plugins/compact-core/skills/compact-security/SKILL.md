---
name: compact-core:compact-security
description: This skill should be used when performing a security review or audit of Compact smart contract code, or when reasoning about Compact's security threat model. Covers the three execution contexts (public ledger, ZK circuit, local witness), the witness trust boundary and the ownPublicKey()-for-authorization anti-pattern, sealed-field misuse, disclosure placement, information leakage via assert messages, cryptographic-primitive selection (transientHash/persistentHash/transientCommit/persistentCommit), domain separation, randomness reuse, and hash-derived authentication patterns. Routes to the compact-review checklists for granular line-items and defines the Verification Requests protocol used by the security-reviewer agent.
version: 0.1.0
---

# Compact Security Threat Model

This skill provides the **threat model and adversarial methodology** for reviewing Compact smart contracts. It is the "how to think like an attacker" layer. For granular, item-by-item checklists, it routes to the existing `compact-core:compact-review` references (see the Reuse Map) — those are the single source of truth for line-items, and are not duplicated here.

## Security Model

Compact and the Midnight runtime give you five structural guarantees. Each is a backstop, not a substitute for review:

- **Privacy by default** — witness (private) values cannot reach public ledger state unless explicitly `disclose()`d. The compiler enforces this.
- **Compile-time validation** — type errors, illegal disclosures, and sealed-field writes are rejected at compile time.
- **Zero-knowledge verification** — on-chain, only the proof and disclosed public inputs are checked. The verifier never sees witness values.
- **Bounded execution** — circuits are finite; loops are fixed-iteration and fully unrolled.
- **Immutable deployment** — deployed contract logic cannot be patched. A shipped vulnerability is permanent.

The gap these do **not** cover is the subject of this skill: **what the developer trusts that they should not.**

## Three Execution Contexts

Every Compact value lives in one of three contexts. The reviewer's first job is to know which.

| Context | Where it runs | Verified on-chain? | Visible on-chain? | Trust |
|---------|---------------|--------------------|-------------------|-------|
| **Public ledger** | The chain | Yes | Yes (to everyone) | Trusted, but public — never put secrets here |
| **ZK circuit** | Prover's machine, proven | Yes (via the proof) | Only disclosed values | Trusted **if** every input is constrained inside the proof |
| **Local witness** | Prover's machine, off-circuit | **No** | No | **Untrusted** — a witness can return anything |

The boundary between *ZK circuit* and *local witness* is where most authorization bugs live.

## Trust Boundaries & Adversarial Methodology

Review trust-boundaries first, in this order:

1. **Witness inputs are attacker-controlled.** Every `witness foo(): T` returns a value the prover chose. The circuit must constrain it (hash it, compare it against pinned state, verify a signature) before any decision depends on it. A witness value used directly in an `assert` for authorization is bypassable. See `references/witness-trust-boundary.md`.
2. **Exported-circuit parameters are attacker-controlled.** Anyone can call any `export circuit` with any arguments. Validate every parameter.
3. **`ownPublicKey()` is a witness, not the signer.** It returns the prover-supplied Zswap coin public key — not cryptographically bound to the transaction signer. **Never** use it for authorization/identity gating. Its only safe use is routing shielded coins to the caller after they have passed some appropriately implemented access control gate. See `references/witness-trust-boundary.md`.
4. **Disclosure is a one-way leak.** Anything `disclose()`d becomes public forever. Disclose as late and as narrowly as possible.
5. **Assert messages are public.** A failed transaction's message is observable. Never embed private state in it.

For each circuit, ask: *Which inputs are witness-supplied? What does the code trust about them? Could a malicious prover supply a different value and pass the checks?*

## Reuse Map (threat → detailed checklist)

Apply the threat model, then pull granular checklist items from these existing references. Read `references/threat-catalog.md` for the full index.

| Threat area | Detailed checklist (single source of truth) |
|-------------|---------------------------------------------|
| Access control, crypto primitives, domain separation, nullifiers, Merkle paths, error leakage, input validation | `compact-core:compact-review` → `references/security-review.md` |
| Double-spend, overflow/underflow, mint/burn/transfer authz, shielded/unshielded token ops | `compact-core:compact-review` → `references/token-security-review.md` |
| `disclose()` placement, witness leaks, Set-vs-MerkleTree, salt reuse, conditional disclosure | `compact-core:compact-review` → `references/privacy-review.md` |
| Witness trust boundary, `ownPublicKey()`-for-auth, secure witness-secret pattern | this skill → `references/witness-trust-boundary.md` |

## Verification Requests Protocol

A security review's Critical/High findings should be **mechanically confirmed**. The `security-reviewer` agent **cannot dispatch subagents**, so it does not run `midnight-verify` itself. Instead it appends a `## Verification Requests` block to its report — one entry per Critical/High finding — for the orchestrator (the `/compact-core:audit-compact` command, running on the main thread) to execute.

Emit each request in this shape:

```
## Verification Requests

### VR-<n>  →  finding: <finding id> (<short title>)
- type: poc | target | source
- claim: "<one-sentence, mechanically-testable statement>"
- poc-sketch: |
    <for type: poc — a minimal contract the orchestrator can compile/run to
     demonstrate the issue: what it declares, what it asserts, what input
     triggers the bypass, and what the secure variant does instead>
- expected: "<what a confirming result looks like — e.g. insecure variant ACCEPTS
              the forged input; secure variant REJECTS>"
- suggested command: /midnight-verify:verify "<claim>"   # or: /midnight-verify:verify <file.compact> [<witnesses.ts>]
```

Rules:
- `type: target` — confirm against the contract under review directly.
- `type: poc` — a minimal claim/contract the orchestrator feeds to `/midnight-verify:verify "<claim>"`.
- `type: source` — a claim best confirmed by source inspection (e.g., a stdlib signature or runtime behavior).
- If there are **no** Critical/High findings, emit `## Verification Requests` with a single line: `(none)`.

## Severity Classification

| Level | Criteria |
|-------|----------|
| **Critical** | Will cause loss of funds, data breach, or contract exploitation |
| **High** | Security vulnerability or privacy leak exploitable under certain conditions |
| **Medium** | Correctness issue or significant security-relevant footgun |
| **Low** | Minor best-practice deviation with security relevance |
| **Suggestion** | Hardening opportunity, not a problem |
