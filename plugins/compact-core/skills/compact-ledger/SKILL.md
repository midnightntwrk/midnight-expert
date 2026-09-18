---
name: compact-core:compact-ledger
description: This skill should be used when the user asks about Compact ledger declarations, ledger modifiers (export, sealed), ledger ADT types (Counter, Map, Set, List, MerkleTree, HistoricMerkleTree), ADT operations and methods, constructor initialization of state, state design choices (Map vs Set vs MerkleTree, Counter vs Uint), nested ADT composition, on-chain privacy and visibility of state operations, disclosure rules for ledger writes including disclose() usage, default<T> for ADT initialization, the Kernel ledger and kernel.self(), or the Midnight token and coin system (ShieldedCoinInfo, QualifiedShieldedCoinInfo, zswap).
version: 0.1.0
---

# Compact Ledger & On-Chain State

> **Last verified:** 2026-09-18 — every documented ledger ADT method (Counter, Map, Set, List, MerkleTree, HistoricMerkleTree) + Kernel operation (self/mint*/balance*/blockTime*/incUnshielded*) and nested-`default<V>` init compile-verified against Compact compiler `0.31.1` / language `0.23` / runtime `0.16.0`.

This skill covers everything about on-chain state in Compact: declaring ledger fields, choosing and using ADT types, initializing state in constructors, designing state for privacy, and understanding what is visible on-chain. It does not cover general language mechanics (types, operators, control flow) -- those belong in `compact-language-ref`. It does not cover overall contract anatomy or circuit/witness design -- those belong in `compact-structure`.

## Ledger Declaration Quick Reference

Each ledger field is declared individually with optional modifiers:

```compact
export ledger publicField: Counter;          // Public, mutable
ledger privateField: Field;                  // Internal, mutable
export sealed ledger immutable: Bytes<32>;   // Public, set once in constructor
sealed ledger secret: Field;                 // Internal, set once in constructor
```

| Modifier | Effect |
|----------|--------|
| `export` | Readable from TypeScript DApp code |
| `sealed` | Can only be set during constructor (directly or via helper circuits called by constructor) |
| `export sealed` | Both: publicly readable and immutable after deployment |

Valid ledger types: any Compact type (`Field`, `Boolean`, `Bytes<N>`, `Uint<N>`, enums, structs), `Counter`, `Map<K, V>`, `Set<T>`, `List<T>`, `MerkleTree<N, T>`, `HistoricMerkleTree<N, T>`, and nested ADTs like `Map<K, Map<K2, V>>`. **Note:** Nested ADTs are only permitted as `Map` values — e.g., `Map<K, Set<T>>` or `Map<K, List<T>>` are valid, but `Set<Map<K,V>>`, `List<Map<K,V>>`, etc. are invalid.

For exhaustive syntax rules and modifier details, see `references/types-and-operations.md`.

## ADT Types Overview

| Type | Purpose | Key Operations | Privacy |
|------|---------|---------------|---------|
| `Counter` | Numeric counter | `increment`, `decrement`, `read`, `lessThan` | All ops visible |
| `Map<K, V>` | Key-value store | `insert`, `lookup`, `member`, `remove` | All ops visible |
| `Set<T>` | Unique elements | `insert`, `member`, `remove` | All ops visible |
| `List<T>` | Ordered sequence | `pushFront`, `popFront`, `head` | All ops visible |
| `MerkleTree<N, T>` | Privacy-preserving set | `insert`, `checkRoot` | **Insert hides leaf** (via `leaf_hash()`); **privacy via membership proofs** |
| `HistoricMerkleTree<N, T>` | MerkleTree with root history | Same + `resetHistory` | **Insert hides leaf** (via `leaf_hash()`); **privacy via membership proofs** |

For complete operations tables with parameters, return types, and edge cases, see `references/types-and-operations.md`.

## State Design Decision Tree

| Need | Recommended Type | Why |
|------|-----------------|-----|
| Track a count (supply, rounds) | `Counter` | Built-in increment/decrement with `Uint<16>` steps |
| Store key-value pairs | `Map<K, V>` | Direct lookup by key |
| Track membership (allowlists) | `Set<T>` | Membership checks, but reveals which element |
| Private membership proofs | `MerkleTree<N, T>` | Hides which element's membership is proven |
| Ordered log / queue | `List<T>` | Front-insertion and front-removal |
| Private membership + late proofs | `HistoricMerkleTree<N, T>` | Accepts proofs against past roots |
| Single immutable value | `sealed ledger x: T` | Constructor-only assignment |
| Store a numeric value directly | `ledger x: Uint<64>` | Direct assignment, no ADT needed |

For the complete decision matrix with trade-offs, nested ADT strategies, and worked examples, see `references/state-design.md`.

## Constructor Initialization

The constructor runs once at deployment. Use it to initialize sealed fields and set initial state:

```compact
export sealed ledger owner: Bytes<32>;
export ledger phase: Phase;
export ledger count: Counter;

witness local_secret_key(): Bytes<32>;

constructor() {
  owner = disclose(persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:pk:"), local_secret_key()]));
  phase = Phase.registration;
  // count starts at 0 by default — no initialization needed
}
```

Key rules:
- At most one constructor per contract
- `sealed` fields can only be set in the constructor or helper circuits called by the constructor
- It is a static error if a sealed field is settable from an exported circuit
- ADT fields use their methods (e.g., `count.increment(n)`), not direct assignment
- Witness calls are allowed in constructors

For constructor patterns, pitfalls, and multi-field initialization strategies, see `references/state-design.md`.

## On-Chain Visibility Summary

All ledger operations are publicly visible on-chain, **except** `MerkleTree.insert()` which hides the leaf value -- the compiler applies `leaf_hash()` (a `persistent_hash`) before storing, so only the hash appears in the transaction transcript. This is the only ledger operation that hides its data argument.
The additional privacy benefit of MerkleTree is in **membership proofs** -- ZK path proofs do not reveal which specific leaf is being proven.

| Operation Type | Visible On-Chain |
|---------------|-----------------|
| Direct field read/write | Yes -- value visible |
| Counter increment/decrement | Yes -- amount visible |
| Map insert/lookup/member/remove | Yes -- key and value visible |
| Set insert/member/remove | Yes -- element visible |
| List pushFront/popFront | Yes -- element visible |
| MerkleTree insert | **No** -- the compiler applies `leaf_hash()` (a `persistent_hash`) before storing; only the hash is in the transaction transcript. This is the only ledger operation that hides its data argument. |
| MerkleTree checkRoot | Yes -- digest visible |

For detailed per-operation visibility analysis, MerkleTree vs Set privacy comparison, disclosure rules, and privacy design patterns, see `references/privacy-and-visibility.md`.

## Kernel Ledger

The `Kernel` type provides access to contract metadata and token operations:

The `kernel` field is predefined by `import CompactStandardLibrary;` — do not declare it manually. Use it directly:

```compact
export circuit getSelf(): ContractAddress {
  return kernel.self();
}
```

| Method | Returns | Purpose |
|--------|---------|---------|
| `self()` | `ContractAddress` | Get the contract's own address |
| `checkpoint()` | `[]` | Create a transaction checkpoint |
| `mintShielded(domainSep, amount)` | `[]` | Mint shielded tokens |
| `mintUnshielded(domainSep, amount)` | `[]` | Mint unshielded tokens |

For the full Kernel API including zswap claim operations, see `references/types-and-operations.md`.

## Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `ledger { field: Type; }` | `export ledger field: Type;` | Block syntax was removed in Compact 0.10.1 — causes a parse error |
| `counter.value()` | `counter.read()` | `.value()` does not exist |
| `map.lookup(key)` without member check | Check `map.member(key)` first | `lookup` on missing key throws a runtime error (ExpectedCell) |
| `sealed ledger export x: T` | `export sealed ledger x: T` | `export` must come before `sealed` |
| Direct assignment to ADT | Use ADT methods | `count = 5` is wrong; use `count.increment(5)` |
| `MerkleTree<1, T>` | `MerkleTree<2, T>` minimum | Depth must be > 1 and <= 32 |
| Forgetting `disclose()` on ledger write | `field = disclose(value)` | Witness-derived values need disclosure |

## Reference Routing

| Topic | Reference File |
|-------|---------------|
| Complete ADT operations tables, parameters, return types, edge cases, nested composition, Kernel API | `references/types-and-operations.md` |
| Choosing the right type, decision matrix, constructor patterns, nested ADT strategies, state machines, token system | `references/state-design.md` |
| Per-operation visibility, MerkleTree vs Set privacy, disclosure rules for state, designing for privacy, token privacy | `references/privacy-and-visibility.md` |
