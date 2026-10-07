# Merkle Tree Usage

Detailed reference for `MerkleTree`, `HistoricMerkleTree`, membership proofs, and the `MerkleTreePath` struct in Compact.

## Ledger Types

### MerkleTree<N, T>

A Merkle tree with depth `N` and leaf type `T`. Supports up to 2^N leaves. Each insertion changes the root, which invalidates all existing proofs. Declared as a ledger variable, e.g., `export ledger tree: MerkleTree<10, Bytes<32>>`.

### HistoricMerkleTree<N, T>

Like `MerkleTree` but retains all historic roots. `checkRoot()` accepts proofs against any prior version of the tree, so proofs generated before new insertions remain valid. Use this when members are added over time. Declared as a ledger variable, e.g., `export ledger members: HistoricMerkleTree<16, Bytes<32>>`.

## Operations

### insert(value)

Adds a leaf to the tree. The leaf value is **hidden on-chain** -- this is the unique privacy property of MerkleTree inserts. An observer sees that an insertion occurred but cannot determine what was inserted. Call as `members.insert(disclose(memberPk))`. Note: even though `insert()` hides the value on-chain, the compiler still requires `disclose()` on the argument when it is witness-derived.

### checkRoot(digest)

Verifies that `digest` matches a valid root of the tree. For `HistoricMerkleTree`, this checks against all historic roots. For `MerkleTree`, only the current root. Call as `members.checkRoot(disclose(digest))`. The `disclose()` is required because the digest is derived from witness data (the path).

**Important**: There is no `historicMember` method. Use `checkRoot` only. There is no `.member(value, path)` method either -- membership is verified by computing the root from a path and checking it.

Because there is no `.member(value, path)`, nothing in `checkRoot` ties the proof to a particular value. It answers "is this a real root of the tree", not "is *my* value in the tree". The circuit has to supply that second half itself by asserting `path.leaf == <the value it recomputed>`. See the five-step pattern below.

## MerkleTreePath Struct

The `MerkleTreePath<N, T>` struct contains everything needed to recompute a Merkle root from a leaf:

| Field | Type | Description |
|-------|------|-------------|
| `leaf` | `T` | The leaf value being proven |
| `path` | `Vector<N, MerkleTreePathEntry>` | The authentication path (sibling hashes and directions) |

Each `MerkleTreePathEntry` has:

| Field | Type | Description |
|-------|------|-------------|
| `sibling` | `MerkleTreeDigest` | The sibling hash at this tree level |
| `goes_left` | `Boolean` | Whether the current node is the left child |

**There is no `.value` field on `MerkleTreePath`.** Pass the whole struct to `merkleTreePathRoot`.

## merkleTreePathRoot Function

```text
merkleTreePathRoot<N, T>(path: MerkleTreePath<N, T>): MerkleTreeDigest
```

Recomputes the Merkle root by hashing from the leaf up through all siblings. Pass the entire `MerkleTreePath` struct -- not a field of it. For example: `merkleTreePathRoot<16, Bytes<32>>(memberPath)`. A common mistake is trying to pass `memberPath.value` -- `MerkleTreePath` has no `.value` field.

The leaf it hashes from is `path.leaf`, the one carried inside the struct you passed in. When the struct came from a witness, that field is whatever the witness chose to put there, and every path in the tree is public ledger state. So a `checkRoot(merkleTreePathRoot(path))` that is not preceded by `assert(path.leaf == <recomputed value>)` proves only that *some* leaf is in the tree, and any member's path will satisfy any caller's check.

## Complete Membership Proof Pattern

The canonical five-step pattern for anonymous membership verification uses an `HistoricMerkleTree<16, Bytes<32>>` for members and a `Set<Bytes<32>>` for spent nullifiers. Witnesses provide the secret key and the Merkle path.

**Registration:** An admin circuit inserts a member's public key into the tree via `members.insert(disclose(memberPk))`. The leaf value is hidden on-chain.

**Anonymous action (five steps):**

1. **Derive identity.** The circuit obtains the secret key from a witness and derives the public key via `persistentHash` with a domain-separated prefix.
2. **Obtain proof.** A witness returns the `MerkleTreePath` for the public key.
3. **Bind the path to the identity.** The circuit asserts `path.leaf == pk` against the key it derived in step 1, then calls `merkleTreePathRoot` on the full struct to compute the digest. Without this assertion the witness is free to return any member's path and the proof says nothing about this caller.
4. **Verify on-chain.** The circuit calls `members.checkRoot(disclose(digest))` to confirm membership. The `disclose()` is required because the digest is witness-derived.
5. **Nullifier check.** The circuit derives a nullifier via `persistentHash` with a different domain prefix, checks it against the spent set with `Set.member(disclose(nul))`, and records it with `Set.insert(disclose(nul))`. Both operations require `disclose()` because nullifiers are witness-derived and Set arguments must be public.

## TypeScript Integration

The off-chain witness implementation must query the local tree state to construct the `MerkleTreePath`. Two APIs are available:

### findPathForLeaf(leaf)

O(n) scan through all leaves to find the matching one and construct the path. Use when you do not know the leaf's index.

### pathForLeaf(index, leaf)

O(log n) path construction when the leaf's index is known. More efficient for large trees.

### Witness Implementation Approach

The TypeScript witness queries the local ledger state for the tree, then calls `findPathForLeaf(pk)` to locate the member's leaf and construct the authentication path. If the leaf is not found, the witness throws an error. Consult the current Midnight SDK documentation for exact method signatures, as the API shape may evolve.

## Capacity Planning

| Depth (N) | Max Leaves | Proof Size (sibling hashes) | Use Case |
|-----------|------------|----------------------------|----------|
| 10 | 1,024 | 10 | Small groups, test scenarios |
| 16 | 65,536 | 16 | Medium communities |
| 20 | ~1,048,576 | 20 | Large-scale applications |
| 32 | ~4.3 billion | 32 | Maximum practical capacity |

Deeper trees increase circuit complexity (more hash computations per proof) but support more members. Balance capacity against proof generation time.

## Privacy Considerations

### Leaf Guessing

If the set of possible leaf values is small (e.g., 10 known public keys), an observer can hash each candidate and check whether it appears as a leaf. Mitigate by using commitments with randomness as leaves: instead of inserting raw public keys, obtain fresh randomness from a witness, compute a commitment via `persistentCommit<Bytes<32>>(pk, rand)`, and insert the commitment as the leaf. This hides the public key behind the randomness, making leaf-guessing attacks infeasible.

### Tree Size Leakage

The number of `MerkleTree` insertions is observable (the tree index increments visibly). This reveals the member count even though individual members are hidden.

### Set vs MerkleTree

`Set.member(value)` reveals which element is being tested because the argument is public. When element identity must remain private (e.g., proving you are in an authorized group without revealing which member you are), use `MerkleTree` with a ZK path proof instead.
