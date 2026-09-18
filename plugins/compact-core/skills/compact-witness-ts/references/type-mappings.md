# Compact to TypeScript Type Mappings

> **Last verified:** 2026-09-18 — generated `index.d.ts` shapes verified by compiling against Compact compiler `0.31.1` / language `0.23` / runtime `0.16.0`: `Config` struct, generic `S<T>` (numeric `#n` dropped), and `Maybe<T>` match exactly; the enum mapping was corrected to the actual TS `enum` output.

Complete reference for how Compact types map to TypeScript representations. All type translations are handled by the compiler-generated code and the `@midnight-ntwrk/compact-runtime` package.

## Primitive Types

| Compact Type | TypeScript Type | Runtime Validation | Example |
|---|---|---|---|
| `Field` | `bigint` | Must be `>= 0` and `< MAX_FIELD` | `42n` |
| `Boolean` | `boolean` | Must be `true` or `false` | `true` |
| `Uint<N>` | `bigint` | Must be `>= 0` and `< 2^N` | `255n` for `Uint<8>` |
| `Uint<0..N>` | `bigint` | Must be `>= 0` and `<= N` | `5n` for `Uint<0..10>` |
| `Bytes<N>` | `Uint8Array` | Must have exactly `N` bytes | `new Uint8Array(32)` |

### Runtime Bounds Checking

Compact types have size and range limits that TypeScript's type system cannot express. The runtime enforces these:

```typescript
// TypeScript sees: bigint
// Runtime checks: 0 <= value < 2^64
const amount: bigint = 1000n;  // OK
const tooLarge: bigint = 2n ** 64n;  // Runtime error when passed to circuit
```

This is necessary because:
- `Field` values are limited by the ZK field's maximum value
- `Uint` values are bounded by their declared bit-width
- `Bytes` values must match their declared length exactly
- TypeScript compile-time checks are easily bypassed

## Opaque Types

Opaque types pass through without transformation:

| Compact Type | TypeScript Type | Use Case |
|---|---|---|
| `Opaque<"string">` | `string` | Human-readable text |
| `Opaque<"Uint8Array">` | `Uint8Array` | Raw binary data |

## Collection Types

| Compact Type | TypeScript Type | Notes |
|---|---|---|
| `Vector<N, T>` | `T[]` | Array with runtime length check (exactly `N` elements) |
| `[T1, T2, T3]` (tuple) | `[T1, T2, T3]` or `T[]` | Tuple or array with runtime length check |
| `Maybe<T>` | `{ is_some: boolean; value: T }` | Must `export { Maybe }` in Compact to use the type annotation in TypeScript |
| `Either<L, R>` | Tagged union object | See below |
| `List<T>` | `T[]` | Variable-length (ledger only) |

### Maybe Representation

```typescript
// Compact: Maybe<Uint<64>>
// TypeScript:
type Maybe<T> = { is_some: boolean; value: T };

// Usage in witnesses:
const found: Maybe<bigint> = { is_some: true, value: 42n };
const notFound: Maybe<bigint> = { is_some: false, value: 0n };
```

To use `Maybe<T>` as a TypeScript type annotation, export it from your Compact contract:

```compact
export { Maybe };
```

### Either Representation

```typescript
// Compact: Either<Uint<64>, Bytes<32>>
// TypeScript:
type Either<L, R> = { is_left: boolean; left: L; right: R };
// Usage:
if (result.is_left) {
  const value = result.left;
} else {
  const error = result.right;
}
```

## User-Defined Types

### Enums

Compact enums become a TypeScript `enum` (each variant assigned its numeric index):

```compact
// Compact
export enum GameState { waiting, playing, finished }
```

```typescript
// TypeScript (compiler-generated)
export enum GameState { waiting = 0, playing = 1, finished = 2 }
// Runtime checks: value must be a valid index (0, 1, or 2)
```

### Structs

Compact structs become plain objects:

```compact
// Compact
export struct Config { threshold: Uint<64>, admin: Bytes<32> }
```

```typescript
// TypeScript (compiler-generated)
export type Config = { threshold: bigint; admin: Uint8Array };
```

### Generic Type Export Rules

When Compact exports a generic type, numeric parameters (`#n`) are dropped in TypeScript:

```compact
// Compact
export struct S<#n, T> { v: Vector<n, T>; curidx: Uint<0..n> }
```

```typescript
// TypeScript (compiler-generated) — #n parameter is dropped
export type S<T> = { v: T[]; curidx: bigint };
```

## Ledger ADT Representations

When reading ledger state through the `ledger()` function, ADTs are represented as:

| Compact Ledger Type | TypeScript via `ledger()` | Notes |
|---|---|---|
| `Counter` | `bigint` | Current counter value |
| `Map<K, V>` | Read-only accessor | Access via ledger object |
| `Set<T>` | Read-only accessor | Access via ledger object |
| `MerkleTree<N, T>` | Root hash accessible | Tree data is not fully exposed |
| Direct fields (`Field`, `Bytes<N>`, etc.) | Corresponding TS type | Direct property access |

```typescript
// Reading ledger state
const state = MyContract.ledger(contractState.data);
const roundValue: bigint = state.round;           // Counter -> bigint
const ownerKey: Uint8Array = state.owner;          // Bytes<32> -> Uint8Array
const currentState: number = state.gameState;      // enum -> number
```

## Witness-Specific Type Patterns

### MerkleTreePath for Witness Providers

When a Compact witness returns a `MerkleTreePath<N, T>`, the TypeScript representation is a structured object containing the sibling hashes and direction indicators needed for the ZK proof:

```compact
// Compact declaration
witness get_merkle_path(leaf: Bytes<32>): MerkleTreePath<10, Bytes<32>>;
```

```typescript
// TypeScript witness implementation provides the path data
get_merkle_path: (
  { privateState }: WitnessContext<Ledger, MyState>,
  leaf: Uint8Array,
): [MyState, MerkleTreePath] => {
  const path = computeMerklePath(privateState.tree, leaf);
  return [privateState, path];
},
```

### Side-Effect Witnesses Returning Empty Tuple

Compact witnesses that return `[]` (side-effect only) map to an empty array in TypeScript:

```compact
// Compact
witness store_locally(data: Field): [];
```

```typescript
// TypeScript
store_locally: (
  { privateState }: WitnessContext<Ledger, MyState>,
  data: bigint,
): [MyState, []] => {
  return [{ ...privateState, storedData: data }, []];
},
```

## CompactType\<T\> Interface

The `@midnight-ntwrk/compact-runtime` package provides runtime types satisfying the `CompactType<T>` interface for values that need explicit size/length tracking:

```typescript
interface CompactType<T> {
  toValue(value: T): Value;      // TypeScript -> field-aligned binary
  fromValue(value: Value): T;    // field-aligned binary -> TypeScript
}
```

This representation is not user-facing most of the time. It is used internally by the runtime for serialization of public state. You typically interact with the friendly TypeScript types (`bigint`, `Uint8Array`, etc.) in your witness implementations and circuit calls.
