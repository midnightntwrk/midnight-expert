# Ledger Types and Operations

> **Last verified:** 2026-09-18 — all ADT method names/signatures (Counter, Map, Set, List, MerkleTree, HistoricMerkleTree) and Kernel operations compile-verified in circuit context against Compact compiler `0.31.1` / language `0.23` / runtime `0.16.0`; nested-ADT `default<V>` init confirmed.

Exhaustive API reference for all ledger state types in Compact. Every ADT is provided by the standard library (`import CompactStandardLibrary;`).

## Declaration Syntax

Each ledger field is declared individually at the top level or inside a module:

```compact
ledger val: Field;
export ledger cnt: Counter;
sealed ledger u8list: List<Uint<8>>;
export sealed ledger mapping: Map<Boolean, Field>;
```

### Valid Ledger State Types

| Category | Types |
|----------|-------|
| **Compact types** | `Field`, `Boolean`, `Bytes<N>`, `Uint<N>`, `Uint<0..MAX>`, enums, structs |
| **Counter** | `Counter` |
| **Map** | `Map<K, V>` where K is any Compact type and V is any Compact type or ledger state type |
| **Set** | `Set<T>` for any Compact type T |
| **List** | `List<T>` for any Compact type T |
| **MerkleTree** | `MerkleTree<N, T>` where 1 < N <= 32 and T is any Compact type |
| **HistoricMerkleTree** | `HistoricMerkleTree<N, T>` where 1 < N <= 32 and T is any Compact type |

### Modifiers

| Modifier | Position | Effect |
|----------|----------|--------|
| `export` | Before `sealed` and `ledger` | Field is readable from TypeScript |
| `sealed` | After `export`, before `ledger` | Field can only be set during constructor |

```compact
export sealed ledger admin: Bytes<32>;    // Public + immutable after deploy
sealed ledger secret: Field;              // Internal + immutable after deploy
export ledger mutable: Counter;           // Public + mutable
ledger internal: Field;                   // Internal + mutable
```

### Direct Value Types vs ADT Types

For simple Compact types (`Field`, `Boolean`, `Bytes<N>`, `Uint<N>`, enums, structs), assign directly:

```compact
export ledger owner: Bytes<32>;
owner = disclose(newOwner);
```

For ADT types (Counter, Map, Set, List, MerkleTree, HistoricMerkleTree), use their methods:

```compact
export ledger count: Counter;
count.increment(1);      // Correct
count = 5;               // Wrong -- direct assignment not supported
```

## Counter

A numeric counter supporting increment and decrement operations.

```compact
export ledger count: Counter;
```

### Operations

| Method | Parameters | Returns | Context | Description |
|--------|-----------|---------|---------|-------------|
| `increment(n)` | `n: Uint<16>` | `[]` | Circuit | Increase by n |
| `decrement(n)` | `n: Uint<16>` | `[]` | Circuit | Decrease by n; fails if result < 0 |
| `read()` | -- | `Uint<64>` | Circuit | Get current value |
| `lessThan(n)` | `n: Uint<64>` | `Boolean` | Circuit | Check if current value < n |
| `resetToDefault()` | -- | `[]` | Circuit | Reset to 0 |

**Visibility:** All Counter operations are publicly visible on-chain. The increment/decrement amount is visible.

### Edge Cases and Gotchas

- **Step size is `Uint<16>`**: Increment/decrement amounts are limited to 0..65535 per call. To increment by larger amounts, call `increment` multiple times.
- **Read returns `Uint<64>`**: The counter value is always a 64-bit unsigned integer.
- **No `.value()` method**: Use `.read()`, not `.value()`. This is a common mistake.
- **Decrement can fail**: If the counter value would go below zero, the transaction fails.

```compact
// Correct usage
count.increment(1);
const current = count.read();
if (count.lessThan(100)) {
  count.increment(10);
}
count.resetToDefault();

// Common mistake
const current = count.value();    // Wrong -- .value() does not exist
```

## Map\<K, V>

Key-value mapping where K is any Compact type and V is any Compact type or ledger state type (enabling nested ADTs).

```compact
export ledger balances: Map<Bytes<32>, Uint<64>>;
export ledger nested: Map<Boolean, Map<Field, Counter>>;
```

### Operations

| Method | Parameters | Returns | Context | Description |
|--------|-----------|---------|---------|-------------|
| `insert(key, value)` | `key: K, value: V` | `[]` | Circuit | Add or update entry |
| `insertDefault(key)` | `key: K` | `[]` | Circuit | Insert default value for key |
| `remove(key)` | `key: K` | `[]` | Circuit | Remove entry |
| `lookup(key)` | `key: K` | `V` | Circuit | Get value for key |
| `member(key)` | `key: K` | `Boolean` | Circuit | Check if key exists |
| `isEmpty()` | -- | `Boolean` | Circuit | Check if map is empty |
| `size()` | -- | `Uint<64>` | Circuit | Number of entries |
| `resetToDefault()` | -- | `[]` | Circuit | Clear entire map |
| `[Symbol.iterator]()` | -- | Iterator | **TypeScript only** | Iterate over entries |

**Visibility:** All Map operations are publicly visible on-chain. Both key and value arguments are visible.

### Edge Cases and Gotchas

- **`lookup()` on missing key**: Throws a runtime error (ExpectedCell), not a default value. Always check `member()` first:

```compact
if (balances.member(address)) {
  const balance = balances.lookup(address);
  // Safe to use balance
}
```

- **Nested ADT initialization**: When V is a ledger state type (e.g., `Map<Field, Counter>`), initialize nested entries with `default<V>`:

```compact
export ledger nested: Map<Boolean, Map<Field, Counter>>;

export circuit init(): [] {
  nested.insert(true, default<Map<Field, Counter>>);
  nested.lookup(true).insert(1, default<Counter>);
  nested.lookup(true).lookup(1).increment(5);
}
```

- **Iteration is TypeScript-only**: `[Symbol.iterator]()` is not available in circuits. Use it only in witnesses or DApp TypeScript code.

### Coin-Specific Operations

When V involves `QualifiedShieldedCoinInfo`, the Map also provides:

| Method | Parameters | Description |
|--------|-----------|-------------|
| `insertCoin(key, coin, recipient)` | `key: K, coin: ShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>` | Insert a qualified shielded coin |

## Set\<T>

A collection of unique values.

```compact
export ledger members: Set<Bytes<32>>;
```

### Operations

| Method | Parameters | Returns | Context | Description |
|--------|-----------|---------|---------|-------------|
| `insert(elem)` | `elem: T` | `[]` | Circuit | Add to set |
| `remove(elem)` | `elem: T` | `[]` | Circuit | Remove from set |
| `member(elem)` | `elem: T` | `Boolean` | Circuit | Check membership |
| `isEmpty()` | -- | `Boolean` | Circuit | Check if empty |
| `size()` | -- | `Uint<64>` | Circuit | Number of elements |
| `resetToDefault()` | -- | `[]` | Circuit | Clear entire set |

**Visibility:** All Set operations are publicly visible on-chain. The element value is revealed in every operation.

### Privacy Comparison with MerkleTree

`Set<T>` reveals which element is being tested or inserted. If you need to prove membership without revealing which element, use `MerkleTree<N, T>` instead. See `privacy-and-visibility.md` for a detailed comparison.

```compact
// Set: reveals which member is checked
export ledger voters: Set<Bytes<32>>;
assert(voters.member(disclose(myPk)), "Not a voter");  // myPk is visible on-chain

// MerkleTree: hides which member is proven
export ledger voterTree: MerkleTree<10, Bytes<32>>;
// Membership proven via ZK proof without revealing which leaf
```

## List\<T>

A dynamic ordered sequence with front-access operations.

```compact
export ledger items: List<Field>;
```

### Operations

| Method | Parameters | Returns | Context | Description |
|--------|-----------|---------|---------|-------------|
| `pushFront(elem)` | `elem: T` | `[]` | Circuit | Add element to front |
| `popFront()` | -- | `[]` | Circuit | Remove first element |
| `head()` | -- | `Maybe<T>` | Circuit | Get first element (or none) |
| `isEmpty()` | -- | `Boolean` | Circuit | Check if empty |
| `length()` | -- | `Uint<64>` | Circuit | Number of elements |
| `resetToDefault()` | -- | `[]` | Circuit | Clear entire list |
| `[Symbol.iterator]()` | -- | Iterator | **TypeScript only** | Iterate over elements |

**Visibility:** All List operations are publicly visible on-chain.

### Edge Cases and Gotchas

- **`head()` returns `Maybe<T>`**: Check `.is_some` before accessing `.value`:

```compact
const first = items.head();
if (first.is_some) {
  const value = first.value;
}
```

- **Front-only access**: List only supports front insertion and removal. There is no `pushBack`, `popBack`, or index-based access.
- **`popFront()` on empty list**: Behavior when list is empty -- check `isEmpty()` first.
- **Iteration is TypeScript-only**: `[Symbol.iterator]()` is not available in circuits.

### Coin-Specific Operations

When T involves `QualifiedShieldedCoinInfo`:

| Method | Parameters | Description |
|--------|-----------|-------------|
| `pushFrontCoin(coin, recipient)` | `coin: ShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>` | Push a qualified shielded coin to front |

## MerkleTree\<N, T>

A bounded Merkle tree of depth N containing values of type T. Supports up to 2^N leaves. The key privacy property: **membership proofs** (ZK path proofs) do not reveal which specific leaf is being proven, enabling anonymous membership verification.

```compact
export ledger tree: MerkleTree<10, Bytes<32>>;
```

N must satisfy: 1 < N <= 32.

### Operations

| Method | Parameters | Returns | Context | Description |
|--------|-----------|---------|---------|-------------|
| `insert(leaf)` | `leaf: T` | `[]` | Circuit | Add leaf at next free index |
| `insertHash(hash)` | `hash: Bytes<32>` | `[]` | Circuit | Add leaf by its hash |
| `insertIndex(item, index)` | `item: T, index: Uint<64>` | `[]` | Circuit | Add leaf at specific index |
| `insertHashIndex(hash, index)` | `hash: Bytes<32>, index: Uint<64>` | `[]` | Circuit | Add hash at specific index |
| `insertIndexDefault(index)` | `index: Uint<64>` | `[]` | Circuit | Insert default value at index |
| `checkRoot(digest)` | `digest: MerkleTreeDigest` | `Boolean` | Circuit | Check if digest matches current root |
| `isFull()` | -- | `Boolean` | Circuit | Check if tree has 2^N leaves |
| `resetToDefault()` | -- | `[]` | Circuit | Reset to empty tree |

**TypeScript-only operations:**

| Method | Returns | Description |
|--------|---------|-------------|
| `root()` | `MerkleTreeDigest` | Get the current tree root |
| `pathForLeaf(index: bigint, leaf: value_type)` | `MerkleTreePath<N, T>` | Get proof path by index and leaf value |
| `findPathForLeaf(leaf)` | `MerkleTreePath<N, T>` | Find proof path by leaf value (O(n) scan) |

**Visibility:** `MerkleTree.insert()` hides the leaf value — the compiler applies `leaf_hash()` (a `persistent_hash`) before storing, so only the hash appears in the transaction transcript. This is the only ledger operation that hides its data argument. The additional privacy benefit comes from membership proofs — ZK path proofs do not reveal which leaf is being proven.

### Membership Proof Pattern

To verify membership in a circuit, use a witness to provide the Merkle proof:

```compact
export ledger items: MerkleTree<10, Field>;

witness findItem(item: Field): MerkleTreePath<10, Field>;

export circuit insert(item: Field): [] {
  items.insert(item);
}

export circuit check(item: Field): [] {
  const path = findItem(item);
  assert(items.checkRoot(disclose(merkleTreePathRoot<10, Field>(path))), "path must be valid");
}
```

The witness implementation uses `pathForLeaf` (preferred, O(1)) or `findPathForLeaf` (O(n) scan):

```typescript
function findItem(context: WitnessContext, item: bigint): MerkleTreePath<bigint> {
  return context.ledger.items.findPathForLeaf(item)!;
}
```

### Edge Cases

- **Depth bounds**: N must be > 1 and <= 32. `MerkleTree<1, T>` is invalid.
- **Capacity**: A tree of depth N holds at most 2^N leaves. Check `isFull()` before inserting.
- **Root not available in circuits**: `root()` is TypeScript-only. Use `checkRoot()` with a digest computed via `merkleTreePathRoot()` in circuits.
- **Privacy via insert and membership proofs**: `insert()` hides the leaf value — the compiler applies `leaf_hash()` (a `persistent_hash`) before storing, so only the hash appears in the transaction transcript. This is the only ledger operation that hides its data argument. Additionally, membership proofs via `merkleTreePathRoot()` + `checkRoot()` do not reveal which leaf is being proven. Use `insertHash()` to insert a pre-hashed value when you need to control the hashing yourself.

## HistoricMerkleTree\<N, T>

Same as `MerkleTree` but preserves historic root values. The key difference: `checkRoot()` accepts proofs made against any prior version of the tree, not just the current root.

```compact
export ledger history: HistoricMerkleTree<10, Bytes<32>>;
```

### Operations

All `MerkleTree` operations plus:

| Method | Parameters | Returns | Context | Description |
|--------|-----------|---------|---------|-------------|
| `resetHistory()` | -- | `[]` | Circuit | Clear the root history (current root preserved) |

### When to Use HistoricMerkleTree vs MerkleTree

- Use `HistoricMerkleTree` when the tree has frequent insertions and you need proofs that remain valid after new leaves are added.
- Use regular `MerkleTree` when proofs are always against the latest root.
- `HistoricMerkleTree` is not suitable if items are frequently removed or replaced, as this could lead to proofs being considered valid which should not be.

## Kernel

The special `Kernel` type provides access to contract metadata and token operations.

```compact
// kernel is auto-provided by `import CompactStandardLibrary;`
// Do NOT declare it explicitly — redeclaration causes a compile error:
//   "another binding found for kernel in the same scope"
```

### Operations

| Method | Parameters | Returns | Context | Description |
|--------|-----------|---------|---------|-------------|
| `self()` | -- | `ContractAddress` | Circuit | Get the contract's own address |
| `checkpoint()` | -- | `[]` | Circuit | Create a transaction checkpoint |
| `mintShielded(domainSep, amount)` | `domainSep: Bytes<32>, amount: Uint<64>` | `[]` | Circuit | Mint shielded tokens |
| `mintUnshielded(domainSep, amount)` | `domainSep: Bytes<32>, amount: Uint<64>` | `[]` | Circuit | Mint unshielded tokens |
| `claimContractCall(addr, entryPoint, comm)` | `addr: Bytes<32>, entryPoint: Bytes<32>, comm: Field` | `[]` | Circuit | Claim a contract call |
| `claimZswapCoinReceive(note)` | `note: Bytes<32>` | `[]` | Circuit | Claim a zswap coin receive |
| `claimZswapCoinSpend(note)` | `note: Bytes<32>` | `[]` | Circuit | Claim a zswap coin spend |
| `claimZswapNullifier(nul)` | `nul: Bytes<32>` | `[]` | Circuit | Claim a zswap nullifier |
| `claimUnshieldedCoinSpend(tokenType, recipient, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, recipient: Either<ContractAddress, UserAddress>, amount: Uint<64>` | `[]` | Circuit | Claim an unshielded coin spend |
| `incUnshieldedOutputs(tokenType, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, amount: Uint<64>` | `[]` | Circuit | Increment unshielded outputs |
| `incUnshieldedInputs(tokenType, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, amount: Uint<64>` | `[]` | Circuit | Increment unshielded inputs |
| `balance(tokenType)` | `tokenType: Either<Bytes<32>, Bytes<32>>` | `Uint<128>` | Circuit | Query contract's unshielded balance |
| `balanceLessThan(tokenType, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, amount: Uint<128>` | `Boolean` | Circuit | Check if balance < amount |
| `balanceGreaterThan(tokenType, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, amount: Uint<128>` | `Boolean` | Circuit | Check if balance > amount |
| `blockTimeGreaterThan(time)` | `time: Uint<64>` | `Boolean` | Circuit | Check if block time > time |
| `blockTimeLessThan(time)` | `time: Uint<64>` | `Boolean` | Circuit | Check if block time < time |

### Common Usage

```compact
// kernel is auto-provided by `import CompactStandardLibrary;`
// Do NOT declare it explicitly — redeclaration causes a compile error:
//   "another binding found for kernel in the same scope"

export circuit getSelf(): ContractAddress {
  return kernel.self();
}

export circuit mint(amount: Uint<64>): [] {
  kernel.mintShielded(pad(32, "mytoken:"), disclose(amount));
}
```

## Nested ADT Composition

Maps support nested ADT values, enabling complex state structures:

```compact
// Map of Maps
export ledger permissions: Map<Bytes<32>, Map<Bytes<32>, Boolean>>;

// Map of Counters
export ledger userScores: Map<Bytes<32>, Counter>;

// Map of Sets
export ledger userItems: Map<Bytes<32>, Set<Field>>;
```

### Initialization Pattern

Nested ADTs must be initialized with `default<V>` before accessing inner operations:

```compact
export ledger nested: Map<Boolean, Map<Field, Counter>>;

export circuit setup(): [] {
  // Step 1: Initialize outer map entry with default inner map
  nested.insert(true, default<Map<Field, Counter>>);

  // Step 2: Initialize inner map entry with default counter
  nested.lookup(true).insert(1, default<Counter>);

  // Step 3: Now use the inner counter
  nested.lookup(true).lookup(1).increment(5);
}
```

The `default<V>` expression creates an empty/zero value for any ledger state type:
- `default<Counter>` -- Counter at 0
- `default<Map<K, V>>` -- Empty map
- `default<Set<T>>` -- Empty set
- `default<List<T>>` -- Empty list
