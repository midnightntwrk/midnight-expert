# Access Control Patterns

Patterns for controlling who can call which circuits. These are foundational
building blocks — most contracts need at least one access control pattern.

## Owner-Only

**Purpose:** Restrict circuit execution to a single administrator.
**Complexity:** Beginner
**Key Primitives:** `sealed ledger`, `persistentHash`, `assert`

### When to Use

- Single admin who deploys and manages the contract
- Simple contracts where one person controls all operations
- Starting point before adding more complex access control

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

// Owner set at deployment, immutable
export sealed ledger owner: Bytes<32>;

witness local_secret_key(): Bytes<32>;

// Derive a public key from a secret key via hashing
// public_key() is NOT a builtin — this is the standard pattern
circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

constructor() {
  // Set the deployer as owner (sealed = immutable after constructor)
  owner = disclose(get_public_key(local_secret_key()));
}

// Guard circuit — reuse in any owner-only operation
circuit requireOwner(): [] {
  const sk = local_secret_key();
  const caller = get_public_key(sk);
  assert(disclose(caller == owner), "Not authorized");
}

// Example: owner-only action
export circuit adminAction(value: Field): [] {
  requireOwner();
  // ... perform admin-only logic
}
```

### Privacy Considerations

- The `owner` field is `sealed`, meaning it is set once at deployment and visible
  on-chain. The owner's public key hash is therefore public.
- The `assert(disclose(caller == owner))` reveals whether the caller matched, but
  since the circuit fails on mismatch, in practice only the owner can call it.
- An observer can see that an admin action occurred but cannot learn the owner's
  secret key from the hash.

### Test Considerations

- Verify owner can call admin circuits successfully
- Verify non-owner gets assertion failure
- Verify owner field cannot be changed after construction (sealed guarantee)
- Test with a second user who has a different secret key

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `export ledger owner: Bytes<32>` | `export sealed ledger owner: Bytes<32>` | Without `sealed`, owner can be reassigned |
| `assert(caller == owner, "msg")` | `assert(disclose(caller == owner), "msg")` | Witness-derived comparison needs `disclose()` |
| `public_key(sk)` | `get_public_key(sk)` using `persistentHash` | `public_key` is not a builtin |
| `assert(ownPublicKey() == owner, "msg")` | `assert(disclose(get_public_key(local_secret_key()) == owner), "msg")` | `ownPublicKey()` is prover-supplied (the circuit-context `coinPublicKey`), not bound to the transaction signer — any caller can supply any value, so it is bypassable for authorization. Derive identity from a witness secret. Its only safe use is routing shielded tokens *to* the caller. |

---

## Role-Based Access Control (RBAC)

**Purpose:** Support multiple roles with different permission levels.
**Complexity:** Intermediate
**Key Primitives:** `Map<Bytes<32>, Role>`, `enum`, `assert`

### When to Use

- Multiple users with different permission levels
- Need to grant and revoke roles dynamically
- Contracts with admin, operator, and viewer tiers

### Implementation

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

// Initialize deployer as admin
constructor() {
  const pk = get_public_key(local_secret_key());
  roles.insert(disclose(pk), Role.admin);
}

// Guard: require caller to have a specific role
circuit requireRole(required: Role): [] {
  const sk = local_secret_key();
  const caller = disclose(get_public_key(sk));
  assert(roles.member(caller), "No role assigned");
  assert(disclose(roles.lookup(caller) == required), "Insufficient permissions");
}

// Admin-only: grant a role to another user
export circuit grantRole(target: Bytes<32>, role: Role): [] {
  requireRole(Role.admin);
  roles.insert(disclose(target), disclose(role));
}

// Admin-only: revoke a role
export circuit revokeRole(target: Bytes<32>): [] {
  requireRole(Role.admin);
  roles.remove(disclose(target));
}

// Example: operator-only action
export circuit operatorAction(): [] {
  requireRole(Role.operator);
  // ... operator-only logic
}

// Example: admin-only action
export circuit adminAction(): [] {
  requireRole(Role.admin);
  // ... admin-only logic
}
```

### Privacy Considerations

- The `roles` Map is public on-chain. All role assignments (who has which role)
  are visible. The public key hashes used as keys are observable.
- An observer can see how many roles are assigned and when grants/revocations occur.
- For private role management, consider using `MerkleTree` with committed role
  identifiers instead of a `Map`. See the Anonymous Membership pattern.

### Test Considerations

- Verify admin can grant and revoke roles
- Verify operator can call operator circuits but not admin circuits
- Verify unregistered user (no role) cannot call any guarded circuit
- Verify admin cannot accidentally remove their own admin role (consider adding a self-revocation check)
- Test role transition: grant operator, then upgrade to admin

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `roles.lookup(caller) == Role.admin` without `disclose()` | `disclose(roles.lookup(caller) == required)` | Witness comparison needs disclosure |
| Checking role without checking `member()` first | Check `roles.member(caller)` before `roles.lookup(caller)` | `lookup` on non-existent key throws a runtime error (ExpectedCell); always check `member()` first |

---

## Pausable / Emergency Stop

**Purpose:** Allow halting all contract operations in an emergency.
**Complexity:** Intermediate
**Key Primitives:** `Boolean` ledger field, guard circuits

### When to Use

- DeFi contracts where a vulnerability may require halting trades
- Any contract that benefits from an emergency stop mechanism
- Contracts handling valuable assets where caution is warranted

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export sealed ledger owner: Bytes<32>;
export ledger isPaused: Boolean;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

constructor() {
  owner = disclose(get_public_key(local_secret_key()));
  isPaused = false;
}

circuit requireOwner(): [] {
  const sk = local_secret_key();
  const caller = get_public_key(sk);
  assert(disclose(caller == owner), "Not authorized");
}

// Guard: only callable when NOT paused
circuit assertNotPaused(): [] {
  assert(!isPaused, "Contract is paused");
}

// Guard: only callable when paused
circuit assertPaused(): [] {
  assert(isPaused, "Contract is not paused");
}

// Owner can pause the contract
export circuit pause(): [] {
  requireOwner();
  assertNotPaused();
  isPaused = true;
}

// Owner can unpause the contract
export circuit unpause(): [] {
  requireOwner();
  assertPaused();
  isPaused = false;
}

// Example: guarded circuit
export circuit normalOperation(): [] {
  assertNotPaused();
  // ... normal logic that should be halted in emergencies
}
```

### Privacy Considerations

- `isPaused` is a public Boolean on-chain. Anyone can see whether the contract
  is currently paused.
- Pause/unpause transactions are visible, including their timing.
- This is intentional: users need to know if a contract is paused before
  attempting transactions.

### Test Considerations

- Verify `normalOperation` works when not paused
- Verify `normalOperation` fails when paused
- Verify only owner can pause and unpause
- Verify double-pause fails (already paused)
- Verify double-unpause fails (not paused)
- Test that pause state persists across multiple transactions

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Forgetting to add `assertNotPaused()` to new circuits | Add to every user-facing circuit | New circuits silently bypass the pause mechanism |
| Pausing without an unpause path | Always include `unpause()` | Permanent pause locks all contract funds |

---

## Initializable

**Purpose:** One-time setup guard for contracts that cannot use constructors.
**Complexity:** Beginner
**Key Primitives:** `Boolean` ledger field

### When to Use

- Contracts deployed via factory patterns (no constructor args available)
- Multi-step initialization that cannot fit in a constructor
- Modular contracts where initialization happens after deployment

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger isInitialized: Boolean;
export ledger adminPk: Bytes<32>;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

// Guard: ensure initialization has happened
circuit assertInitialized(): [] {
  assert(isInitialized, "Contract not initialized");
}

// Guard: ensure initialization has NOT happened
circuit assertNotInitialized(): [] {
  assert(!isInitialized, "Already initialized");
}

// One-time setup — can only be called once
export circuit initialize(config: Bytes<32>): [] {
  assertNotInitialized();
  adminPk = disclose(get_public_key(local_secret_key()));
  // ... set up other initial state using config
  isInitialized = true;
}

// Example: circuit that requires initialization
export circuit doSomething(): [] {
  assertInitialized();
  // ... logic that depends on initialization
}
```

### Privacy Considerations

- `isInitialized` is public on-chain. Anyone can see whether the contract has
  been initialized.
- The initialization transaction itself is visible, including when it occurred.

### Test Considerations

- Verify `initialize()` can be called once successfully
- Verify second call to `initialize()` fails
- Verify guarded circuits fail before initialization
- Verify guarded circuits succeed after initialization

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Using `initialize()` without `assertNotInitialized()` | Always check `assertNotInitialized()` first | Without the guard, anyone can re-initialize and overwrite state |
| Forgetting `assertInitialized()` on operational circuits | Add to every circuit that depends on init state | Circuits may operate on uninitialized (default) state |
