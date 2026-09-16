# Common Compact Patterns

Proven patterns for building Midnight Compact smart contracts.

## Authentication Pattern

Hash-based identity verification using `persistentHash`. This is not public-key cryptography — it relies on hash preimage resistance within the ZK circuit.

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export sealed ledger owner: Bytes<32>;

witness local_secret_key(): Bytes<32>;

// Derive a public key from a secret key via hashing
// public_key() is NOT a built-in — this is the standard pattern
circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

constructor() {
  owner = disclose(get_public_key(local_secret_key()));
}

export circuit authenticatedAction(): [] {
  const sk = local_secret_key();
  const caller = get_public_key(sk);
  assert(disclose(caller == owner), "Not authorized");
  // ... perform action
}
```

### With Round-Based Unlinkability

Adding a round counter prevents linking multiple transactions to the same user:

```compact
export ledger authority: Bytes<32>;
export ledger round: Counter;

witness local_secret_key(): Bytes<32>;

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

Each transaction rotates the on-chain authority hash, breaking the link between transactions.

## Commit-Reveal Pattern

Two-phase scheme: commit a hidden value, then reveal it later with proof.

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger commitment: Bytes<32>;
export ledger revealedValue: Field;
export ledger isRevealed: Boolean;

witness local_secret_key(): Bytes<32>;
witness storeSecretValue(v: Field): [];
witness getSecretValue(): Field;

circuit computeCommitment(value: Field, salt: Bytes<32>): Bytes<32> {
  const valueBytes = value as Bytes<32>;
  return persistentHash<Vector<2, Bytes<32>>>([valueBytes, salt]);
}

// Phase 1: Commit — store hash on-chain, value off-chain
export circuit commit(value: Field): [] {
  const salt = local_secret_key();
  storeSecretValue(value);
  commitment = disclose(computeCommitment(value, salt));
  isRevealed = false;
}

// Phase 2: Reveal — prove stored value matches commitment
export circuit reveal(): Field {
  const salt = local_secret_key();
  const value = getSecretValue();
  const expected = computeCommitment(value, salt);
  assert(disclose(expected == commitment), "Value does not match commitment");
  assert(disclose(!isRevealed), "Already revealed");

  revealedValue = disclose(value);
  isRevealed = true;
  return disclose(value);
}
```

## Access Control with Roles

Map-based role management for multi-user access control:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export enum Role { admin, operator, viewer }
export ledger roles: Map<Bytes<32>, Role>;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

circuit requireRole(required: Role): [] {
  const sk = local_secret_key();
  const caller = disclose(get_public_key(sk));
  assert(roles.member(caller), "No role assigned");
  assert(disclose(roles.lookup(caller) == required), "Insufficient permissions");
}

export circuit adminAction(): [] {
  requireRole(Role.admin);
  // ... admin-only logic
}

export circuit grantRole(target: Bytes<32>, role: Role): [] {
  requireRole(Role.admin);
  roles.insert(disclose(target), disclose(role));
}
```

## Merkle Tree Membership Proof

Privacy-preserving set membership using Merkle trees. Unlike `Set<T>`, Merkle trees hide which element's membership is being proven.

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger eligibleVoters: HistoricMerkleTree<10, Bytes<32>>;
export ledger voted: Set<Bytes<32>>;

witness local_secret_key(): Bytes<32>;
witness getVoterPath(pk: Bytes<32>): MerkleTreePath<10, Bytes<32>>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

// Register a voter (admin-only, reveals voter identity)
export circuit registerVoter(voterPk: Bytes<32>): [] {
  eligibleVoters.insert(disclose(voterPk));
}

// Cast a vote — proves membership without revealing which voter
export circuit vote(): [] {
  const sk = local_secret_key();
  const pk = get_public_key(sk);

  // Get Merkle proof from local witness (off-chain lookup)
  const path = getVoterPath(pk);

  // Verify the Merkle proof — this is REQUIRED for security
  const digest = merkleTreePathRoot<10, Bytes<32>>(path);
  assert(eligibleVoters.checkRoot(disclose(digest)), "Not eligible voter");

  // Nullifier to prevent double voting (unique per voter)
  const nullifier = persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:nullifier:"), sk
  ]);

  assert(disclose(!voted.member(disclose(nullifier))), "Already voted");
  voted.insert(disclose(nullifier));

  // ... record the vote
}
```

## State Machine Pattern

Using enums to enforce valid state transitions:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export enum Phase { registration, active, completed }
export ledger phase: Phase;
export ledger participants: Set<Bytes<32>>;

constructor() {
  phase = Phase.registration;
}

export circuit register(participant: Bytes<32>): [] {
  assert(phase == Phase.registration, "Registration closed");
  participants.insert(disclose(participant));
}

export circuit activate(): [] {
  assert(phase == Phase.registration, "Already activated");
  assert(disclose(!participants.isEmpty()), "No participants");
  phase = Phase.active;
}

export circuit complete(): [] {
  assert(phase == Phase.active, "Not active");
  phase = Phase.completed;
  // ... finalization logic
}
```

## Token Balance Pattern

Private balance tracking using Maps:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger balances: Map<Bytes<32>, Uint<64>>;
export ledger totalSupply: Counter;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

export circuit mint(to: Bytes<32>, amount: Uint<64>): [] {
  const d_to = disclose(to);
  const d_amount = disclose(amount);

  if (balances.member(d_to)) {
    const current = balances.lookup(d_to);
    balances.insert(d_to, (current + d_amount) as Uint<64>);
  } else {
    balances.insert(d_to, d_amount);
  }
  totalSupply.increment(d_amount as Uint<16>);
}

export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
  const sk = local_secret_key();
  const sender = get_public_key(sk);
  const d_sender = disclose(sender);
  const d_to = disclose(to);
  const d_amount = disclose(amount);

  assert(balances.member(d_sender), "No balance");
  const senderBalance = balances.lookup(d_sender);
  assert(senderBalance >= d_amount, "Insufficient balance");

  balances.insert(d_sender, (senderBalance - d_amount) as Uint<64>);

  if (balances.member(d_to)) {
    const receiverBalance = balances.lookup(d_to);
    balances.insert(d_to, (receiverBalance + d_amount) as Uint<64>);
  } else {
    balances.insert(d_to, d_amount);
  }
}
```

**Note**: In this pattern, balances are public on-chain because Map operations disclose their arguments. For fully private balances, use the Midnight token/coin system with `ShieldedCoinInfo` and the zswap protocol.

## Disclosure Rules Summary

| Situation | Requires `disclose()` | Example |
|-----------|----------------------|---------|
| Witness value in `if` condition | Yes | `if (disclose(secret == guess))` |
| Witness value written to ledger | Yes | `owner = disclose(pk)` |
| Witness value in `assert` | No | `assert(x > 0, "msg")` — harmless but unnecessary to use `disclose()` |
| Circuit param to ledger ADT method | Yes | `map.insert(disclose(key), v)` |
| Pure computation on witness values | No | `const hash = persistentHash(secret)` |
| Returning witness value from exported circuit | Yes | `return disclose(value)` |

> **Note:** `assert` conditions do not require `disclose()`, but values that flow from the assert branch to ledger writes, function returns, or other disclosure contexts still require `disclose()` at those points.
