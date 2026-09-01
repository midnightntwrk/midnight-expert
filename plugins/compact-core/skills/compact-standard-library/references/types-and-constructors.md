# Stdlib Types and Constructor Functions

Complete reference for all types and their constructor functions provided by `import CompactStandardLibrary;`. Every definition below is verified against the official Compact API documentation and MCP codebase.

> **Note on naming convention:** The official docs show camelCase names (e.g., `isSome`, `isLeft`); the current compiler uses snake_case (`is_some`, `is_left`). A migration to camelCase is planned but not yet deployed. This reference uses the snake_case names that the compiler currently expects.

## Types Overview

| Type | Kind | Purpose |
|------|------|---------|
| `Maybe<T>` | Generic struct | Optional value (present or absent) |
| `Either<A, B>` | Generic struct | Disjoint union (one of two variants) |
| `JubjubPoint` | Struct | Elliptic curve point on the embedded curve |
| `MerkleTreeDigest` | Struct | Merkle tree root hash wrapper |
| `MerkleTreePathEntry` | Struct | Single step in a Merkle proof path |
| `MerkleTreePath<#n, T>` | Generic struct | Complete Merkle inclusion proof |
| `ContractAddress` | Struct | On-chain contract address |
| `ZswapCoinPublicKey` | Struct | User public key for shielded coin outputs |
| `UserAddress` | Struct | User wallet address for unshielded tokens |

## Maybe\<T\>

Encapsulates an optionally present value. If `is_some` is `false`, `value` should be `default<T>` by convention.

### Definition

```compact
struct Maybe<T> {
  is_some: Boolean;
  value: T;
}
```

### Construction

| Constructor | Signature | Description |
|-------------|-----------|-------------|
| `some<T>(value)` | `circuit some<T>(value: T): Maybe<T>;` | Creates a Maybe containing the given value |
| `none<T>()` | `circuit none<T>(): Maybe<T>;` | Creates an empty Maybe |
| `default<Maybe<T>>` | -- | Equivalent to `none<T>()` |

Type parameters are required. `some(42)` is wrong; `some<Field>(42)` is correct.

### Field Access

| Field | Type | Meaning |
|-------|------|---------|
| `.is_some` | `Boolean` | `true` if a value is present |
| `.value` | `T` | The contained value (meaningful only when `is_some` is `true`) |

### Inspection Pattern

```compact
// List.head() returns Maybe<T>
const first = myList.head();
if (first.is_some) {
  const item = first.value;
}
```

### Common Uses

- Return type of `List.head()` -- returns `Maybe<T>`
- Optional witness data from TypeScript
- The `change` field of `ShieldedSendResult` is `Maybe<ShieldedCoinInfo>`
- Note: `Map.lookup()` returns `V` directly (not `Maybe<V>`), but throws a runtime error (ExpectedCell) if the key is missing. Always check `Map.member()` before calling `Map.lookup()`.

### TypeScript Representation

```typescript
{ is_some: boolean, value: T }
```

Where `T` maps to the corresponding TypeScript type for the inner Compact type.

## Either\<A, B\>

Disjoint union of `A` and `B`. If `is_left` is `true`, `left` should be populated; otherwise `right`. The unpopulated variant should be `default<>` by convention.

### Definition

```compact
struct Either<A, B> {
  is_left: Boolean;
  left: A;
  right: B;
}
```

### Construction

| Constructor | Signature | Description |
|-------------|-----------|-------------|
| `left<A, B>(value)` | `circuit left<A, B>(value: A): Either<A, B>;` | Creates an Either with the left variant |
| `right<A, B>(value)` | `circuit right<A, B>(value: B): Either<A, B>;` | Creates an Either with the right variant |
| `default<Either<A, B>>` | -- | Default has `is_left = false` (right variant) based on struct defaults |

Both type parameters are required. `left(42)` is wrong; `left<Field, Boolean>(42)` is correct.

### Field Access

| Field | Type | Meaning |
|-------|------|---------|
| `.is_left` | `Boolean` | `true` if the left variant is populated |
| `.left` | `A` | The left variant value |
| `.right` | `B` | The right variant value |

### Common Uses

Either is the standard type for representing token recipients in the Compact ecosystem:

| Pattern | Type | Use Case |
|---------|------|----------|
| Shielded recipient | `Either<ZswapCoinPublicKey, ContractAddress>` | Left = user, Right = contract |
| Unshielded recipient | `Either<ContractAddress, UserAddress>` | Left = contract, Right = user |

### Code Example

```compact
// Shielded: send to a user
const toUser = left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey());

// Shielded: send to a contract
const toContract = right<ZswapCoinPublicKey, ContractAddress>(kernel.self());

// Unshielded: send to a user address
const toUserAddr = right<ContractAddress, UserAddress>(disclose(recipientAddr));

// Inspect which variant
if (recipient.is_left) {
  // recipient.left is the ZswapCoinPublicKey
} else {
  // recipient.right is the ContractAddress
}
```

### TypeScript Representation

```typescript
{ is_left: boolean, left: A, right: B }
```

## JubjubPoint

A point on the proof system's embedded elliptic curve (Jubjub), in affine coordinates. Only outputs of elliptic curve operations (`ecAdd`, `ecMul`, `ecMulGenerator`, `hashToCurve`) are guaranteed to actually lie on the curve.

### Definition

`JubjubPoint` is an opaque type — its internal representation is not directly accessible. Direct field access (`.x`, `.y`) does not work. You must use the accessor functions below to read coordinates.

### Accessor Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `jubjubPointX(p)` | `circuit jubjubPointX(p: JubjubPoint): Field;` | Get the X coordinate |
| `jubjubPointY(p)` | `circuit jubjubPointY(p: JubjubPoint): Field;` | Get the Y coordinate |

### Constructor

```compact
circuit constructJubjubPoint(x: Field, y: Field): JubjubPoint;
```

Note: This creates a `JubjubPoint` from raw field values. The resulting point is not checked to lie on the curve.

### Default Value

`default<JubjubPoint>` is `{ x: 0, y: 0 }` (Compact struct default — not the curve identity element; do not use as a curve point).

### Migration Note

This type was previously named `CurvePoint` (oldest) and then `NativePoint`. Both old names are deprecated. Use `JubjubPoint` in all new code. The elliptic curve functions (`ecAdd`, `ecMul`, `ecMulGenerator`, `hashToCurve`) now take and return `JubjubPoint`. The accessor functions were correspondingly renamed from `nativePointX`/`nativePointY`/`constructNativePoint` to `jubjubPointX`/`jubjubPointY`/`constructJubjubPoint`.

### Code Example

```compact
const g = ecMulGenerator(1);                          // generator point
const pk = ecMul(g, secretKey);                        // public key derivation
const combined = ecAdd(pk, hashToCurve<Bytes<32>>(data));
const x = jubjubPointX(combined);                      // get X coordinate
const y = jubjubPointY(combined);                      // get Y coordinate
const manual = constructJubjubPoint(x, y);             // reconstruct from coordinates
```

### TypeScript Representation

```typescript
{ x: bigint, y: bigint }
```

## MerkleTreeDigest

Wrapper around a `Field` representing a Merkle tree root hash.

### Definition

```compact
struct MerkleTreeDigest { field: Field; }
```

### Usage

- Return type of `merkleTreePathRoot<#n, T>(path)` and `merkleTreePathRootNoLeafHash<#n>(path)`
- Parameter type of `MerkleTree.checkRoot(rt)` and `HistoricMerkleTree.checkRoot(rt)`
- Default value: `default<MerkleTreeDigest>` is `{ field: 0 }`

### Code Example

```compact
const digest = merkleTreePathRoot<4, Field>(path);
assert(merkleTree.checkRoot(disclose(digest)) == true, "invalid root");
```

## MerkleTreePathEntry

One step in a Merkle proof path: the sibling hash and a direction flag.

### Definition

```compact
struct MerkleTreePathEntry {
  sibling: MerkleTreeDigest;
  goes_left: Boolean;
}
```

### Fields

| Field | Type | Meaning |
|-------|------|---------|
| `.sibling` | `MerkleTreeDigest` | Hash of the sibling node at this level |
| `.goes_left` | `Boolean` | `true` when the current node is the left child at this level (the sibling occupies the right slot) |

Primarily used as the element type inside `MerkleTreePath`.

## MerkleTreePath\<#n, T\>

A complete Merkle inclusion proof: the leaf value plus the sibling path from leaf to root.

### Definition

```compact
struct MerkleTreePath<#n, T> {
  leaf: T;
  path: Vector<n, MerkleTreePathEntry>;
}
```

### Type Parameters

| Parameter | Meaning |
|-----------|---------|
| `#n` | Tree depth (must match the `MerkleTree` or `HistoricMerkleTree` depth) |
| `T` | Leaf value type |

### Construction

Merkle paths are constructed off-chain in TypeScript using the compiler output's `findPathForLeaf` and `pathForLeaf` functions, then passed into circuits via witness functions.

### Verification

Pass to `merkleTreePathRoot<#n, T>(path)` to recompute the root hash, then check against the on-chain tree:

```compact
witness getMerklePath(): MerkleTreePath<32, Bytes<32>>;

export circuit verifyInclusion(): [] {
  const path = getMerklePath();
  const digest = merkleTreePathRoot<32, Bytes<32>>(path);
  assert(tree.checkRoot(disclose(digest)) == true, "not in tree");
}
```

For trees where leaves have already been hashed externally, use `merkleTreePathRootNoLeafHash<#n>(path)` instead. In that case `T` must be `Bytes<32>`:

```compact
circuit merkleTreePathRootNoLeafHash<#n>(path: MerkleTreePath<n, Bytes<32>>): MerkleTreeDigest;
```

## Address Types

Three struct types represent different kinds of addresses in the Compact ecosystem. All three wrap a `Bytes<32>` value.

### ContractAddress

The address of a deployed contract.

```compact
struct ContractAddress { bytes: Bytes<32>; }
```

| Obtained via | Context |
|--------------|---------|
| `kernel.self()` | Returns the current contract's own address |

Used as a recipient in `sendShielded`, `sendImmediateShielded`, `createZswapOutput`, `mintShieldedToken`, `mintUnshieldedToken`, and `sendUnshielded`.

### ZswapCoinPublicKey

The public key used to output shielded coins to a user.

```compact
struct ZswapCoinPublicKey { bytes: Bytes<32>; }
```

| Obtained via | Context |
|--------------|---------|
| `ownPublicKey()` | Returns the Zswap coin public key the prover supplies for this transaction |

Used as a recipient in `sendShielded`, `sendImmediateShielded`, and `createZswapOutput`.

> **Security:** `ownPublicKey()` is *prover-supplied* (passed into the circuit context as `coinPublicKey`), **not** bound to the wallet that signs the transaction. Use it only to route shielded tokens *to* the caller — never for authorization (`assert(ownPublicKey() == admin)`) or identity gating, which a caller can trivially bypass by supplying any value. Derive caller identity from a witness secret instead. See `compact-tokens/references/token-operations.md` and `compact-patterns/references/access-control-patterns.md`.

### UserAddress

A user wallet address for unshielded token operations.

```compact
struct UserAddress { bytes: Bytes<32>; }
```

Used as a recipient in `sendUnshielded` and `mintUnshieldedToken`. The `UserAddress` is typically provided as a circuit parameter (passed in by the caller) rather than derived on-chain.

### Address Type Usage Patterns

```compact
// Shielded: user receives
const userRecipient = left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey());

// Shielded: contract receives
const contractRecipient = right<ZswapCoinPublicKey, ContractAddress>(kernel.self());

// Unshielded: contract receives
const contractDest = left<ContractAddress, UserAddress>(kernel.self());

// Unshielded: user receives
const userDest = right<ContractAddress, UserAddress>(disclose(userAddr));
```

## Constructor Functions

Summary of all stdlib constructor circuits for `Maybe` and `Either`.

### some\<T\>

```compact
circuit some<T>(value: T): Maybe<T>;
```

Creates a `Maybe<T>` with `is_some = true` and `.value` set to the given value.

### none\<T\>

```compact
circuit none<T>(): Maybe<T>;
```

Creates a `Maybe<T>` with `is_some = false` and `.value` set to `default<T>`.

### left\<A, B\>

```compact
circuit left<A, B>(value: A): Either<A, B>;
```

Creates an `Either<A, B>` with `is_left = true`, `.left` set to the given value, and `.right` set to `default<B>`.

### right\<A, B\>

```compact
circuit right<A, B>(value: B): Either<A, B>;
```

Creates an `Either<A, B>` with `is_left = false`, `.right` set to the given value, and `.left` set to `default<A>`.

### Type Parameter Rules

Type parameters are always required for constructor functions. The compiler cannot infer them.

```compact
// Correct
const opt = some<Field>(42);
const empty = none<Uint<64>>();
const l = left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey());
const r = right<Field, Boolean>(true);

// Wrong -- missing type parameters
const opt = some(42);         // compile error
const empty = none();         // compile error
const l = left(ownPublicKey()); // compile error
```

### Patterns

Checking variants:

```compact
// List.head() returns Maybe<T>
const first: Maybe<Field> = myList.head();
if (first.is_some) {
  // use first.value
}

const addr: Either<ZswapCoinPublicKey, ContractAddress> = getRecipient();
if (addr.is_left) {
  // use addr.left (ZswapCoinPublicKey)
} else {
  // use addr.right (ContractAddress)
}
```

Using with List.head (returns Maybe<T>):

```compact
// List.head() returns Maybe<T>
const first = myList.head();             // returns Maybe<T>
if (first.is_some) {
  const item = first.value;
}
```

Note on Map.lookup vs List.head:

```compact
// Map.lookup(key) returns V directly (NOT Maybe<V>).
// It throws a runtime error (ExpectedCell) if the key is not found.
// Always check Map.member(key) before calling Map.lookup(key).
const val = myMap.lookup(key);           // returns V (throws if key missing)
const exists = myMap.member(key);        // returns Boolean

// Nested maps chain directly:
const balance = balances.lookup(tokenId).lookup(userId);
```

## Re-Exporting Stdlib Types

When your contract uses stdlib types as circuit parameters or return types, those types must be re-exported to make them available in the generated TypeScript interface code.

```compact
export { Maybe, Either, ShieldedCoinInfo, QualifiedShieldedCoinInfo };
```

This is required because the TypeScript code generated by the compiler needs type definitions for all types that appear in exported circuit signatures. Without the re-export, the generated TypeScript code will reference types it cannot resolve.

Common re-exports for token contracts:

```compact
export { Maybe, Either, ZswapCoinPublicKey, ContractAddress, ShieldedCoinInfo, QualifiedShieldedCoinInfo };
```

Only re-export types that actually appear in your exported circuit signatures. There is no need to re-export types used only internally.
