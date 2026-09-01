# Cryptographic Functions

## Elliptic Curve Functions

These functions operate on the proof system's embedded elliptic curve (Jubjub). All inputs and outputs use the `JubjubPoint` type, which represents a point on the curve. Elliptic curve operations are the foundation for Pedersen commitments, public key derivation, and value blinding in the Zswap protocol.

### ecAdd

```compact
circuit ecAdd(a: JubjubPoint, b: JubjubPoint): JubjubPoint;
```

Adds two elliptic curve points (described in multiplicative notation in the official docs). Used for combining Pedersen commitment components and aggregating public keys.

```compact
// Combine blinding and value components into a Pedersen commitment
const blindingCommit = ecMulGenerator(randomness);
const valueCommit = ecMul(hashToCurve<Bytes<32>>(color), value as Field);
const pedersenCommit = ecAdd(blindingCommit, valueCommit);
```

### ecMul

```compact
circuit ecMul(a: JubjubPoint, b: Field): JubjubPoint;
```

Multiplies an elliptic curve point by a scalar. The point is the first argument, the scalar (`Field`) is the second. Used for scaling independent generators in Pedersen commitments and key derivation.

```compact
// Scale a color-derived base point by a coin value
const colorBase = hashToCurve<[Bytes<32>, Uint<16>]>([coin.color, segment]);
const valueCommit = ecMul(colorBase, coin.value);
```

### ecMulGenerator

```compact
circuit ecMulGenerator(b: Field): JubjubPoint;
```

Multiplies the primary group generator of the embedded curve by a scalar. Equivalent to `ecMul(G, b)` where `G` is the generator, but more efficient because the generator is a known constant. Used for blinding factors and public key generation.

```compact
// Create a blinding component for a Pedersen commitment
const blinding = ecMulGenerator(randomness);
```

### hashToCurve

```compact
circuit hashToCurve<T>(value: T): JubjubPoint;
```

Maps an arbitrary Compact value to a curve point. Outputs are guaranteed to have unknown discrete logarithm with respect to the group generator and any other `hashToCurve` output. This property is essential for Pedersen commitments because it ensures the value generator is independent of the blinding generator. Inputs of different types `T` may produce the same output if they share the same field-aligned binary representation.

```compact
// Derive an independent generator for a specific token color
const colorBase = hashToCurve<Bytes<32>>(color);

// Derive a generator from a composite key
const compositeBase = hashToCurve<[Bytes<32>, Uint<16>]>([color, segment]);
```

### JubjubPoint Accessors

```compact
circuit jubjubPointX(p: JubjubPoint): Field;
circuit jubjubPointY(p: JubjubPoint): Field;
circuit constructJubjubPoint(x: Field, y: Field): JubjubPoint;
```

These functions extract or construct `JubjubPoint` coordinates. `JubjubPoint` is an opaque type — direct field access (`.x`, `.y`) does not work. You must use `jubjubPointX(p)` and `jubjubPointY(p)` to read coordinates.

`constructJubjubPoint` builds a `JubjubPoint` from raw coordinates. Use with caution: the function does not validate that the point lies on the curve. Passing invalid coordinates can produce undefined circuit behavior.

Note: these functions are present in the compiler and confirmed working in test examples, but are not listed in the official `CompactStandardLibrary` exports documentation page. They are part of the standard library import.

```compact
// Extract coordinates from a point
const x = jubjubPointX(point);
const y = jubjubPointY(point);

// Construct a point from known coordinates (no on-curve check)
const point = constructJubjubPoint(xCoord, yCoord);
```

## Practical Pattern: Pedersen Commitments

A Pedersen commitment `C = g^r * h^v` hides a value `v` behind a random blinding factor `r`, using two independent generators `g` (the group generator) and `h` (derived via `hashToCurve`). The commitment is computationally binding and perfectly hiding.

```compact
witness get_randomness(): Field;

circuit pedersenCommit(color: Bytes<32>, value: Field): JubjubPoint {
  const r = get_randomness();
  const blinding = ecMulGenerator(r);
  const colorBase = hashToCurve<Bytes<32>>(color);
  const valueCommit = ecMul(colorBase, value);
  return ecAdd(blinding, valueCommit);
}
```

This is the pattern used by the Zswap protocol (`zswap.compact`) for shielded coin value commitments:

```compact
// From zswap.compact (simplified)
const colorBase = hashToCurve<[Bytes<32>, Uint<16>]>([coin.color, segment]);
const pedersenBlinding = ecMulGenerator(rc);
const pedersenCommit = ecMul(colorBase, coin.value);
valueCom = disclose(ecAdd(pedersenBlinding, pedersenCommit));
```

## Merkle Tree Path Functions

These functions verify Merkle tree membership by recomputing the root hash from a leaf and its authentication path, then comparing the result with an on-chain root via `checkRoot()`. Paths are constructed off-chain in TypeScript and passed into circuits through witness functions.

### merkleTreePathRoot

```compact
circuit merkleTreePathRoot<#n, T>(path: MerkleTreePath<n, T>): MerkleTreeDigest;
```

Computes the Merkle root from a complete path struct that includes the leaf value and sibling hashes. `n` is the tree depth (a compile-time numeric parameter, prefixed with `#`). `T` is the leaf type. The path is a `MerkleTreePath<n, T>` struct containing:

```compact
struct MerkleTreePath<#n, T> {
  leaf: T;
  path: Vector<n, MerkleTreePathEntry>;
}

struct MerkleTreePathEntry {
  sibling: MerkleTreeDigest;
  goes_left: Boolean; // true when the current node is the left child at this level
}
```

Returns a `MerkleTreeDigest` that can be compared against a ledger tree's root via `tree.checkRoot(digest)`.

```compact
witness get_proof(leafValue: Field): MerkleTreePath<4, Field>;

export circuit verifyMembership(leafValue: Field): [] {
  const path = get_proof(leafValue);
  const digest = merkleTreePathRoot<4, Field>(path);
  assert(merkleTree.checkRoot(disclose(digest)), "Not a member");
}
```

### merkleTreePathRootNoLeafHash

```compact
circuit merkleTreePathRootNoLeafHash<#n>(path: MerkleTreePath<n, Bytes<32>>): MerkleTreeDigest;
```

Same as `merkleTreePathRoot` but assumes the leaf has already been hashed externally. The leaf in the path must be `Bytes<32>` (a pre-computed hash). Use this variant when the tree was populated with `insertHash` or when the leaf hash was computed separately. This function takes only one generic parameter (`#n` for depth) because the leaf type is fixed to `Bytes<32>`.

```compact
// From dust.compact -- verify a commitment exists in the tree
commitment_merkle_tree.checkRoot(
  disclose(merkleTreePathRootNoLeafHash<32>(commitment_path))
);
```

A more complete example:

```compact
ledger commitments: MerkleTree<32, Bytes<32>>;

witness get_commitment_path(): MerkleTreePath<32, Bytes<32>>;

export circuit spendCoin(): [] {
  const path = get_commitment_path();
  const digest = merkleTreePathRootNoLeafHash<32>(path);
  assert(commitments.checkRoot(disclose(digest)), "Commitment not found");
}
```

### Off-Chain Path Generation (TypeScript)

Merkle tree paths are constructed off-chain using the compiled contract's ledger state. Two methods are available on the TypeScript `MerkleTree` / `HistoricMerkleTree` objects:

```typescript
// Find path by leaf value (O(n) scan -- avoid for large trees)
findPathForLeaf(leaf: value_type): MerkleTreePath<value_type> | undefined

// Construct path for a known index (O(log n))
pathForLeaf(index: bigint, leaf: value_type): MerkleTreePath<value_type>
```

`findPathForLeaf` searches the tree for a matching leaf and returns `undefined` if not found. `pathForLeaf` requires a known index and the leaf value; it throws if the index is out of bounds. Both return `MerkleTreePath` objects that can be passed directly to Compact witness functions.

## Hashing and Commitment Summary

For full documentation on hashing and commitment functions, including disclosure rules, domain separation patterns, and worked code examples, see `compact-language-ref/references/stdlib-functions.md`. The table below is a quick-reference overview.

| Function | Signature | Domain | Store in Ledger? |
|----------|-----------|--------|-----------------|
| `persistentHash<T>` | `(value: T): Bytes<32>` | Persistent (SHA-256) | Yes |
| `transientHash<T>` | `(value: T): Field` | Transient (circuit-efficient) | No |
| `persistentCommit<T>` | `(value: T, rand: Bytes<32>): Bytes<32>` | Persistent (SHA-256) | Yes |
| `transientCommit<T>` | `(value: T, rand: Field): Field` | Transient (circuit-efficient) | No |
| `degradeToTransient` | `(x: Bytes<32>): Field` | Conversion | -- |
| `upgradeFromTransient` | `(x: Field): Bytes<32>` | Conversion | -- |

Key distinctions:

- **Persistent** functions use SHA-256 and produce stable outputs across compiler upgrades. Use them for anything stored in ledger state.
- **Transient** functions are circuit-optimised but their algorithm may change between upgrades. Use them for in-circuit consistency checks only.
- **Hash** functions (`persistentHash`, `transientHash`) are not considered sufficient to hide witness values from disclosure. A `disclose()` wrapper is required when the result reaches the public ledger.
- **Commit** functions (`persistentCommit`, `transientCommit`) are sufficient to protect their input, provided the `rand` argument has enough entropy. No `disclose()` wrapper is needed for the committed output.
- **Conversion** functions bridge between persistent (`Bytes<32>`) and transient (`Field`) domains when you need to mix hash types in a single computation.
