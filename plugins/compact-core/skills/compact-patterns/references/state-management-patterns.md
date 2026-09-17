# State Management Patterns

Patterns for controlling the lifecycle and timing of contract operations.

## State Machine

**Purpose:** Enforce ordered phase transitions in multi-step protocols.
**Complexity:** Beginner
**Key Primitives:** `enum`, `assert`, transition functions

### When to Use

- Multi-phase protocols (registration, active, completed)
- Auctions, voting, crowdfunding with distinct phases
- Any workflow where operations are only valid in certain states

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export enum Phase { registration, active, completed }
export ledger phase: Phase;
export sealed ledger owner: Bytes<32>;
export ledger participants: Set<Bytes<32>>;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

constructor() {
  phase = Phase.registration;
  owner = disclose(get_public_key(local_secret_key()));
}

circuit requireOwner(): [] {
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == owner), "Not authorized");
}

// Phase-specific operations
export circuit register(participant: Bytes<32>): [] {
  assert(phase == Phase.registration, "Registration closed");
  participants.insert(disclose(participant));
}

// Auth-gated phase transition
export circuit activate(): [] {
  requireOwner();
  assert(phase == Phase.registration, "Can only activate from registration");
  assert(disclose(!participants.isEmpty()), "No participants registered");
  phase = Phase.active;
}

export circuit complete(): [] {
  requireOwner();
  assert(phase == Phase.active, "Not in active phase");
  phase = Phase.completed;
  // ... finalization logic
}
```

### Privacy Considerations

- The `phase` enum is public on-chain. Everyone can see the current phase.
- Phase transitions are visible transactions. An observer sees exactly when each
  phase change occurred.
- Participant registration (via `Set.insert`) is public. All registered public
  key hashes are visible on-chain.

### Test Considerations

- Verify each phase only allows its designated operations
- Verify phase transitions follow the correct order (registration -> active -> completed)
- Verify skipping a phase fails (e.g., registration -> completed)
- Verify backward transitions fail
- Verify only the owner can advance phases
- Test edge: activate with empty participants set should fail

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Not asserting the current phase | `assert(phase == Phase.registration, "msg")` | Without checks, operations run in wrong phases |
| Allowing any user to advance phases | Gate transitions with `requireOwner()` | Unauthorized phase changes break protocol |

---

## Time-Locked Operations

**Purpose:** Enforce deadlines on contract actions using block time.
**Complexity:** Intermediate
**Key Primitives:** `blockTimeGte`, `blockTimeLt`, `sealed ledger`

### When to Use

- Auctions with bid deadlines
- Vesting schedules that unlock funds over time
- Commit-reveal protocols with phase deadlines
- Any operation that should only execute after (or before) a certain time

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

// Deadlines set at deployment (Unix epoch seconds as Uint<64>)
export sealed ledger lockEndTime: Uint<64>;
export sealed ledger owner: Bytes<32>;
export ledger isExecuted: Boolean;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}

constructor(endTime: Uint<64>) {
  lockEndTime = disclose(endTime);
  owner = disclose(get_public_key(local_secret_key()));
  isExecuted = false;
}

circuit requireOwner(): [] {
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == owner), "Not authorized");
}

// Can only be called AFTER the lock period ends
export circuit executeAfterLock(): [] {
  requireOwner();
  assert(!isExecuted, "Already executed");
  assert(blockTimeGte(lockEndTime), "Lock period not over");
  isExecuted = true;
  // ... perform the time-locked action
}

// Can only be called BEFORE the deadline
export circuit submitBeforeDeadline(value: Bytes<32>): [] {
  assert(blockTimeLt(lockEndTime), "Deadline passed");
  // ... accept submission
}
```

### Combining with State Machine

Time-locks are most powerful when combined with a state machine:

```compact
export enum Phase { commit, reveal, finalized }
export ledger phase: Phase;
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
  // ... tally results, distribute funds
}
```

### Privacy Considerations

- Deadlines stored in `sealed ledger` are visible on-chain at deployment time.
  Everyone can see when phases start and end.
- `blockTimeGte` / `blockTimeLt` compare against the block time, which is
  approximate (determined by block production, not wall clock). Allow buffer
  time for block time variability.

### Test Considerations

- Verify action fails before the deadline
- Verify action succeeds after the deadline
- Test at the exact boundary (equal to deadline) — `blockTimeGte` includes equality
- Verify `blockTimeLt` excludes the boundary
- Test with multiple time-locked phases in sequence
- Account for block time granularity (not precise to the second)

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `blockTimeGte(deadline)` with witness-derived deadline | `blockTimeGte(lockEndTime)` using ledger value | Deadline should be on-chain, not witness-provided (could be spoofed) |
| Tight time windows (seconds) | Use hours or larger windows | Block time is approximate; tight windows cause race conditions |
| Forgetting `disclose()` on witness-derived time values | `blockTimeGte(disclose(time))` | Time arguments from witnesses need disclosure |
