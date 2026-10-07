---
name: core-concepts:privacy-patterns
description: This skill should be used when understanding privacy-preserving design patterns, including commitment schemes, nullifier patterns, Merkle tree membership proofs, anonymous authentication, commit-reveal protocols, selective disclosure, domain separation, and privacy boundaries in on-chain data.
version: 0.1.0
---

# Privacy Patterns in Midnight

Privacy-preserving design patterns for Compact smart contracts. Covers commitment schemes, nullifiers, Merkle tree membership proofs, round-based unlinkability, selective disclosure, and threat analysis. For basic visibility rules per ledger operation, see `compact-ledger`. For standard library function signatures, see `compact-standard-library`. For shielded token privacy, see `compact-tokens`.

**When not to use this skill:** For basic ledger visibility rules per operation, see `compact-ledger`. For token balance operations and shielded coin mechanics, see `compact-tokens`. For standard library function signatures and type details, see `compact-standard-library`.

## Pattern Selection Guide

| What to Protect | Approach | Key Primitives |
|----------------|----------|----------------|
| Hide a value on-chain | Commitment | `persistentCommit<T>` / `transientCommit<T>` |
| Prove membership anonymously | MerkleTree + ZK path | `HistoricMerkleTree` + `merkleTreePathRoot<N, T>` |
| Prevent double-actions | Nullifier | `persistentHash<T>` with domain separation + `Set<Bytes<32>>` |
| Hide who is acting | Unlinkable auth | `Counter` + rotated `persistentHash` |
| Multi-step hidden value | Commit-reveal | Commit phase + reveal phase |
| Private token balances | Shielded tokens | Zswap infrastructure (see `compact-tokens`) |
| Share specific data only | Selective disclosure | `disclose()` on boolean result, not the value |

## Pattern 1: Commitment Schemes

A commitment hides a value behind cryptographic randomness while binding the committer to that value. Compact provides hash-based commitments (not algebraic Pedersen commitments -- those are used internally by Zswap for balance proofs, a separate mechanism).

| Function | Signature | Clears Witness Taint | Use Case |
|----------|-----------|---------------------|----------|
| `persistentCommit<T>` | `(value: T, rand: Bytes<32>): Bytes<32>` | Yes | Hide a value you will reveal later |
| `persistentHash<T>` | `(value: T): Bytes<32>` | No | Derive a binding fingerprint (public keys, nullifiers) |
| `transientCommit<T>` | `(value: T, rand: Field): Field` | Yes | In-circuit intermediates only; algorithm may change between compiler versions |
| `transientHash<T>` | `(value: T): Field` | No | In-circuit consistency checks only |

**Persistent vs transient**: Persistent functions use SHA-256 and produce stable outputs across compiler upgrades. Transient functions are circuit-optimized but their algorithm may change between compiler versions, so outputs must not be stored in ledger state.

**When to use commit vs hash**: Use `persistentCommit` when you need to hide a value on-chain and later prove you committed to it (commit-reveal schemes, sealed bids). Use `persistentHash` when binding is sufficient and the hash itself is not secret (public key derivation, nullifiers, domain-separated identifiers). Note that `persistentHash<T>` accepts any serializable type `T`, not just `Bytes<32>`.

**Column note**: "Clears Witness Taint" means the compiler no longer requires `disclose()` for values that flowed through the function's input. The commitment cryptographically hides the input, so the compiler considers it safe. Hash functions do not provide this guarantee because hash outputs could theoretically be brute-forced.

**How it works in practice:** A circuit accepts a value to commit and calls a witness function to obtain fresh randomness (a 32-byte salt). It then calls `persistentCommit` over a domain-separated vector containing the value and a purpose prefix (created with `pad(32, "myapp:commit:")`). The resulting commitment is stored on-chain. Because `persistentCommit` clears witness taint, no `disclose()` is needed for the ledger write. The opening (commitment, salt, and value) is stored off-chain via a witness function so the committer can reveal later. Randomness must never be reused across commitments.

See `references/commitment-schemes.md` for detailed commitment properties, reveal patterns, and salt management.

## Pattern 2: Nullifier Construction

A nullifier prevents double-actions without revealing which action is being prevented. It is a deterministic derivation from a secret: the same secret always produces the same nullifier, so a `Set` check catches reuse, but the nullifier itself reveals nothing about the underlying identity.

### Derivation Pattern

Nullifiers are derived by calling `persistentHash` over a domain-separated vector containing a unique purpose prefix (e.g., `pad(32, "contract:purpose:")`), the secret, and any additional context-specific inputs.

**Domain separation is critical.** Nullifiers for different purposes MUST use different domain prefixes. Without domain separation, an observer who sees a nullifier from one contract can check whether the same secret was used in another contract.

### Nullifier vs Commitment Must Be Uncorrelatable

If you derive both a commitment and a nullifier from the same secret, use different domain separators so an observer cannot match commitments to nullifiers. For example, use `pad(32, "myapp:commit:")` for the commitment and `pad(32, "myapp:nul:")` for the nullifier. Using the same domain prefix for both produces identical outputs, enabling a linking attack.

### Multi-Round Nullifiers

To allow one action per round (e.g., voting in multiple rounds), incorporate a round counter into the nullifier derivation. A `deriveNullifier` circuit takes the round number (as `Uint<64>`) and the secret key, casts the round through `Field` to `Bytes<32>` (two-step cast required: `Uint<64>` cannot cast directly to `Bytes<32>`), then calls `persistentHash` over a three-element vector containing the round-specific domain prefix, the round bytes, and the secret key. Each round produces a distinct nullifier from the same secret, allowing one action per round while still preventing double-actions within a round.

### Storage

Nullifiers are stored in a `Set<Bytes<32>>` ledger variable. This is public on-chain by design: the nullifier is already a derived value and reveals nothing about the underlying secret. To check and insert: derive the nullifier, then call `Set.member(disclose(nul))` to check for reuse (the `disclose()` is required because the nullifier is witness-derived and Set arguments must be public), and `Set.insert(disclose(nul))` to record it.

### Zerocash Pattern

The Midnight zerocash implementation demonstrates the canonical commitment and nullifier separation. Its `derive_nullifier` circuit calls `persistentHash` over a four-element vector containing a domain prefix (`"lares:zerocash:commit"`), the coin nonce, the coin opening, and the secret key. The result is disclosed (nullifiers are public by design) and wrapped in a nullifier struct. Note: the domain string `"lares:zerocash:commit"` is a historical naming artifact from the reference implementation where the same function was reused for both commitment and nullifier derivation -- the domain string was not updated when the purposes diverged.

## Pattern 3: Merkle Tree Anonymous Authentication

`MerkleTree` and `HistoricMerkleTree` enable anonymous set membership proofs. The observer sees that someone proved membership, but not which member.

### Why HistoricMerkleTree

Use `HistoricMerkleTree<N, T>` instead of `MerkleTree<N, T>` when members are added over time. `HistoricMerkleTree.checkRoot()` accepts proofs against any prior version of the tree, so a proof generated before new members were added remains valid. With plain `MerkleTree`, each insertion changes the root and invalidates all existing proofs.

### The On-Chain / Off-Chain Dance

1. **Admin inserts commitments on-chain.** `tree.insert(commitment)` adds a leaf. The leaf value is hidden on-chain (the special privacy property of MerkleTree and HistoricMerkleTree inserts).

2. **User obtains a MerkleTreePath off-chain.** The witness function queries the local copy of the tree state. TypeScript provides `findPathForLeaf(leaf)` (O(n) scan) or `pathForLeaf(index, leaf)` (O(log n) by index).

3. **Circuit binds the path to its own value and computes the root.** Assert `path.leaf == <the value the circuit recomputed>` first. `merkleTreePathRoot<N, T>(path)` then recomputes the Merkle root from the path. The `MerkleTreePath<N, T>` struct has fields `leaf: T` and `path: Vector<N, MerkleTreePathEntry>`, where each `MerkleTreePathEntry` has `sibling: MerkleTreeDigest` and `goes_left: Boolean`. Pass the whole struct -- there is no `.value` field.

4. **Circuit verifies the root on-chain.** `tree.checkRoot(disclose(digest))` confirms the computed root matches a current (or historic) root. The `disclose()` is required because the digest is derived from witness data (the path). There is no `historicMember` method -- use `checkRoot` only.

The binding assertion in step 3 is not optional. `merkleTreePathRoot` hashes the `leaf` field carried inside the struct, so a witness that returns another member's path produces a root that `checkRoot` accepts. Together the two steps prove "this caller's value is in the tree"; step 4 on its own proves only "some value is in the tree".

### Full Flow: Anonymous Authentication with Nullifier

The contract declares an `HistoricMerkleTree<16, Bytes<32>>` for member registration and a `Set<Bytes<32>>` for spent nullifiers. A witness provides the user's secret key; another witness returns the `MerkleTreePath` for the user's public key.

**Admin registration:** An `addMember` circuit inserts a member's public key commitment into the tree. The leaf value is hidden on-chain (the special privacy property of MerkleTree inserts), though `disclose()` is still required on the argument.

**Anonymous action (five steps):**

1. **Obtain proof off-chain.** The circuit derives the user's public key from their secret key via `persistentHash` with a `"myapp:pk:"` domain prefix, then calls a witness to get the `MerkleTreePath` for that public key.
2. **Bind the path to that public key.** Assert `memberPath.leaf == pk`. The witness return is unconstrained, so without this the caller can submit any member's path.
3. **Compute root in-circuit.** Call `merkleTreePathRoot<16, Bytes<32>>(memberPath)` passing the whole `MerkleTreePath` struct (there is no `.value` field).
4. **Verify root on-chain.** Call `members.checkRoot(disclose(digest))` to confirm the computed root matches a current or historic root. The `disclose()` is required because the digest is derived from witness data.
5. **Check and record nullifier.** Derive a nullifier via `persistentHash` with a different domain prefix (`"myapp:act-nul:"`), check it is not in the spent set, and insert it. Both `Set.member()` and `Set.insert()` require `disclose()` on the witness-derived nullifier.

**Capacity planning:** `HistoricMerkleTree<N, T>` holds at most 2^N leaves. Depth 16 supports 65,536 members; depth 20 supports about 1 million. Depth also determines proof size (N sibling hashes), so balance capacity against circuit cost.

**Leaf guessing caveat:** If the set of possible leaf values is small (e.g., only 10 known public keys), an observer can verify guesses against the tree. Mitigate by using commitments (hashed with randomness) as leaves instead of raw public keys.

See `references/merkle-tree-usage.md` for detailed Merkle tree patterns and TypeScript integration.

## Pattern 4: Round-Based Unlinkability

This pattern breaks the link between successive transactions from the same user. Instead of storing a fixed public key on-chain, each transaction derives a round-specific key and rotates the stored authority.

### Mechanism

A `publicKey` circuit derives a round-specific key by calling `persistentHash` over a three-element vector: a `"myapp:pk:"` domain prefix, the round number (cast through `Field` to `Bytes<32>` -- the two-step cast is required), and the secret key. The contract stores the current `authority` hash and a `Counter` for the round number.

Each transaction:
1. Reads the current round counter (`Counter.read()` returns `Uint<64>`)
2. Derives the expected public key for this round
3. Asserts it matches the stored authority (`disclose()` needed because the key is witness-derived)
4. Increments the round counter
5. Computes the next round's public key and writes it to `authority` (`disclose()` needed for the ledger write)

**Observer perspective:** Each transaction shows a different authority hash. Without knowing the secret key, the observer cannot determine that the same user authorized all transactions.

**Limitation:** The first transaction that initializes the authority is a unique event (the constructor sets it). An observer can identify the deployment transaction. Subsequent transactions are unlinkable to each other but not to the deployment.

## Selective Disclosure

Selective disclosure proves a property about private data without revealing the data itself. The key technique: `disclose()` the boolean result of a comparison, not the underlying value.

### Threshold Check

Prove a witness-held value exceeds a threshold without revealing the value. Note: comparison operators (`>=`, `<=`, `>`, `<`) only work on `Uint<N>`, not `Field`.

The circuit obtains the credential value (as `Uint<64>`, required for comparisons) and its salt from witnesses. It recomputes the commitment via `persistentCommit<Uint<64>>(value, salt)` and asserts it matches the on-chain commitment (no `disclose()` needed on the result because `persistentCommit` clears taint). Then it discloses only the boolean result of the comparison: `disclose(value >= threshold)`. The value itself never leaves the circuit.

### Range Proof

The same pattern extends to range checks: after verifying the credential commitment, disclose a combined boolean expression like `disclose(value >= minimum && value <= maximum)`. The range boundaries are public circuit parameters; the value remains private.

### Selective Field Disclosure

When working with structured data, disclose only specific fields. For example, a witness might return a profile tuple containing a name (`Bytes<32>`), age (`Uint<64>`), and income (`Uint<64>`). A circuit can destructure this tuple and disclose only the boolean result of an age comparison -- `disclose(age >= minAge)` -- while the name and income fields never leave the circuit. The key principle: disclose the boolean result of a check, not the underlying data.

## Threat Model: What an On-Chain Observer Can See

### Always Visible

- **Which exported circuit was called** (circuit name is part of the transaction)
- **Which contract was called** (contract address is visible)
- **Number of ledger operations** (each read/write creates observable state change)
- **Transaction timing** (block inclusion time)
- **Counter increment/decrement amounts** (all Counter operations are public)
- **Map and Set operation arguments** (keys, values, and elements are public). Exception: `MerkleTree.insert()` hides its leaf argument.
- **The `disclose()`d values** (by definition, intentionally public)

### Hidden by ZK Proofs

- **Witness function return values** (unless explicitly disclosed)
- **Internal circuit computations** (intermediate variables)
- **Values passed to `MerkleTree.insert()` and `HistoricMerkleTree.insert()`** (the only ledger operations that hide their data argument)
- **The specific leaf proven in a Merkle membership proof** (observer sees only the root check)

### Mitigation Strategies

| Attack | Mitigation |
|--------|------------|
| Small anonymity set | Add dummy members to increase set size |
| Timing correlation | Introduce random delays; batch transactions |
| Amount fingerprinting | Standardize amounts; split into uniform denominations |
| Leaf guessing | Use committed values (with randomness) as MerkleTree leaves |
| Nullifier timing | Decouple registration order from action order |
| Circuit selection | Use a single circuit with internal branching where feasible |

## Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `Set` for private membership | `MerkleTree` + ZK path proof | Set reveals which element is tested (note: only an issue when element identity must be hidden) |
| Missing domain separator on nullifiers | Always prefix with unique `pad(32, "contract:purpose:")` | Prevents cross-contract correlation |
| `persistentHash` to "hide" witness data | `persistentCommit` with randomness | Hash does not clear witness taint; commit does |
| Same derivation for commitment and nullifier | Different domain separators | Prevents linking attack |
| Disclosing at witness call site | Disclose at the disclosure point | Over-discloses; all downstream uses lose privacy |
| Reusing salts across commitments | Unique randomness per commitment | Same value + same salt = same output |
| `round as Bytes<32>` cast for `Uint<64>` | `(round as Field) as Bytes<32>` two-step | Direct `Uint<64>` to `Bytes<32>` cast is invalid |
| `>=` / `<=` on `Field` type | Use `Uint<64>` for comparisons | Comparison operators only work on `Uint<N>` |
| `merkleTreePathRoot(path.value)` | `merkleTreePathRoot(path)` passing whole struct | `MerkleTreePath` has no `.value` field |

## References

| Topic | File |
|-------|------|
| Commitment properties, hiding/binding, `persistentCommit` vs `transientCommit`, salt management | `references/commitment-schemes.md` |
| MerkleTree/HistoricMerkleTree, `MerkleTreePath` struct, `checkRoot` pattern, TypeScript integration | `references/merkle-tree-usage.md` |

