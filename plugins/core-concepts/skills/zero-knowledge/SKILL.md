---
name: core-concepts:zero-knowledge
description: This skill should be used when the user asks about zero-knowledge proofs, ZK SNARKs, witness data, prover/verifier roles, constraint systems, proof generation, proof verification, privacy boundaries, or how Midnight uses ZK cryptography for transaction privacy and data protection.
version: 0.1.0
---

# Zero-Knowledge Proofs in Midnight

Zero-knowledge proofs let you prove knowledge of a secret without revealing it. In Midnight, ZK proofs validate that transactions follow contract rules without exposing private data.

## Core Concept

A ZK proof proves: "I know values that satisfy these constraints" without revealing the values.

**Midnight application**: Prove a transaction is valid (correct inputs, authorized user, rules followed) without exposing private state or user secrets.

## ZK SNARKs

Midnight uses **ZK SNARKs** (Zero-Knowledge Succinct Non-interactive Arguments of Knowledge):

| Property | Meaning |
|----------|---------|
| **Zero-Knowledge** | Verifier learns nothing beyond validity |
| **Succinct** | Proof small and fast to verify, regardless of computation size |
| **Non-interactive** | No back-and-forth between prover and verifier |
| **Argument of Knowledge** | Prover must actually know the secret |

## How Proofs Work in Midnight

### Transaction Structure

Every Midnight transaction contains:
1. **Public transcript** - Visible state changes
2. **Zero-knowledge proof** - Cryptographic validation

The proof demonstrates: "I know private inputs that, when combined with public data, satisfy the contract's constraints."

### Circuit Mental Model

Contract logic compiles to **circuits** - mathematical constraint systems. Here "circuit" refers to an arithmetic circuit — a directed acyclic graph of addition and multiplication gates over a finite field — not an electrical circuit.

```text
Compact Code → Circuit Constraints → ZK Proof
```

A circuit defines relationships between variables. The proof shows you know variable assignments satisfying all constraints without revealing the assignments.

### Proof Lifecycle

```text
1. Setup      → Universal SRS generated once; per-circuit keys derived from it
2. Witness    → Prover assembles private inputs
3. Prove      → Generate proof from witness + circuit
4. Verify     → Check proof against public inputs (fast)
```

## Circuits in Practice

### What Gets Proven

When a Compact contract executes:
1. Contract logic compiles to arithmetic circuit
2. Private values become witness inputs
3. Public values become public inputs
4. Proof demonstrates correct execution

### Circuit Constraints

Circuits express computations as gate constraints:

```text
// Conceptual: proving x * y = z without revealing x, y
gate constraint: a * b = c
public input: c = 42
witness (private): a = 6, b = 7
```

### Compact to Circuit

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger target: Field;

// Witness declaration (implementation provided in TypeScript)
witness get_guess(): Field;
witness get_other_factor(): Field;

// This Compact circuit...
export circuit guess(): [] {
  const g = get_guess();
  const other_factor = get_other_factor();
  const product = g * other_factor;
  assert(product == target, "Product does not match target");
}

// ...compiles to constraints that prove:
// 1. guess * other_factor equals target
// 2. Without revealing guess or other_factor values
```

## Practical Applications

### Proving Without Revealing

| Scenario | What's Proven | What's Hidden |
|----------|---------------|---------------|
| Age verification | Age >= 18 | Exact birthdate |
| Balance check | Balance >= amount | Actual balance |
| Membership | In authorized set | Which member |
| Vote validity | Eligible voter, hasn't voted | Voter identity |

### In Contracts

Prove you know the preimage of a public hash without revealing it:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger target_hash: Bytes<32>;

witness get_secret(): Bytes<32>;

// Prove knowledge of a hash preimage without revealing it
export circuit proveKnowledge(): [] {
  const secret = get_secret();
  // Constraint: Hash(secret) must equal public target
  assert(persistentHash<Bytes<32>>(secret) == target_hash, "Hash does not match target");
  // Verifier learns: "prover knows a valid preimage"
  // Verifier does NOT learn: the actual secret value
}
```

## Key Concepts

### Witness
Private inputs the prover knows. Never revealed, used only to generate proof. In Compact, witnesses are declared with `witness name(): Type;` and implemented in TypeScript.

### Public Inputs
Values visible to everyone. Proof verified against these.

### Verification
Checking a proof is fast (milliseconds) regardless of original computation complexity.

### Soundness
Computationally infeasible to create valid proof without knowing witness.

### disclose()
Marks the boundary between private (witness-tainted) and public data in Compact. Required when witness-derived values flow to public context (ledger writes, assert conditions, circuit returns). Commitment functions (`persistentCommit`) clear witness taint; hash functions (`persistentHash`) do not. See `core-concepts:smart-contracts` for full syntax reference.

## Performance Characteristics

| Operation | Cost |
|-----------|------|
| Circuit compilation | One-time, expensive |
| Proof generation | Seconds for typical contracts, depending on circuit complexity |
| Proof verification | Milliseconds |
| Proof size | Small (less than a kilobyte) |

## References

For detailed technical information:
- **`references/snark-internals.md`** - PLONK proving system, polynomial commitments, universal setup
- **`references/circuit-construction.md`** - How Compact compiles to circuits

## Examples

Working patterns:
- **`examples/circuit-patterns.compact`** - Common proof patterns
