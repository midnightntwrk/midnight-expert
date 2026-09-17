---
name: compact-core:compact-structure
description: This skill should be used when the user asks to write, structure, or scaffold a Compact smart contract for Midnight, or asks about contract anatomy, pragma and imports, ledger declarations (including sealed ledger), data types (Field, Bytes, Uint, enums, structs), circuits, witnesses, constructors, export patterns, or disclosure rules. Also triggered by mentions of "pragma language_version", "CompactStandardLibrary", circuit definitions, or Compact common mistakes.
version: 0.1.0
---

# Compact Smart Contract Structure

Every Compact program follows a consistent anatomy that maps directly to on-chain state, ZK circuit generation, and off-chain prover integration.

## Contract Anatomy

A Compact contract is organized in this order:

```compact
pragma language_version 0.23;

import CompactStandardLibrary;

// 1. Custom types (enums, structs)
export enum State { active, inactive }
export struct Config { threshold: Uint<64>, admin: Bytes<32> }

// 2. Ledger declarations (on-chain state)
export ledger owner: Bytes<32>;
export sealed ledger config: Config;
export ledger state: State;
export ledger balances: Map<Bytes<32>, Uint<64>>;

// 3. Witness declarations (off-chain data providers)
witness local_secret_key(): Bytes<32>;

// 4. Constructor (one-time initialization)
constructor(threshold: Uint<64>) {
  owner = disclose(get_public_key(local_secret_key()));
  config = disclose(Config { threshold: threshold, admin: owner });
  state = State.active;
}

// 5. Helper circuits (internal logic)
circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

// 6. Exported circuits (transaction entry points)
export circuit do_something(): [] {
  assert(state == State.active, "Contract inactive");
  // ... logic
}
```

## Pragma and Imports

Every contract starts with a version pragma and standard library import:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;
```

> **Tip:** Run `compact compile --language-version` to check which language version your compiler supports.

The pragma specifies a minimum version without patch numbers. The standard library provides `persistentHash`, `persistentCommit` (takes `rand: Bytes<32>` parameter), `transientHash`, and `transientCommit`. Language built-ins include `pad`, `disclose`, `assert`, and `default`.

## Data Types Quick Reference

| Category | Types |
|----------|-------|
| **Primitives** | `Field`, `Boolean`, `Bytes<N>`, `Uint<N>`, `Uint<0..MAX>` |
| **Collections** | `Vector<N, T>`, `Maybe<T>`, `Either<L, R>` |
| **Ledger ADTs** | `Counter`, `Map<K, V>`, `Set<T>`, `List<T>`, `MerkleTree<N, T>`, `HistoricMerkleTree<N, T>` |
| **Opaque** | `Opaque<"string">`, `Opaque<"Uint8Array">` |
| **Custom** | `enum`, `struct` |

For detailed type documentation, operations, and casting rules, consult `references/data-types.md`.

## Ledger Declarations

Ledger fields define on-chain state. Three modifiers control visibility and mutability:

```compact
export ledger publicField: Field;           // Public, readable externally
ledger privateField: Field;                 // Not exported, internal only
export sealed ledger immutable: Bytes<32>;  // Set once in constructor, immutable
```

All ledger operations (reads, writes, ADT method calls) are publicly visible on-chain except for `MerkleTree` and `HistoricMerkleTree` insertions, which store values using cryptographic hashes.

For ADT operations (Counter, Map, Set, List, MerkleTree), consult `references/ledger-declarations.md`.

## Circuits

Circuits are on-chain functions that produce ZK proofs. Return type is `[]` (empty tuple), not `Void`.

```compact
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] { ... }
circuit internal_helper(): Bytes<32> { ... }
export pure circuit compute(x: Field): Field { ... }
```

- `export` makes the circuit a transaction entry point
- `pure` signals no side effects — the compiler's `identify-pure-circuits` pass checks for ledger access, witness calls, and calls to impure circuits. Primarily affects ZK proving key generation and `pureCircuits` export
- Non-exported circuits are internal helpers

For circuit rules, witness declarations, constructors, and pure circuits, consult `references/circuits-and-witnesses.md`.

## Witnesses

Witnesses provide off-chain data to circuits. Declaration only in Compact — implementation is in TypeScript:

```compact
witness local_secret_key(): Bytes<32>;
witness get_user_data(id: Bytes<32>): Maybe<UserRecord>;
witness store_locally(data: Field): [];
```

Witnesses run locally on the prover's machine. Their values are confidential but untrusted by the contract.

## Key Rules

### Disclosure

Values flowing from witnesses to ledger operations or conditionals require `disclose()`:

```compact
// Conditional on witness value
if (disclose(caller == owner)) { ... }

// Writing witness-derived value to ledger
owner = disclose(get_public_key(local_secret_key()));
```

### Enum Syntax

Use dot notation, not Rust-style double colons:

```compact
state = State.active;       // Correct
state = State::active;      // Wrong - parse error
```

### Type Casting

Use `as` keyword. Some casts require intermediate steps:

```compact
const f: Field = myUint as Field;              // Uint -> Field (safe)
const b: Bytes<32> = (amount as Field) as Bytes<32>;  // Uint -> Bytes (via Field)
const u: Uint<0..1> = flag as Uint<0..1>;      // Boolean -> Uint
```

### Exports for TypeScript

To access types from the TypeScript DApp, export them:

```compact
export enum GameState { waiting, playing }
export struct Config { value: Field }
export { Maybe, Either }   // Re-export stdlib types
```

## Common Mistakes

| Mistake | Correct |
|---------|---------|
| `ledger { field: Type; }` | `export ledger field: Type;` |
| `circuit fn(): Void` | `circuit fn(): []` |
| `pragma >= 0.20.0` | `pragma >= 0.20` |
| `enum State { ... }` (no export) | `export enum State { ... }` |
| `if (witness_val == x)` | `if (disclose(witness_val == x))` |
| `Cell<Field>` | `Field` (Cell implicit, cannot be written) |
| `public_key(sk)` | `persistentHash<...>([pad(...), sk])` |
| `counter.value()` | `counter.read()` |
| `Choice::rock` | `Choice.rock` |
| `pure function helper()` | `pure circuit helper()` |
| `witness fn(): T { body }` | `witness fn(): T;` (no body) |

For comprehensive mistake documentation with explanations, consult `references/common-mistakes.md`.

## Common Patterns

- **Authentication** — Hash-based identity verification using `persistentHash`
- **Commit-Reveal** — Two-phase schemes for hidden-then-revealed values
- **Disclosure in conditionals** — Wrapping witness comparisons in `disclose()`
- **Merkle tree membership** — Privacy-preserving set membership proofs
- **Counter-based rounds** — Breaking user linkability across transactions

For complete pattern implementations with code, consult `references/patterns.md`.

## Reference Files

| Topic | File |
|-------|------|
| All data types, operations, casting rules | `references/data-types.md` |
| Ledger modifiers, ADT operations (Counter, Map, Set, etc.) | `references/ledger-declarations.md` |
| Circuit types, witnesses, constructors, pure circuits | `references/circuits-and-witnesses.md` |
| Common syntax mistakes with explanations | `references/common-mistakes.md` |
| Authentication, commit-reveal, Merkle trees, disclosure | `references/patterns.md` |
