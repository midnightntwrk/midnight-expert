# Privacy Patterns

Advanced privacy-preserving patterns for Compact smart contracts. For basic
visibility rules per ledger operation, see `compact-ledger/references/privacy-and-visibility.md`.
For basic authentication and commit-reveal snippets, see
`compact-structure/references/patterns.md`. This reference extends those
foundations with deeper mechanics, composition strategies, and threat analysis.

## Commitment Schemes

A commitment hides a value behind cryptographic randomness while binding the
committer to that value. Two operations are available: `persistentCommit` (with
a blinding factor) and `persistentHash` (without).

| Function | Has Blinding Factor | Clears Witness Taint | Brute-Force Resistant | Use Case |
|----------|--------------------|-----------------------|----------------------|----------|
| `persistentCommit<T>(value, rand)` | Yes (`Bytes<32>`) | Yes | Yes | Hide a value you will reveal later |
| `persistentHash<T>(value)` | No | No | No (small inputs vulnerable) | Derive a binding fingerprint (public keys, nullifiers) |
| `transientCommit<T>(value, rand)` | Yes (`Field`) | Yes | Yes | In-circuit intermediates only; not ledger-safe |
| `transientHash<T>(value)` | No | No | No (small inputs vulnerable) | In-circuit consistency checks only |

**When to use commit vs hash:** Use `persistentCommit` when you need to hide a
value on-chain and later prove you committed to it (commit-reveal schemes, sealed
bids). Use `persistentHash` when binding is sufficient and the hash itself is not
secret (public key derivation, nullifiers, domain-separated identifiers).

**Persistent vs transient:** Persistent functions use SHA-256 and produce stable
outputs across compiler upgrades. Transient functions are circuit-optimized but
their algorithm may change. Store only persistent results in ledger state.

**Binding property:** A commitment binds the committer to the value. Once
`persistentCommit<T>(value, rand)` is stored on-chain, the committer cannot
later open it to a different value. This requires that `rand` has sufficient
entropy; reusing randomness across commitments breaks hiding (identical
value + identical rand = identical commitment).

**Salt/randomness management:** Always source randomness from a witness function
that provides fresh, off-chain random bytes. Never reuse salts across different
commitments.

```compact
witness get_randomness(): Bytes<32>;
witness store_opening(commitment: Bytes<32>, salt: Bytes<32>, value: Field): [];

export ledger storedCommitment: Bytes<32>;

export circuit commitValue(value: Field): [] {
  // Fresh randomness from off-chain — never reuse
  const salt = get_randomness();
  const valueBytes = value as Bytes<32>;
  const commitment = persistentCommit<Vector<2, Bytes<32>>>(
    [valueBytes, pad(32, "myapp:commit:")],
    salt
  );
  // Store the opening off-chain for later reveal
  store_opening(commitment, salt, value);
  // Commitment clears witness taint on the input, but the result
  // still needs disclose() for the ledger write
  storedCommitment = disclose(commitment);
}
```

## Nullifier Construction

A nullifier prevents double-actions without revealing which action is being
prevented. It is a deterministic derivation from a secret: the same secret
always produces the same nullifier, so a `Set` check catches reuse, but the
nullifier itself reveals nothing about the underlying identity.

### Derivation Pattern

Nullifiers are derived via `persistentHash` with a domain-separated vector of
inputs. The general structure is:

```compact
persistentHash<Vector<N, Bytes<32>>>([
  pad(32, "contract:purpose:"),
  secret,
  ... additional inputs ...
])
```

**Domain separation is critical.** Nullifiers for different purposes MUST use
different domain prefixes. Without domain separation, an observer who sees a
nullifier from one contract can check whether the same secret was used in
another contract.

### Nullifier vs Commitment Must Be Uncorrelatable

If you derive both a commitment and a nullifier from the same secret, use
different domain separators so an observer cannot match commitments to
nullifiers.

```compact
// WRONG — same derivation enables linking
const commitment = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:"), sk]);
const nullifier = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:"), sk]);

// CORRECT — different domains prevent correlation
const commitment = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:commit:"), sk]);
const nullifier = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:nul:"), sk]);
```

### Multi-Round Nullifiers

To allow one action per round (e.g., voting in multiple rounds), incorporate a
round counter into the nullifier derivation:

```compact
circuit deriveNullifier(round: Uint<64>, sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "myapp:round-nul:"),
    round as Bytes<32>,
    sk
  ]);
}
```

Each round produces a distinct nullifier from the same secret, allowing one
action per round while still preventing double-actions within a round.

### Storage

Nullifiers are stored in `Set<Bytes<32>>`. This is public on-chain by design:
the nullifier is already a derived value and reveals nothing about the
underlying secret. The observer sees that *some* action was taken, but cannot
determine *who* took it.

```compact
export ledger spentNullifiers: Set<Bytes<32>>;

// Check and insert a nullifier
const nul = deriveNullifier(currentRound, sk);
assert(disclose(!spentNullifiers.member(disclose(nul))), "Already acted this round");
spentNullifiers.insert(disclose(nul));
```

### Zerocash Pattern

The Midnight zerocash implementation demonstrates the canonical commitment and
nullifier separation. The commitment incorporates a nonce and opening, while the
nullifier incorporates the same coin info plus the spending key, under a
different domain:

```compact
// From zerocash.compact — nullifier derivation
circuit derive_nullifier(coin: coin_info, sk: zk_secret_key): nullifier {
  return nullifier{ bytes: disclose(persistentHash<Vector<4, Bytes<32>>>([
    pad(32, "lares:zerocash:commit"),
    coin.nonce.bytes,
    coin.opening.bytes,
    sk.bytes
  ]))};
}
```

Key points from this pattern:

- Four-element vector with explicit domain separator as the first element
- The `disclose()` wraps the entire hash result because it flows to a public
  context (nullifier insertion into a Set)
- The domain prefix `"lares:zerocash:commit"` is specific to this protocol;
  your contracts should use their own unique domain strings

## Merkle Tree Anonymous Authentication

`MerkleTree` and `HistoricMerkleTree` enable anonymous set membership proofs.
The observer sees that *someone* proved membership, but not *which* member.

### Why HistoricMerkleTree

Use `HistoricMerkleTree<N, T>` instead of `MerkleTree<N, T>` when members are
added over time. `HistoricMerkleTree.checkRoot()` accepts proofs against any
prior version of the tree, so a proof generated before new members were added
remains valid. With plain `MerkleTree`, each insertion changes the root and
invalidates all existing proofs.

### The On-Chain / Off-Chain Dance

The Merkle membership proof involves coordinated on-chain and off-chain work:

1. **Admin inserts commitments on-chain.** `tree.insert(commitment)` adds a
   leaf. The leaf value is hidden -- the compiler applies `leaf_hash()` (a `persistent_hash`) before storing, so only the hash appears in the transaction transcript. This is the only ledger operation that hides its data argument. Additional privacy
   comes from membership proofs -- ZK path proofs do not reveal which leaf is being proven.

2. **User obtains a MerkleTreePath off-chain.** The witness function queries
   the local copy of the tree state to find the path from the user's leaf to the
   root. TypeScript provides `findPathForLeaf(leaf)` (O(n) scan) or
   `pathForLeaf(index, leaf)` (O(log n) by index).

3. **Circuit binds the path to its own value.** The circuit asserts
   `path.leaf == <the value it recomputed>`. The witness return is
   unconstrained, so this is what makes the proof about this caller rather than
   about some arbitrary member.

4. **Circuit computes the root.** The circuit calls
   `merkleTreePathRoot<N, T>(path)` to recompute the Merkle root from the leaf
   and its authentication path.

5. **Circuit verifies the root on-chain.** `tree.checkRoot(digest)` confirms
   the computed root matches a current (or historic) root of the tree.

### Full Flow: Anonymous Authentication with Nullifier

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger members: HistoricMerkleTree<16, Bytes<32>>;
export ledger usedNullifiers: Set<Bytes<32>>;

witness local_secret_key(): Bytes<32>;
witness getMemberPath(pk: Bytes<32>): MerkleTreePath<16, Bytes<32>>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

// Admin adds a member (leaf is hidden — leaf_hash() applied before storing; privacy also via membership proofs)
export circuit addMember(memberPk: Bytes<32>): [] {
  members.insert(disclose(memberPk));
}

// Member proves membership anonymously and performs a one-time action
export circuit act(): [] {
  const sk = local_secret_key();
  const pk = get_public_key(sk);

  // Step 1: Get Merkle proof from off-chain state
  const path = getMemberPath(pk);

  // Step 2: Bind the path to this caller's key. Without this the witness can
  // return any member's path and the check below still passes.
  assert(path.leaf == pk, "Path is not for this member");

  // Step 3: Compute root from leaf + path
  const digest = merkleTreePathRoot<16, Bytes<32>>(path);

  // Step 4: Verify against on-chain tree (disclose needed for checkRoot arg)
  assert(members.checkRoot(disclose(digest)), "Not a member");

  // Step 5: Derive nullifier to prevent reuse
  const nul = persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:act-nul:"), sk
  ]);
  assert(disclose(!usedNullifiers.member(disclose(nul))), "Already acted");
  usedNullifiers.insert(disclose(nul));

  // ... perform the action
}
```

**Privacy property:** The observer sees a valid membership proof and a new
nullifier, but cannot determine which member acted.

**Capacity planning:** `HistoricMerkleTree<N, T>` holds at most 2^N leaves.
A depth of 16 supports 65,536 members; depth 20 supports about 1 million. The
depth also determines proof size (N sibling hashes), so balance capacity against
circuit cost.

**Leaf guessing caveat:** If the set of possible leaf values is small (e.g.,
only 10 known public keys), an observer can verify guesses against the tree.
Mitigate by using commitments (hashed with randomness) as leaves instead of
raw public keys.

## Round-Based Unlinkability

This pattern breaks the link between successive transactions from the same user.
Instead of storing a fixed public key on-chain, each transaction derives a
round-specific key and rotates the stored authority.

### Mechanism

The public key for each round incorporates a counter:

```compact
circuit publicKey(round: Field, sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "myapp:pk:"),
    round as Bytes<32>,
    sk
  ]);
}
```

Each transaction:
1. Reads the current round counter
2. Derives the expected public key for this round
3. Asserts it matches the stored authority
4. Increments the round counter
5. Computes and stores the next round's authority

```compact
export ledger authority: Bytes<32>;
export ledger round: Counter;

export circuit authorize(): [] {
  const sk = local_secret_key();
  const currentRound = round.read() as Field;
  const pk = publicKey(currentRound, sk);
  assert(disclose(authority == pk), "Not authorized");

  // Rotate to next round
  round.increment(1);
  authority = disclose(publicKey((round.read()) as Field, sk));
}
```

**Observer perspective:** Each transaction shows a different authority hash.
Without knowing the secret key, the observer cannot determine that the same
user authorized all transactions.

**Limitation:** The first transaction that initializes the authority is a unique
event (the constructor sets it). An observer can identify the first action as
the deployment transaction. Subsequent transactions are unlinkable to each other
but not to the deployment.

**When to use:** Single-user authorization where you want to break transaction
linkability. This pattern is from the official Midnight lock contract tutorial.

## Multi-Phase Protocols

Some privacy patterns require multiple phases: participants commit hidden
values, then reveal them. The protocol must enforce phase ordering.

### Commit-Reveal with Multiple Participants

```compact
export enum Phase { commit, reveal, finalized }
export ledger phase: Phase;
export ledger commitments: Map<Bytes<32>, Bytes<32>>;

witness local_secret_key(): Bytes<32>;
witness get_randomness(): Bytes<32>;
witness storeOpening(id: Bytes<32>, salt: Bytes<32>, value: Field): [];
witness getOpening(): [Bytes<32>, Field];

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

// Phase 1: Each participant submits a commitment
export circuit submitCommitment(value: Field): [] {
  assert(phase == Phase.commit, "Not in commit phase");
  const sk = local_secret_key();
  const pk = get_public_key(sk);
  const salt = get_randomness();
  const c = persistentCommit<Field>(value, salt);
  storeOpening(pk, salt, value);
  commitments.insert(disclose(pk), disclose(c));
}

// Phase 2: Each participant reveals their value
export circuit revealValue(): Field {
  assert(phase == Phase.reveal, "Not in reveal phase");
  const sk = local_secret_key();
  const pk = get_public_key(sk);
  assert(disclose(commitments.member(disclose(pk))), "No commitment found");
  const opening = getOpening();
  const salt = opening[0];
  const value = opening[1];
  const expected = persistentCommit<Field>(value, salt);
  assert(disclose(expected == commitments.lookup(disclose(pk))), "Commitment mismatch");
  return disclose(value);
}
```

### Ordering and State Transitions

Use an enum-based state machine to enforce phase transitions. Only an
authorized party (or a time condition) should advance phases:

```compact
export circuit advanceToReveal(): [] {
  assert(phase == Phase.commit, "Not in commit phase");
  // Optionally enforce a deadline:
  // assert(blockTimeGte(commitDeadline), "Commit phase not over");
  phase = Phase.reveal;
}
```

### Timeout Handling

Combine phase transitions with `blockTimeGte` / `blockTimeLt` to enforce
deadlines. This prevents a participant from stalling the protocol by never
revealing:

```compact
export sealed ledger commitDeadline: Uint<64>;
export sealed ledger revealDeadline: Uint<64>;

export circuit advanceToReveal(): [] {
  assert(phase == Phase.commit, "Not in commit phase");
  assert(blockTimeGte(commitDeadline), "Commit phase not over");
  phase = Phase.reveal;
}

export circuit finalize(): [] {
  assert(phase == Phase.reveal, "Not in reveal phase");
  assert(blockTimeGte(revealDeadline), "Reveal phase not over");
  phase = Phase.finalized;
}
```

### Concurrent Security

Each participant must use their own salt/secret. If two participants share a
salt and commit the same value, their commitments will be identical, breaking
the hiding property. Always source randomness per-participant from witness
functions.

## Selective Disclosure

Selective disclosure proves a property about private data without revealing the
data itself. The key technique: `disclose()` the boolean result of a comparison,
not the underlying value.

### Threshold Check

Prove a witness-held value exceeds a threshold without revealing the value:

```compact
witness getCredentialValue(): Field;
witness getCredentialSalt(): Bytes<32>;

export ledger credentialCommitment: Bytes<32>;

// Prove value >= threshold without revealing value
export circuit verifyThreshold(threshold: Field): [] {
  const value = getCredentialValue();
  const salt = getCredentialSalt();

  // Verify the witness value matches the on-chain commitment
  const expected = persistentCommit<Field>(value, salt);
  assert(disclose(expected == credentialCommitment), "Invalid credential");

  // Disclose only the boolean result, NOT the value
  assert(disclose(value >= threshold), "Below threshold");
}
```

The observer sees that the credential holder's value meets the threshold but
learns nothing about the actual value.

### Range Proof

Prove a value falls within a range:

```compact
export circuit verifyRange(minimum: Field, maximum: Field): [] {
  const value = getCredentialValue();
  const salt = getCredentialSalt();
  const expected = persistentCommit<Field>(value, salt);
  assert(disclose(expected == credentialCommitment), "Invalid credential");

  // Disclose the combined range check as a single boolean
  assert(disclose(value >= minimum && value <= maximum), "Out of range");
}
```

### Selective Field Disclosure

When working with structured data, disclose only specific fields:

```compact
witness getProfile(): [Bytes<32>, Field, Field];

// Reveal age bracket but not name or exact income
export circuit proveAgeAbove(minAge: Field): [] {
  const profile = getProfile();
  const name = profile[0];     // NOT disclosed
  const age = profile[1];      // comparison result disclosed
  const income = profile[2];   // NOT disclosed

  // Only the boolean result of the age comparison is made public
  assert(disclose(age >= minAge), "Age requirement not met");
}
```

## Threat Model: What an On-Chain Observer Can See

Understanding what information leaks is essential for privacy-conscious design.

### Always Visible

These are public for every transaction, regardless of ZK proofs:

- **Which exported circuit was called** (the circuit name is part of the
  transaction)
- **Which contract was called** (the contract address is visible)
- **The number of ledger operations** (each read/write creates an observable
  state change)
- **Transaction timing** (block inclusion time)
- **Counter increment/decrement amounts** (all Counter operations are public)
- **Map and Set operation arguments** (keys, values, and elements are public)
- **The `disclose()`d values** (by definition, these are intentionally public)

### Hidden by ZK Proofs

These are protected within the zero-knowledge proof:

- **Witness function return values** (unless explicitly disclosed)
- **Internal circuit computations** (intermediate variables)
- **Values passed to `MerkleTree.insert()` and `HistoricMerkleTree.insert()`**
  (the only ledger operations that hide their data argument)
- **The specific leaf proven in a Merkle membership proof** (the observer sees
  only the root check, not which leaf was used)

### Correlation Attacks

Even with correct use of ZK proofs, metadata can leak information:

- **Timing:** If only one user is registered, their transactions are trivially
  identifiable. Privacy depends on the size of the anonymity set.
- **Amount patterns:** If transaction amounts are unique (e.g., always exactly
  42 tokens), they can fingerprint users across transactions.
- **Tree size:** The number of `MerkleTree` insertions is observable (the tree
  index increments visibly via `insertIndex` or the tree fills up). This reveals
  the member count even though individual members are hidden.
- **Nullifier timing:** When a nullifier appears in the Set reveals when the
  corresponding member acted. If registration order is known and members act in
  order, timing correlates identities to nullifiers.
- **Circuit selection:** If different user roles call different circuits, the
  circuit name reveals the role.

### MerkleTree Leaf Guessing

If the set of possible leaf values is small, an observer can verify guesses
against the tree. For example, if there are only 10 known candidate public
keys, the observer can hash each one and check whether it appears as a leaf.

**Mitigation:** Use commitments with randomness as leaves instead of raw values.
This way, even if the observer knows all candidate values, they cannot verify
guesses without knowing the per-leaf randomness.

### Mitigation Strategies

| Attack | Mitigation |
|--------|------------|
| Small anonymity set | Add dummy members to increase the set size |
| Timing correlation | Introduce random delays; batch transactions |
| Amount fingerprinting | Standardize amounts; split into uniform denominations |
| Leaf guessing | Use committed values (with randomness) as MerkleTree leaves |
| Nullifier timing | Decouple registration order from action order |
| Circuit selection | Use a single circuit with internal branching where feasible |

## Anti-Patterns

Common mistakes that undermine privacy in Compact contracts.

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Using `Set` for private membership | Reveals which element is being checked via `member()` | Use `MerkleTree` + ZK path proof via `merkleTreePathRoot` |
| Missing domain separator on nullifiers | Different contracts' nullifiers can be correlated if derived from the same secret | Always prefix with unique `pad(32, "contract:purpose:")` |
| Disclosing at witness call site | Over-discloses: ALL downstream uses of the value lose privacy | Disclose as close to the disclosure point as possible |
| Same derivation for commitment and nullifier | Linking attack: observer matches commitments to nullifiers by comparing outputs | Use different domain separators or different input compositions |
| Storing raw secrets in sealed fields | Sealed values are visible on-chain at constructor time; `disclose()` is required | Store hash or commitment of the secret instead |
| Reusing salts across commitments | Breaks hiding: same value + same salt = same commitment output | Use unique randomness per commitment via witness-provided fresh bytes |
| Using `Map<address, balance>` for private balances | All inserts, lookups, and transfers are visible on-chain | Use shielded tokens (zswap) from `compact-tokens` |
| Disclosing MerkleTree leaf in `checkRoot` call | Defeats the purpose of anonymous membership proof | Let the ZK proof verify the path; only `disclose()` the digest |
| Using `persistentHash` to "hide" small-input-space witness data | Hash is one-way but without randomness, small input spaces (booleans, small integers) can be brute-forced; also does not clear witness taint | Use `persistentCommit` with randomness for brute-force resistance and taint clearing |
| Fixed nullifier without round counter | User can only ever perform one action across all rounds | Incorporate a round counter or unique context into nullifier derivation |
