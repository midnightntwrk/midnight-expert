# Privacy Patterns

Patterns for preserving user privacy in contract interactions.

## Round-Based Unlinkability

**Purpose:** Break the link between successive transactions from the same user.
**Complexity:** Intermediate
**Key Primitives:** `Counter`, `persistentHash` with round input, authority rotation

### When to Use

- Single-user authorization where you want to hide that the same user
  authorized multiple transactions
- Contracts where transaction linkability is a privacy concern
- Any scenario where an observer should not be able to correlate transactions
  to the same actor

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger authority: Bytes<32>;
export ledger round: Counter;

witness local_secret_key(): Bytes<32>;

// Round-specific public key derivation
circuit publicKey(currentRound: Field, sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "myapp:round-pk:"),
    currentRound as Bytes<32>,
    sk
  ]);
}

constructor() {
  const sk = local_secret_key();
  authority = disclose(publicKey(0, sk));
  round.increment(1);
}

export circuit authorize(): [] {
  const sk = local_secret_key();
  const currentRound = round.read() as Field;
  const pk = publicKey(currentRound, sk);

  // Verify caller matches current round authority
  assert(disclose(authority == pk), "Not authorized");

  // Rotate to next round
  round.increment(1);
  const nextRound = round.read() as Field;
  authority = disclose(publicKey(nextRound, sk));
}
```

### How It Works

Each transaction:
1. Reads the current round counter
2. Derives the expected public key for this round (incorporating the counter)
3. Asserts it matches the stored authority
4. Increments the round counter
5. Computes and stores the next round's authority

The observer sees a different authority hash with each transaction. Without
knowing the secret key, they cannot determine that the same user authorized
all transactions.

### Privacy Considerations

- **Transaction unlinkability:** Each transaction shows a different authority
  hash. An observer cannot link them without the secret key.
- **Deployment linkability:** The constructor sets the first authority. This
  is a unique event and can be linked to the deployer. Subsequent transactions
  are unlinkable to each other.
- **Round counter visibility:** The `Counter` is public. The observer can see
  how many authorizations have occurred (the total count).
- **No backward linkability:** An observer who sees the current authority cannot
  compute previous authorities without the secret key.

### Test Considerations

- Verify authorization succeeds with correct secret key
- Verify authority rotates after each authorization
- Verify old authority values cannot be reused
- Verify different secret keys produce different authority chains
- Verify the round counter increments correctly

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Fixed public key without round | Include round counter in derivation | Fixed key links all transactions together |
| Forgetting to increment round after authorization | Always increment and rotate | Without rotation, the pattern provides no unlinkability |
| Using the same domain separator as other contracts | Unique domain: `"myapp:round-pk:"` | Cross-contract domain reuse enables linking |

---

## Selective Disclosure

**Purpose:** Prove properties about private data without revealing the data itself.
**Complexity:** Intermediate
**Key Primitives:** `disclose()` on boolean results, `persistentCommit`

### When to Use

- Age verification ("over 18") without revealing exact age
- Balance checks ("sufficient funds") without revealing exact balance
- Credential proofs ("qualified") without revealing qualification details
- Any scenario where the question is boolean but the underlying data is private

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger credentialCommitment: Bytes<32>;

witness getCredentialValue(): Uint<64>;
witness getCredentialSalt(): Bytes<32>;

// Verify the witness value matches the on-chain commitment,
// then disclose ONLY the boolean result of the comparison
circuit verifyCredential(): Uint<64> {
  const value = getCredentialValue();
  const salt = getCredentialSalt();
  const expected = persistentCommit<Uint<64>>(value, salt);
  assert(disclose(expected == credentialCommitment), "Invalid credential");
  return value;
}

// Threshold check: prove value >= threshold
export circuit meetsThreshold(threshold: Uint<64>): Boolean {
  const value = verifyCredential();
  // ONLY the boolean result is disclosed, NOT the value
  return disclose(value >= threshold);
}

// Range check: prove value is within bounds
export circuit withinRange(minimum: Uint<64>, maximum: Uint<64>): Boolean {
  const value = verifyCredential();
  return disclose(value >= minimum && value <= maximum);
}

// Equality check: prove value equals a specific target
export circuit equalsValue(target: Uint<64>): Boolean {
  const value = verifyCredential();
  return disclose(value == target);
}

// Selective field disclosure from a multi-field profile
witness getProfile(): [Bytes<32>, Uint<64>, Uint<64>];

export circuit proveAgeAbove(minAge: Uint<64>): Boolean {
  const profile = getProfile();
  // profile[0] = name (NOT disclosed)
  // profile[1] = age (comparison result disclosed)
  // profile[2] = income (NOT disclosed)
  return disclose(profile[1] >= minAge);
}

export circuit proveIncomeInRange(minIncome: Uint<64>, maxIncome: Uint<64>): Boolean {
  const profile = getProfile();
  // Only the income range check is disclosed
  return disclose(profile[2] >= minIncome && profile[2] <= maxIncome);
}
```

### The Key Technique

The critical distinction:

```compact
// WRONG: reveals the actual value
return disclose(value);

// CORRECT: reveals only whether the condition is met
return disclose(value >= threshold);
```

The observer learns "yes, the condition is met" or "no, it is not." They do NOT
learn the actual value. This is the fundamental building block of zero-knowledge
proofs in practice.

### Privacy Considerations

- The observer sees the boolean result and the threshold/range parameters.
- The observer does NOT see the actual credential value.
- The threshold parameters are public (they come from the circuit call). If
  the threshold itself should be private, derive it from a witness.
- Multiple checks with different thresholds can narrow down the actual value.
  For example, checking "age >= 18" then "age >= 21" tells the observer the
  age is at least 21. Consider this in protocol design.

### Test Considerations

- Verify threshold check returns true when value >= threshold
- Verify threshold check returns false when value < threshold
- Verify range check works at boundaries (exactly at minimum and maximum)
- Verify invalid credential (wrong salt) is rejected
- Verify the actual value is not visible in the transaction
- Test with multiple selective disclosure checks on the same credential

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `return disclose(value)` | `return disclose(value >= threshold)` | Disclosing the value exposes the private data |
| Not verifying credential commitment first | Always check `expected == credentialCommitment` | Without verification, witness could provide any value |
| Using `persistentHash` for credential commitment | Use `persistentCommit` with salt | Hash is brute-forceable on small value spaces; commit with blinding is not |
