# Privacy and Visibility

Deep reference for understanding what ledger operations reveal on-chain, how to design state for privacy, and how the token system provides balance confidentiality.

## Core Rule

**Everything passed as an argument to a ledger operation, and all reads and writes of the ledger itself, are publicly visible on-chain** — except for `MerkleTree.insert()` and `HistoricMerkleTree.insert()`, which hide the leaf value by applying `leaf_hash()` (a `persistent_hash`) before storing. Only the hash appears in the transaction transcript. This is the only ledger operation that hides its data argument. The additional privacy benefit of MerkleTree is in **membership proofs** — ZK path proofs do not reveal which leaf is being proven.

```compact
export ledger items: Set<Field>;
export ledger tree: MerkleTree<10, Field>;

items.insert(value);      // Reveals value on-chain
items.member(f(x));        // Reveals the *value* of f(x), but not x directly
tree.insert(value);        // Hides value — the compiler applies leaf_hash() before storing; only the hash appears on-chain
// Privacy comes from BOTH: insert hides the leaf (leaf_hash applied), and membership proofs hide which leaf is proven
```

## Visibility Rules by Operation

### Counter

| Operation | What Is Visible On-Chain |
|-----------|------------------------|
| `increment(n)` | The amount n |
| `decrement(n)` | The amount n |
| `read()` | The current counter value |
| `lessThan(n)` | The threshold n and the comparison result |
| `resetToDefault()` | The fact that a reset occurred |

All Counter operations are fully public. The counter value, and every increment/decrement step, can be observed by anyone.

### Map\<K, V>

| Operation | What Is Visible On-Chain |
|-----------|------------------------|
| `insert(key, value)` | Both key and value |
| `insertDefault(key)` | The key |
| `remove(key)` | The key |
| `lookup(key)` | The key and the returned value |
| `member(key)` | The key and the result |
| `isEmpty()` | The result |
| `size()` | The count |
| `resetToDefault()` | The fact that a reset occurred |

Every Map operation reveals its arguments. If you store balances in a `Map<Bytes<32>, Uint<64>>`, every insert/lookup reveals both the address and the balance amount.

### Set\<T>

| Operation | What Is Visible On-Chain |
|-----------|------------------------|
| `insert(elem)` | The element |
| `remove(elem)` | The element |
| `member(elem)` | The element and the result |
| `isEmpty()` | The result |
| `size()` | The count |
| `resetToDefault()` | The fact that a reset occurred |

Set operations reveal which element is being tested, inserted, or removed. This means an observer can see exactly which element's membership is being checked.

### List\<T>

| Operation | What Is Visible On-Chain |
|-----------|------------------------|
| `pushFront(elem)` | The element |
| `popFront()` | The fact that an element was removed |
| `head()` | The first element (if it exists) |
| `isEmpty()` | The result |
| `length()` | The count |
| `resetToDefault()` | The fact that a reset occurred |

### MerkleTree\<N, T> and HistoricMerkleTree\<N, T>

| Operation | What Is Visible On-Chain |
|-----------|------------------------|
| `insert(leaf)` | **Hidden** — the compiler applies `leaf_hash()` before storing; only the hash is in the transcript |
| `insertHash(hash)` | The hash (but not the preimage) |
| `insertIndex(item, index)` | The item and index |
| `insertHashIndex(hash, index)` | The hash and index |
| `insertIndexDefault(index)` | The index |
| `checkRoot(digest)` | The digest and result |
| `isFull()` | The result |
| `resetToDefault()` | The fact that a reset occurred |
| `resetHistory()` | The fact that a reset occurred (HistoricMerkleTree only) |

MerkleTree provides two layers of privacy: (1) `insert()` hides the leaf value — the compiler applies `leaf_hash()` before storing, so only the hash is in the transaction transcript, and (2) **membership proofs**: ZK path proofs (via `merkleTreePathRoot` + `checkRoot`) do not reveal which specific leaf is being proven. This enables anonymous membership verification — proving you are in a set without revealing which member you are.

## MerkleTree vs Set: Privacy Comparison

This is the most important design decision for privacy-sensitive state.

### Scenario: Voter Eligibility

**Using Set (public membership):**

```compact
export ledger eligibleVoters: Set<Bytes<32>>;
export ledger hasVoted: Set<Bytes<32>>;

export circuit vote(): [] {
  const pk = disclose(get_public_key(local_secret_key()));
  assert(eligibleVoters.member(pk), "Not eligible");  // Reveals which voter
  assert(!hasVoted.member(pk), "Already voted");       // Reveals which voter
  hasVoted.insert(pk);                                  // Reveals which voter
}
```

Privacy implications: Every call reveals exactly which voter is acting. An observer can link voter identity to their vote transaction.

**Using MerkleTree (private membership):**

```compact
export ledger eligibleVoters: HistoricMerkleTree<10, Bytes<32>>;
export ledger votedNullifiers: Set<Bytes<32>>;

witness getVoterPath(pk: Bytes<32>): MerkleTreePath<10, Bytes<32>>;

export circuit vote(): [] {
  const sk = local_secret_key();
  const pk = get_public_key(sk);
  const path = getVoterPath(pk);

  // Bind the witness path to this caller's key first. merkleTreePathRoot
  // hashes path.leaf, so without this any eligible voter's path passes.
  assert(path.leaf == pk, "Path is not for this voter");

  // Proves membership without revealing which voter
  assert(eligibleVoters.checkRoot(
    disclose(merkleTreePathRoot<10, Bytes<32>>(path))
  ), "Not eligible");

  // Nullifier prevents double voting without revealing identity
  const nullifier = persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "vote:nullifier:"), sk
  ]);
  assert(disclose(!votedNullifiers.member(disclose(nullifier))), "Already voted");
  votedNullifiers.insert(disclose(nullifier));
}
```

Privacy implications: An observer sees that *someone* voted and sees the nullifier (preventing double votes), but cannot determine which eligible voter acted.

### Summary Table

| Concern | `Set<T>` | `MerkleTree<N, T>` |
|---------|---------|-------------------|
| Insert reveals element | Yes | **No** — the compiler applies `leaf_hash()` before storing; only the hash is in the transaction transcript |
| Membership check reveals element | Yes | **No** (proven via ZK path) |
| Observer can identify which member acted | Yes | **No** (ZK proof hides which leaf) |
| Double-action prevention | Check membership directly | Use commitment/nullifier pattern |
| Capacity | Unbounded | 2^N leaves |
| Proof remains valid after new inserts | N/A | No (use `HistoricMerkleTree`) |

## Disclosure and State

The `disclose()` function marks a witness-derived value as publicly visible. It is required whenever a witness-derived value flows to:

1. A ledger write (direct assignment or ADT method argument)
2. A conditional (`if`, `assert`, ternary)
3. A return from an exported circuit

### Disclosure Rules for Ledger Operations

```compact
witness local_secret_key(): Bytes<32>;
witness getData(): Field;

export circuit example(): [] {
  const sk = local_secret_key();
  const pk = get_public_key(sk);
  const data = getData();

  // Direct ledger write: disclose required
  owner = disclose(pk);

  // ADT method with witness-derived argument: disclose required
  balances.insert(disclose(pk), disclose(data));

  // Conditional on witness value: disclose required
  if (disclose(pk == owner)) {
    // ...
  }

  // Assertion on witness value: disclose required
  assert(disclose(data > 0), "Data must be positive");
}
```

### What Disclosure Does NOT Do

- `disclose()` does not encrypt or protect the value. It explicitly marks it as public.
- Commitments protect their inputs from disclosure, but the commitment result still needs `disclose()` when written to ledger:

```compact
// The secret is protected by the hash, but the hash result is disclosed
const commitment = persistentCommit<Field>(secretValue, randomness);
storedCommitment = disclose(commitment);  // Hash is public, secretValue is not
```

### When Disclosure Is Not Required

- Pure computation on witness values without ledger interaction
- Values that never flow to ledger, conditionals, or returns

```compact
// No disclose needed: pure computation, result not used in ledger/conditional
const hash = persistentHash<Bytes<32>>(local_secret_key());
// But if you then write hash to ledger:
storedHash = disclose(hash);  // Now disclose is required
```

## Designing for Privacy

### Pattern 1: Hash-Based Authentication

Store a hash of a secret rather than the secret itself. The ZK proof verifies knowledge of the preimage without revealing it:

```compact
export sealed ledger owner: Bytes<32>;  // Stores hash, not secret key

constructor() {
  owner = disclose(get_public_key(local_secret_key()));
}

export circuit authenticate(): [] {
  const pk = get_public_key(local_secret_key());
  assert(disclose(pk == owner), "Not authorized");
  // Observer sees the comparison result, but not the secret key
}
```

### Pattern 2: Commitment-Then-Reveal

Store a commitment on-chain, reveal later with proof:

```compact
export ledger commitment: Bytes<32>;

export circuit commit(value: Field): [] {
  const salt = local_secret_key();
  commitment = disclose(persistentCommit<Field>(value, salt));
  // Observer sees the commitment hash, not the value
}

export circuit reveal(value: Field): [] {
  const salt = local_secret_key();
  const expected = persistentCommit<Field>(value, salt);
  assert(disclose(expected == commitment), "Mismatch");
  // Now value can be disclosed
}
```

### Pattern 3: Commitment/Nullifier for Single-Use Tokens

Combine MerkleTree (for committed values) with Set (for nullifiers) to create single-use authentication tokens:

```compact
export ledger commitments: HistoricMerkleTree<10, Bytes<32>>;
export ledger nullifiers: Set<Bytes<32>>;

export circuit useToken(): [] {
  const sk = local_secret_key();

  // Prove the commitment exists (without revealing which one)
  const pk = get_public_key(sk);
  const authPath = findAuthPath(pk);

  // Bind the path to this caller's key before checking the root, or any
  // authorized holder's path satisfies the gate for any caller.
  assert(authPath.leaf == pk, "Path is not for this token");
  assert(commitments.checkRoot(
    disclose(merkleTreePathRoot<10, Bytes<32>>(authPath))
  ), "Not authorized");

  // Prevent reuse with a nullifier
  const nul = persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "nullifier:"), sk
  ]);
  assert(disclose(!nullifiers.member(disclose(nul))), "Already used");
  nullifiers.insert(disclose(nul));
}
```

The commitment and nullifier must use different domain separators so they cannot be correlated.

### Pattern 4: Round-Based Unlinkability

Use a counter to rotate public keys between transactions, preventing linkability:

```compact
export ledger authority: Bytes<32>;
export ledger round: Counter;

circuit publicKey(round: Field, sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "myapp:pk:"),
    round as Bytes<32>,
    sk
  ]);
}

export circuit authorize(): [] {
  const sk = local_secret_key();
  const pk = publicKey(round.read() as Field, sk);
  assert(disclose(authority == pk), "Not authorized");
  round.increment(1);
  authority = disclose(publicKey(round.read() as Field, sk));
}
```

Each transaction rotates the on-chain authority hash, breaking the link between transactions from the same user.

## Sealed Fields and Privacy

Sealed fields are set once in the constructor and immutable thereafter. Privacy implications:

- The initial value is visible on-chain when the constructor transaction is processed
- If the sealed value comes from a witness, `disclose()` is required, making it public
- To store a sealed secret, commit its hash rather than the raw value:

```compact
// Public sealed field: observer sees the owner's public key
export sealed ledger owner: Bytes<32>;

// Private sealed approach: store hash of secret
sealed ledger ownerCommitment: Bytes<32>;

constructor() {
  // This reveals the public key on-chain
  owner = disclose(get_public_key(local_secret_key()));

  // This reveals only the commitment, not the underlying secret
  ownerCommitment = disclose(persistentCommit<Bytes<32>>(
    local_secret_key(), pad(32, "owner-salt")
  ));
}
```

## Token System Privacy Model

The Midnight token system (zswap) provides balance privacy that is not achievable with regular ledger Maps.

### Map-Based Balances (Public)

```compact
export ledger balances: Map<Bytes<32>, Uint<64>>;

export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
  // All of these are visible on-chain:
  // - who sends (from address)
  // - who receives (to address)
  // - how much (amount)
  const d_to = disclose(to);
  const d_amount = disclose(amount);
  // ... transfer logic with disclosed values
}
```

Every transfer reveals sender, receiver, and amount.

### Shielded Token Balances (Private)

The zswap protocol uses a UTXO model with commitments and nullifiers:

- **Commitments** hide the coin value, type, and owner
- **Nullifiers** prevent double-spending without revealing which coin is spent
- Balances are never stored in plaintext on the ledger

Key types:

| Type | Fields | Purpose |
|------|--------|---------|
| `ShieldedCoinInfo` | `nonce: Bytes<32>`, `color: Bytes<32>`, `value: Uint<128>` | Describes a coin's properties |
| `QualifiedShieldedCoinInfo` | `nonce: Bytes<32>`, `color: Bytes<32>`, `value: Uint<128>`, `mt_index: Uint<64>` | Fully qualified shielded coin (with Merkle tree index) |

The standard library provides circuits for shielded operations:

| Circuit | Purpose |
|---------|---------|
| `sendShielded(coin: QualifiedShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>, value: Uint<128>): ShieldedSendResult` | Send shielded coin to recipient |
| `receiveShielded(coin)` | Receive a shielded coin |
| `sendImmediateShielded(coin: ShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>, value: Uint<128>): ShieldedSendResult` | Send within same transaction |
| `mergeCoin(coin1, coin2)` | Combine two coins |
| `createZswapOutput(coin, recipient)` | Create a zswap output |
| `mintShieldedToken(domainSep: Bytes<32>, value: Uint<64>, nonce: Bytes<32>, recipient: Either<ZswapCoinPublicKey, ContractAddress>): ShieldedCoinInfo` | Mint new shielded tokens |
| `evolveNonce(index, nonce)` | Deterministically derive new nonce |
| `shieldedBurnAddress()` | Get address that burns sent coins |

### Privacy Comparison

| Property | `Map<K, Uint<64>>` | Shielded Tokens (zswap) |
|----------|-------------------|------------------------|
| Balance visibility | Public | **Hidden** |
| Transfer amounts | Public | **Hidden** |
| Sender identity | Public | **Hidden** (via nullifiers) |
| Receiver identity | Public | **Hidden** (via commitments) |
| Token type | Public | **Hidden** |
| Complexity | Simple ledger ops | Requires zswap integration |

Use Map-based balances when transparency is acceptable. Use the token system when balance privacy is a requirement.
