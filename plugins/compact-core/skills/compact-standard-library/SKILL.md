---
name: compact-core:compact-standard-library
description: This skill should be used when the user asks about the Compact standard library (CompactStandardLibrary), stdlib types (Maybe, Either, JubjubPoint, MerkleTreeDigest, MerkleTreePath, ContractAddress, ZswapCoinPublicKey, UserAddress), deprecated stdlib names (CurvePoint, NativePoint, CoinInfo), stdlib constructor functions (some, none, left, right), elliptic curve functions (ecAdd, ecMul, ecMulGenerator, hashToCurve, jubjubPointX, jubjubPointY, constructJubjubPoint), Merkle tree path verification (merkleTreePathRoot, merkleTreePathRootNoLeafHash), or when the user needs to verify which functions exist in the standard library or prevent hallucination of non-existent stdlib functions.
version: 0.1.0
---

# Compact Standard Library Reference

This is the single authoritative index of everything `import CompactStandardLibrary;` provides. Every type, constructor, circuit, and builtin documented here has been verified against the Compact compiler. For contract anatomy and scaffold patterns, see `compact-structure`. For language mechanics (types, operators, control flow), see `compact-language-ref`. For ledger ADT state design and privacy, see `compact-ledger`. For token mint/send/receive operations and patterns, see `compact-tokens`. This skill follows a verification-first philosophy: when in doubt, verify -- never assume a function exists.

## Verification Protocol

**RULE: Never assume a stdlib function exists.** Before using any function from CompactStandardLibrary, verify it appears in the export inventory below. If a function is not listed, it does not exist.

### Verification Techniques

| Technique | Tool | What It Tells You |
|-----------|------|-------------------|
| Search the Compact source on GitHub | `octocode` (`githubSearchCode` against `LFDT-Minokawa/compact`) | Finds real usage and definitions. If no results, the symbol likely does not exist. |
| Compile a minimal contract | `compact compile --skip-zk <file>` | The ultimate verification. If it compiles, the function exists with that signature. |
| Dispatch the verify agent | `/midnight-verify:verify` with the claim | Runs source-first verification and (optionally) executes a minimal contract end-to-end. |

### Verification Checklist

1. Check the export inventory in this skill
2. Verify the function signature matches (parameter types, return type, generic parameters)
3. If uncertain, search the Compact source via `octocode` for real usage examples
4. For critical code, compile a minimal contract with `compact compile --skip-zk`

**Common Hallucination Traps:** See the complete "Common Mistakes & Non-Existent Functions" table at the end of this document for the full list of functions that do NOT exist in the standard library.

## Complete Export Inventory

Every export from `import CompactStandardLibrary;`, organized by category. Use this as the definitive checklist before referencing any stdlib symbol.

### Types

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `Maybe<T>` | type | Optional value container | `references/types-and-constructors.md` |
| `Either<A, B>` | type | Disjoint union (sum type) | `references/types-and-constructors.md` |
| `JubjubPoint` | type | Elliptic curve point | `references/types-and-constructors.md` |
| `MerkleTreeDigest` | type | Merkle root hash wrapper | `references/types-and-constructors.md` |
| `MerkleTreePathEntry` | type | Sibling + direction in path | `references/types-and-constructors.md` |
| `MerkleTreePath<#n, T>` | type | Path from leaf to root | `references/types-and-constructors.md` |
| `ContractAddress` | type | Contract address wrapper | `references/types-and-constructors.md` |
| `ZswapCoinPublicKey` | type | Coin public key for shielded ops | `references/types-and-constructors.md` |
| `UserAddress` | type | User address wrapper | `references/types-and-constructors.md` |
| `ShieldedCoinInfo` | type | Newly created shielded coin | `compact-tokens/references/token-operations.md` |
| `QualifiedShieldedCoinInfo` | type | Existing shielded coin with index | `compact-tokens/references/token-operations.md` |
| `ShieldedSendResult` | type | Send result with change | `compact-tokens/references/token-operations.md` |

### Constructor Circuits

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `some<T>` | circuit | Construct Maybe containing value | `references/types-and-constructors.md` |
| `none<T>` | circuit | Construct empty Maybe | `references/types-and-constructors.md` |
| `left<A, B>` | circuit | Construct left Either variant | `references/types-and-constructors.md` |
| `right<A, B>` | circuit | Construct right Either variant | `references/types-and-constructors.md` |

### Hashing & Commitment Circuits

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `persistentHash<T>` | circuit | SHA-256 hash; stable across upgrades | `compact-language-ref/references/stdlib-functions.md` |
| `transientHash<T>` | circuit | Circuit-efficient hash; may change | `compact-language-ref/references/stdlib-functions.md` |
| `persistentCommit<T>` | circuit | SHA-256 commitment with randomness | `compact-language-ref/references/stdlib-functions.md` |
| `transientCommit<T>` | circuit | Circuit-efficient commitment | `compact-language-ref/references/stdlib-functions.md` |
| `degradeToTransient` | circuit | Convert Bytes<32> to Field | `compact-language-ref/references/stdlib-functions.md` |
| `upgradeFromTransient` | circuit | Convert Field to Bytes<32> | `compact-language-ref/references/stdlib-functions.md` |

### Elliptic Curve Circuits

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `ecAdd` | circuit | Add two JubjubPoints | `references/cryptographic-functions.md` |
| `ecMul` | circuit | Scalar multiply JubjubPoint | `references/cryptographic-functions.md` |
| `ecMulGenerator` | circuit | Scalar multiply generator | `references/cryptographic-functions.md` |
| `hashToCurve<T>` | circuit | Map value to JubjubPoint | `references/cryptographic-functions.md` |
| `jubjubPointX` | circuit | Get X coordinate of JubjubPoint | `references/cryptographic-functions.md` |
| `jubjubPointY` | circuit | Get Y coordinate of JubjubPoint | `references/cryptographic-functions.md` |
| `constructJubjubPoint` | circuit | Construct JubjubPoint from X, Y | `references/cryptographic-functions.md` |

### Merkle Tree Path Circuits

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `merkleTreePathRoot<#n, T>` | circuit | Compute root from leaf + path | `references/cryptographic-functions.md` |
| `merkleTreePathRootNoLeafHash<#n>` | circuit | Compute root from pre-hashed leaf | `references/cryptographic-functions.md` |

### Utility Builtins

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `pad` | builtin | Create Bytes<N> from string literal | `compact-language-ref/references/stdlib-functions.md` |
| `disclose` | builtin | Mark value as publicly visible | `compact-language-ref/references/stdlib-functions.md` |
| `assert` | builtin | Abort if condition is false | `compact-language-ref/references/stdlib-functions.md` |
| `default<T>` | builtin | Default value for any type | `compact-language-ref/references/stdlib-functions.md` |

### Block Time Circuits

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `blockTimeLt` | circuit | Block time less than comparison | `compact-language-ref/references/stdlib-functions.md` |
| `blockTimeGte` | circuit | Block time greater-or-equal comparison | `compact-language-ref/references/stdlib-functions.md` |
| `blockTimeGt` | circuit | Block time greater than comparison | `compact-language-ref/references/stdlib-functions.md` |
| `blockTimeLte` | circuit | Block time less-or-equal comparison | `compact-language-ref/references/stdlib-functions.md` |

### Coin Management Circuits

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `tokenType` | circuit | Compute token color from domain sep + contract | `compact-tokens/references/token-operations.md` |
| `nativeToken` | circuit | Native token color (zero) | `compact-tokens/references/token-operations.md` |
| `ownPublicKey` | witness | Current user's coin public key | `compact-tokens/references/token-operations.md` |
| `mintShieldedToken` | circuit | Mint new shielded coin | `compact-tokens/references/token-operations.md` |
| `receiveShielded` | circuit | Accept shielded coin | `compact-tokens/references/token-operations.md` |
| `sendShielded` | circuit | Send from existing coin | `compact-tokens/references/token-operations.md` |
| `sendImmediateShielded` | circuit | Send from just-created coin | `compact-tokens/references/token-operations.md` |
| `mergeCoin` | circuit | Merge two existing coins | `compact-tokens/references/token-operations.md` |
| `mergeCoinImmediate` | circuit | Merge existing + new coin | `compact-tokens/references/token-operations.md` |
| `evolveNonce` | circuit | Derive next nonce | `compact-tokens/references/token-operations.md` |
| `shieldedBurnAddress` | circuit | Burn address for shielded coins | `compact-tokens/references/token-operations.md` |
| `createZswapInput` | circuit | Low-level zswap input | `compact-tokens/references/token-operations.md` |
| `createZswapOutput` | circuit | Low-level zswap output | `compact-tokens/references/token-operations.md` |
| `mintUnshieldedToken` | circuit | Mint unshielded token | `compact-tokens/references/token-operations.md` |
| `sendUnshielded` | circuit | Send unshielded token | `compact-tokens/references/token-operations.md` |
| `receiveUnshielded` | circuit | Receive unshielded token | `compact-tokens/references/token-operations.md` |
| `unshieldedBalance` | circuit | Query unshielded balance | `compact-tokens/references/token-operations.md` |
| `unshieldedBalanceLt` | circuit | Balance less than comparison | `compact-tokens/references/token-operations.md` |
| `unshieldedBalanceGte` | circuit | Balance greater-or-equal comparison | `compact-tokens/references/token-operations.md` |
| `unshieldedBalanceGt` | circuit | Balance greater than comparison | `compact-tokens/references/token-operations.md` |
| `unshieldedBalanceLte` | circuit | Balance less-or-equal comparison | `compact-tokens/references/token-operations.md` |

### Ledger ADT Types

| Name | Kind | Brief Description | Reference Location |
|------|------|-------------------|--------------------|
| `Counter` | ledger ADT | Numeric counter | `compact-ledger/references/types-and-operations.md` |
| `Map<K, V>` | ledger ADT | Key-value store | `compact-ledger/references/types-and-operations.md` |
| `Set<T>` | ledger ADT | Unique element collection | `compact-ledger/references/types-and-operations.md` |
| `List<T>` | ledger ADT | Ordered sequence | `compact-ledger/references/types-and-operations.md` |
| `MerkleTree<N, T>` | ledger ADT | Privacy-preserving set | `compact-ledger/references/types-and-operations.md` |
| `HistoricMerkleTree<N, T>` | ledger ADT | MerkleTree with root history | `compact-ledger/references/types-and-operations.md` |

## Types

Types provided by the standard library. All are available after `import CompactStandardLibrary;`.

| Type | Generic Parameters | Fields Summary | Default Value |
|------|--------------------|----------------|---------------|
| `Maybe<T>` | `T` -- any type | `is_some: Boolean`, `value: T` | `{ is_some: false, value: default<T> }` |
| `Either<A, B>` | `A`, `B` -- any types | `is_left: Boolean`, `left: A`, `right: B` | `{ is_left: false, left: default<A>, right: default<B> }` (right variant, based on struct defaults) |
| `JubjubPoint` | none | `x: Field`, `y: Field` | `{ x: 0, y: 0 }` |
| `MerkleTreeDigest` | none | `field: Field` | `{ field: 0 }` |
| `MerkleTreePathEntry` | none | `sibling: MerkleTreeDigest`, `goes_left: Boolean` (true when the current node is the left child) | `{ sibling: { field: 0 }, goes_left: false }` |
| `MerkleTreePath<#N, T>` | `#N` -- depth, `T` -- leaf type | `leaf: T`, `path: Vector<#N, MerkleTreePathEntry>` | Default leaf + default path |
| `ContractAddress` | none | `bytes: Bytes<32>` | `{ bytes: 0x00...00 }` |
| `ZswapCoinPublicKey` | none | `bytes: Bytes<32>` | `{ bytes: 0x00...00 }` |
| `UserAddress` | none | `bytes: Bytes<32>` | `{ bytes: 0x00...00 }` |
| `ShieldedCoinInfo` | none | `nonce: Bytes<32>`, `color: Bytes<32>`, `value: Uint<128>` | All-zero fields |
| `QualifiedShieldedCoinInfo` | none | `nonce: Bytes<32>`, `color: Bytes<32>`, `value: Uint<128>`, `mt_index: Uint<64>` | All-zero fields |
| `ShieldedSendResult` | none | `change: Maybe<ShieldedCoinInfo>`, `sent: ShieldedCoinInfo` | Default Maybe + default coin |

> **Verification:** Use `octocode` to search the `LFDT-Minokawa/compact` repository for the type name (e.g., `MerkleTreeDigest`) to find real-world usage patterns.

For full field documentation and TypeScript representations, see `references/types-and-constructors.md`.

## Constructor Functions

Four circuits for constructing `Maybe` and `Either` values:

```compact
circuit some<T>(value: T): Maybe<T>;
circuit none<T>(): Maybe<T>;
circuit left<A, B>(value: A): Either<A, B>;
circuit right<A, B>(value: B): Either<A, B>;
```

```compact
const found = some<Field>(42);
if (found.is_some) {
  const v = found.value;  // 42
}

const recipient = left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey());
```

For full patterns including nested Maybe/Either, pattern matching idioms, and default value behavior, see `references/types-and-constructors.md`.

## Hashing & Commitment Functions

| Function | Signature | Domain | Store in Ledger? |
|----------|-----------|--------|-----------------|
| `persistentHash<T>` | `(value: T): Bytes<32>` | Persistent | Yes |
| `transientHash<T>` | `(value: T): Field` | Transient | No |
| `persistentCommit<T>` | `(value: T, rand: Bytes<32>): Bytes<32>` | Persistent | Yes |
| `transientCommit<T>` | `(value: T, rand: Field): Field` | Transient | No |
| `degradeToTransient` | `(x: Bytes<32>): Field` | Conversion | -- |
| `upgradeFromTransient` | `(x: Field): Bytes<32>` | Conversion | -- |

Use **persistent** variants when storing in ledger or comparing across transactions. Use **transient** variants for in-circuit intermediates where lower gate cost matters. The `degradeToTransient` and `upgradeFromTransient` functions convert between domains when mixing persistent and transient operations in a single circuit.

> **Verification:** If you are unsure whether to use persistent or transient, ask: "Will this value be stored in ledger or compared across transactions?" If yes, use persistent. If it is an ephemeral in-circuit intermediate, transient is safe.

For full documentation with examples, disclosure rules, and persistent vs. transient guidance, see `compact-language-ref/references/stdlib-functions.md`.

## Elliptic Curve Functions

All EC operations use `JubjubPoint`, not the deprecated `NativePoint` or `CurvePoint`.

| Function | Signature | Purpose |
|----------|-----------|---------|
| `ecAdd` | `(a: JubjubPoint, b: JubjubPoint): JubjubPoint` | Add two curve points |
| `ecMul` | `(a: JubjubPoint, b: Field): JubjubPoint` | Scalar multiplication |
| `ecMulGenerator` | `(b: Field): JubjubPoint` | Multiply generator by scalar |
| `hashToCurve<T>` | `(value: T): JubjubPoint` | Map arbitrary value to curve point |
| `jubjubPointX` | `(p: JubjubPoint): Field` | Get X coordinate |
| `jubjubPointY` | `(p: JubjubPoint): Field` | Get Y coordinate |
| `constructJubjubPoint` | `(x: Field, y: Field): JubjubPoint` | Construct point from coordinates |

Use cases: Pedersen commitments, key derivation building blocks, custom signature schemes. For example, Pedersen blinding: `ecAdd(ecMulGenerator(rc), ecMul(colorBase, value))`.

> **Verification:** EC functions operate on `JubjubPoint`, not the deprecated `NativePoint` or `CurvePoint`. The type was renamed from `CurvePoint` → `NativePoint` → `JubjubPoint`. Always verify with `compact compile --skip-zk` when using EC operations. See `references/cryptographic-functions.md` for full documentation and examples.

## Merkle Tree Path Functions

```compact
circuit merkleTreePathRoot<#n, T>(path: MerkleTreePath<n, T>): MerkleTreeDigest;
circuit merkleTreePathRootNoLeafHash<#n>(path: MerkleTreePath<n, Bytes<32>>): MerkleTreeDigest;
```

These circuits verify Merkle tree membership by recomputing the root from a leaf and its path siblings. Compare the result with `tree.checkRoot(digest)` to verify membership. The `NoLeafHash` variant is for cases where the leaf is already a pre-hashed `Bytes<32>` value (e.g., coin commitments in zswap), avoiding double-hashing.

For full documentation with off-chain path generation patterns and HistoricMerkleTree root verification, see `references/cryptographic-functions.md`.

## Utility Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `pad` | `pad(length, value): Bytes<N>` | UTF-8 string to fixed-size bytes (both args must be literals) |
| `disclose` | `disclose(value: T): T` | Mark witness-derived value as publicly visible |
| `assert` | `assert(condition: Boolean, message: string): []` | Abort transaction if false |
| `default<T>` | `default<T>` | Default value for any type |

`disclose` is required whenever a witness-derived value flows to a ledger operation, is used in a cross-contract call, or is returned from an exported circuit. `pad` requires both arguments to be compile-time literals. `assert` is the only error-handling mechanism in Compact.

For deep documentation on each function including examples and disclosure rules, see `compact-language-ref/references/stdlib-functions.md`.

## Block Time Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `blockTimeLt` | `(time: Uint<64>): Boolean` | True if block time < given time |
| `blockTimeGte` | `(time: Uint<64>): Boolean` | True if block time >= given time |
| `blockTimeGt` | `(time: Uint<64>): Boolean` | True if block time > given time |
| `blockTimeLte` | `(time: Uint<64>): Boolean` | True if block time <= given time |

These circuits compare the current block timestamp against a given value. The time argument must be disclosed when derived from a witness. Use these for time-based access control, auction deadlines, and vesting schedules.

## Coin Management Functions

Shielded token functions:

| Function | Description |
|----------|-------------|
| `tokenType` | Compute token color from domain separator + contract address |
| `nativeToken` | Native token color (zero value) |
| `ownPublicKey` | Current user's coin public key (witness, not a circuit) |
| `mintShieldedToken` | Mint a new shielded coin with domain, amount, nonce, recipient |
| `receiveShielded` | Accept a shielded coin into the transaction |
| `sendShielded` | Send value from an existing (qualified) shielded coin |
| `sendImmediateShielded` | Send value from a just-created shielded coin |
| `mergeCoin` | Merge two existing (qualified) shielded coins |
| `mergeCoinImmediate` | Merge an existing coin with a just-created coin |
| `evolveNonce` | Derive next nonce from counter index + current nonce |
| `shieldedBurnAddress` | Get the burn address for destroying shielded coins |
| `createZswapInput` | Low-level: create a zswap input from a qualified coin |
| `createZswapOutput` | Low-level: create a zswap output from a coin + recipient |

Unshielded token functions:

| Function | Description |
|----------|-------------|
| `mintUnshieldedToken` | Mint unshielded token with domain, amount, recipient |
| `sendUnshielded` | Send unshielded token by color, amount, recipient |
| `receiveUnshielded` | Receive unshielded token by color, amount |
| `unshieldedBalance` | Query unshielded balance for a color |
| `unshieldedBalanceLt` | Balance less than comparison |
| `unshieldedBalanceGte` | Balance greater-or-equal comparison |
| `unshieldedBalanceGt` | Balance greater than comparison |
| `unshieldedBalanceLte` | Balance less-or-equal comparison |

> For complete signatures, parameters, nonce management, and merge strategies, see the `compact-tokens` skill.

## Ledger ADT Operations

| Type | Key Methods | Notes |
|------|------------|-------|
| `Counter` | `increment`, `decrement`, `read`, `lessThan` | `Uint<16>` step size |
| `Map<K, V>` | `insert`, `lookup`, `member`, `remove`, `size` | All ops visible on-chain |
| `Set<T>` | `insert`, `member`, `remove`, `size` | All ops visible on-chain |
| `List<T>` | `pushFront`, `popFront`, `head`, `length` | Ordered sequence |
| `MerkleTree<N, T>` | `insert`, `checkRoot`, `insertHash`, `isFull` | Insert hides leaf (via `leaf_hash()`); privacy via membership proofs |
| `HistoricMerkleTree<N, T>` | Same + `resetHistory` | Accepts proofs against past roots |

> For complete ADT operation tables, nested composition, and state design patterns, see the `compact-ledger` skill.

## Common Mistakes & Non-Existent Functions

| Wrong | Correct | Why |
|-------|---------|-----|
| `public_key(sk)` | `persistentHash<Vector<2, Bytes<32>>>([pad(32, "domain:pk:"), sk])` | `public_key` does not exist in stdlib |
| `hash(value)` | `persistentHash<T>(value)` | Generic `hash` does not exist; specify persistent or transient |
| `verify(sig, msg, pk)` | Build from EC primitives | No signature verification function exists |
| `encrypt(value)` / `decrypt(value)` | Use commitments | Encryption does not exist; use commit/reveal patterns |
| `random()` / `randomBytes()` | Use witness functions | No randomness source in circuits; witnesses provide off-chain randomness |
| `counter.value()` | `counter.read()` | `.value()` does not exist on Counter |
| `map.get(key)` | `map.lookup(key)` | `.get()` does not exist on Map |
| `map.has(key)` | `map.member(key)` | `.has()` does not exist on Map |
| `map.set(key, value)` | `map.insert(key, value)` | `.set()` does not exist on Map |
| `map.delete(key)` | `map.remove(key)` | `.delete()` does not exist on Map |
| `NativePoint` | `JubjubPoint` | `NativePoint` was renamed to `JubjubPoint`; `CurvePoint` is the oldest name for this type |
| `CoinInfo` | `ShieldedCoinInfo` | `CoinInfo` was renamed to `ShieldedCoinInfo` |
| `SendResult` | `ShieldedSendResult` | `SendResult` was renamed to `ShieldedSendResult` |
| `persistentHash(value)` (no generic) | `persistentHash<T>(value)` | Generic parameter is required |
| `some(42)` (no generic) | `some<Field>(42)` | Generic parameter is required for constructor circuits |
| `circuit fn(): Void` | `circuit fn(): []` | Return type is `[]` (empty tuple), not `Void` |
| `merkleTreePathRoot(path)` (no generic) | `merkleTreePathRoot<#n, T>(path)` | Requires depth and leaf type generics |
| Custom registry for `@midnight-ntwrk/*` | Not needed — all packages are on **public npm** | `.yarnrc.yml` files in SDK repos are for contributors only |

## Reference Routing

### This skill's references

| Topic | Reference File |
|-------|---------------|
| Stdlib types (Maybe, Either, JubjubPoint, MerkleTree types, address types), constructors (some, none, left, right), re-exports | `references/types-and-constructors.md` |
| Elliptic curve functions, Merkle tree path functions, hashing/commitment summary | `references/cryptographic-functions.md` |
| Alphabetical index of every stdlib export with authoritative documentation location | `references/cross-reference-index.md` |

### Cross-references to other skills

| Topic | Skill |
|-------|-------|
| Hashing, commitments, pad, disclose, assert, default (deep docs) | `compact-language-ref` |
| Ledger ADT operations, state design, privacy | `compact-ledger` |
| Token types, functions, operations, patterns | `compact-tokens` |
| Contract anatomy, pragma, circuits, witnesses | `compact-structure` |
