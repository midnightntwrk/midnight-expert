# Identity & Membership Patterns

Patterns for managing identities, membership lists, and credentials.

## Registry / Allowlist

**Purpose:** Maintain a managed list of authorized entities.
**Complexity:** Beginner
**Key Primitives:** `Set<Bytes<32>>`, admin gates

### When to Use

- Whitelisting addresses for token sales or airdrops
- Managing a list of authorized service providers
- Gating access to contract features based on registration

### Implementation

```compact
pragma language_version >= 0.22;
import CompactStandardLibrary;

export ledger allowlist: Set<Bytes<32>>;
export sealed ledger admin: Bytes<32>;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:registry:pk:"), sk
  ]);
}

constructor() {
  admin = disclose(get_public_key(local_secret_key()));
}

circuit requireAdmin(): [] {
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == admin), "Not admin");
}

// Guard: require caller to be on the allowlist
circuit requireAllowlisted(): [] {
  const sk = local_secret_key();
  const pk = disclose(get_public_key(sk));
  assert(allowlist.member(pk), "Not on allowlist");
}

// Admin adds an address to the allowlist
export circuit addToAllowlist(pk: Bytes<32>): [] {
  requireAdmin();
  allowlist.insert(disclose(pk));
}

// Admin removes an address from the allowlist
export circuit removeFromAllowlist(pk: Bytes<32>): [] {
  requireAdmin();
  allowlist.remove(disclose(pk));
}

// Example: allowlisted-only action
export circuit restrictedAction(): [] {
  requireAllowlisted();
  // ... only allowlisted users can do this
}
```

### Privacy Considerations

- The `allowlist` Set is public on-chain. All registered public key hashes are
  visible. Anyone can see who is on the list and the total list size.
- Adding and removing entries is visible.
- For private membership, use the Anonymous Membership (Merkle Auth) pattern
  instead, which hides individual member identity.

### Test Considerations

- Verify admin can add and remove entries
- Verify non-admin cannot modify the list
- Verify allowlisted user can call restricted circuits
- Verify non-allowlisted user is rejected
- Verify removing a user prevents further access
- Test adding the same user twice (should be idempotent)

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Not checking membership before lookup | Always use `member()` before acting on membership | `lookup()` on a missing key throws a runtime error (ExpectedCell) |
| Using `Map` when only membership matters | Use `Set` for boolean membership | `Set` is simpler and more appropriate when you only need to track existence |

---

## Credential Verification

**Purpose:** Prove a property about private data without revealing the data itself.
**Complexity:** Intermediate
**Key Primitives:** `persistentCommit`, threshold checks, `disclose()` on booleans

### When to Use

- Age verification without revealing exact age
- Income verification without revealing exact income
- KYC compliance without storing personal data on-chain
- Verifiable credentials with selective disclosure

### Implementation

```compact
pragma language_version >= 0.22;
import CompactStandardLibrary;

export ledger credentialCommitment: Bytes<32>;
export ledger isCredentialSet: Boolean;

witness getCredentialValue(): Uint<64>;
witness getCredentialSalt(): Bytes<32>;
witness storeCredential(value: Uint<64>, salt: Bytes<32>): [];

// Issue a credential: commit the value on-chain, store value off-chain
export circuit issueCredential(value: Uint<64>): [] {
  assert(!isCredentialSet, "Credential already issued");
  const salt = getCredentialSalt();
  const commitment = persistentCommit<Uint<64>>(value, salt);
  storeCredential(value, salt);
  credentialCommitment = disclose(commitment);
  isCredentialSet = true;
}

// Verify: prove the credential value meets a threshold
// Only the boolean result is disclosed — NOT the actual value
export circuit verifyThreshold(threshold: Uint<64>): Boolean {
  assert(isCredentialSet, "No credential issued");
  const value = getCredentialValue();
  const salt = getCredentialSalt();

  // Verify the witness value matches the on-chain commitment
  const expected = persistentCommit<Uint<64>>(value, salt);
  assert(disclose(expected == credentialCommitment), "Invalid credential");

  // Disclose only the boolean result, NOT the value
  return disclose(value >= threshold);
}

// Verify: prove the credential value is within a range
export circuit verifyRange(minimum: Uint<64>, maximum: Uint<64>): Boolean {
  assert(isCredentialSet, "No credential issued");
  const value = getCredentialValue();
  const salt = getCredentialSalt();
  const expected = persistentCommit<Uint<64>>(value, salt);
  assert(disclose(expected == credentialCommitment), "Invalid credential");

  // Disclose the combined range check as a single boolean
  return disclose(value >= minimum && value <= maximum);
}
```

### Privacy Considerations

- The credential commitment is public on-chain but reveals nothing about the
  actual value (due to the blinding factor in `persistentCommit`).
- Threshold checks (`value >= threshold`) disclose only the boolean result.
  The actual value stays private within the ZK proof.
- An observer sees: (1) that a credential exists, (2) whether it meets
  the threshold, (3) when checks were performed.
- The observer does NOT see: the actual credential value or the salt.

### Test Considerations

- Verify credential issuance stores correct commitment
- Verify threshold check passes when value >= threshold
- Verify threshold check fails when value < threshold
- Verify range check works for values within and outside range
- Verify tampered credential (wrong value or salt) fails commitment check
- Verify credential cannot be re-issued (double issuance guard)

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `return disclose(value)` | `return disclose(value >= threshold)` | Disclosing the value defeats the purpose — only disclose the boolean result |
| Using `persistentHash` for credentials | Use `persistentCommit` with salt | Hash doesn't hide the value if the value space is small; commit with random blinding does |

---

## Domain-Separated Identity

**Purpose:** Derive multiple distinct keys from a single secret using domain separators.
**Complexity:** Beginner
**Key Primitives:** `persistentHash`, `pad`, domain prefix strings

### When to Use

- Contracts where one user needs multiple identities for different purposes
- Preventing cross-contract identity linking
- Deriving nullifiers, public keys, and commitment keys independently

### Implementation

```compact
pragma language_version >= 0.22;
import CompactStandardLibrary;

witness local_secret_key(): Bytes<32>;

// Generic domain-separated key derivation
circuit deriveKey(domain: Bytes<32>, sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([domain, sk]);
}

// Specific key derivations with distinct domains
circuit publicKey(sk: Bytes<32>): Bytes<32> {
  return deriveKey(pad(32, "myapp:pk:"), sk);
}

circuit nullifierKey(sk: Bytes<32>): Bytes<32> {
  return deriveKey(pad(32, "myapp:nul:"), sk);
}

circuit commitmentKey(sk: Bytes<32>): Bytes<32> {
  return deriveKey(pad(32, "myapp:commit:"), sk);
}

// Multi-contract domain separation
circuit contractSpecificKey(contractName: Bytes<32>, sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "myapp:contract:"),
    contractName,
    sk
  ]);
}
```

### Domain Separator Guidelines

| Domain | Format | Purpose |
|--------|--------|---------|
| Public key | `pad(32, "myapp:pk:")` | Identity verification |
| Nullifier | `pad(32, "myapp:nul:")` | Double-action prevention |
| Commitment | `pad(32, "myapp:commit:")` | Value hiding |
| Round-specific | Include round counter in vector | Unlinkability |
| Cross-contract | Include contract name in vector | Prevent cross-contract linking |

**Rules:**
1. Every domain separator MUST be unique within the contract
2. Use your app/contract name as a prefix (e.g., `"myapp:"`)
3. Keep separators human-readable for debugging
4. Never reuse a domain separator for two different purposes

### Privacy Considerations

- Each derived key is independent — knowing one key reveals nothing about
  others derived from the same secret (due to hash preimage resistance).
- An observer cannot determine that two different keys came from the same secret.
- The domain separator strings are embedded in the ZK circuit but are NOT
  visible on-chain unless explicitly disclosed.

### Test Considerations

- Verify different domains produce different keys from the same secret
- Verify same domain + same secret always produces the same key (deterministic)
- Verify different secrets with the same domain produce different keys
- Verify derived keys cannot be reverse-engineered to find the secret

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Same domain for public key and nullifier | Distinct domains: `"pk:"` vs `"nul:"` | Same domain enables linking public keys to nullifiers |
| No app-level prefix | `pad(32, "myapp:pk:")` with app name | Prevents cross-application domain collisions |
| Short domain strings without padding | `pad(32, "...")` for consistent 32-byte input | `persistentHash` expects consistent input sizes |

---

## Anonymous Membership (Merkle Auth)

**Purpose:** Prove membership in a group without revealing which member you are.
**Complexity:** Advanced
**Key Primitives:** `HistoricMerkleTree`, `merkleTreePathRoot`, `checkRoot`, nullifiers

### When to Use

- Anonymous voting where voter identity must be hidden
- Private club access where membership is verified but identity is not
- Any scenario where "prove you belong" matters but "prove who you are" must be avoided

### Implementation

```compact
pragma language_version >= 0.22;
import CompactStandardLibrary;

export ledger members: HistoricMerkleTree<16, Bytes<32>>;
export ledger usedNullifiers: Set<Bytes<32>>;
export sealed ledger admin: Bytes<32>;

witness local_secret_key(): Bytes<32>;
witness getMemberPath(pk: Bytes<32>): MerkleTreePath<16, Bytes<32>>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:member:pk:"), sk
  ]);
}

constructor() {
  admin = disclose(get_public_key(local_secret_key()));
}

// Admin adds a member (leaf is hidden — leaf_hash() applied before storing; privacy also comes from membership proofs not revealing which leaf)
export circuit addMember(memberPk: Bytes<32>): [] {
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == admin), "Not admin");
  members.insert(disclose(memberPk));
}

// Member proves membership anonymously and performs a one-time action
export circuit memberAction(): [] {
  const sk = local_secret_key();
  const pk = get_public_key(sk);

  // Step 1: Get Merkle proof from off-chain state
  const path = getMemberPath(pk);

  // Step 2: Compute root from leaf + path
  const digest = merkleTreePathRoot<16, Bytes<32>>(path);

  // Step 3: Verify against on-chain tree
  assert(members.checkRoot(disclose(digest)), "Not a member");

  // Step 4: Nullifier prevents reuse
  const nul = disclose(persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:member:act-nul:"), sk
  ]));
  assert(!usedNullifiers.member(nul), "Already acted");
  usedNullifiers.insert(nul);

  // ... perform the action
}
```

### Why HistoricMerkleTree

Use `HistoricMerkleTree<N, T>` instead of `MerkleTree<N, T>` when members are
added over time. `HistoricMerkleTree.checkRoot()` accepts proofs against any
prior version of the tree, so a proof generated before new members were added
remains valid. With plain `MerkleTree`, each insertion changes the root and
invalidates all existing proofs.

### Keep the checkRoot Result Constant

Step 3 above asserts on `checkRoot` immediately rather than storing the result.
That is load-bearing. `checkRoot` is a ledger operation and its Boolean result is
written to the public transcript, tagged with the ledger field checked. Asserting
immediately means every transaction that lands carries `true`, so the published
bit is constant and reveals nothing.

Do not capture the result and branch on it to build optional or threshold
membership across several trees:

```compact
// Anti-pattern: leaks which trees the caller belongs to
const inA = treeA.checkRoot(disclose(rootA));
const inB = treeB.checkRoot(disclose(rootB));
assert(inA || inB, "not a member of either");
```

Each result reaches the transcript separately, so the pattern is directly readable
even though `inA || inB` is never disclosed. Use one shared tree with the category
folded into the leaf instead, and assert inside the circuit that the categories
differ. See "checkRoot Publishes Its Result" in `compact-privacy-disclosure`.

### Capacity Planning

| Depth (N) | Max Members | Proof Size |
|-----------|-------------|------------|
| 10 | 1,024 | 10 hashes |
| 16 | 65,536 | 16 hashes |
| 20 | 1,048,576 | 20 hashes |

Deeper trees support more members but increase circuit cost. Choose based on
expected membership size.

### Privacy Considerations

- **The observer sees:** A valid membership proof was presented and a new nullifier
  appeared, but NOT which member acted.
- **Leaf guessing caveat:** If the set of possible members is small (e.g., 10
  candidates), an observer can verify guesses. Mitigate by using committed
  values (with randomness) as leaves instead of raw public keys.
- **Nullifier timing:** When a nullifier appears reveals when the member acted.
  If registration order is known, timing can correlate identities to nullifiers.
- **Tree size:** The number of insertions is observable (index increments), so
  the member count is visible even though individual members are hidden.

### Test Considerations

- Verify member can prove membership with valid Merkle path
- Verify non-member is rejected (invalid path)
- Verify nullifier prevents double-action
- Verify proof works after new members are added (HistoricMerkleTree)
- Test at tree capacity boundary (2^N members)
- Verify stale proofs still work (historic root checking)

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Using `Set` for private membership | Use `MerkleTree` + ZK path | Set reveals which element is checked via `member()` |
| Using `MerkleTree` instead of `HistoricMerkleTree` | `HistoricMerkleTree` when members added over time | Plain MerkleTree invalidates proofs on insertion |
| Disclosing the Merkle leaf | Only `disclose()` the root digest | Disclosing the leaf reveals which member is acting |
