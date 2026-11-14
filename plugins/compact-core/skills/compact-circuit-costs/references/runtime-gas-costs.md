# Runtime Gas Costs

Detailed reference for understanding the Midnight runtime gas model. Gas costs are separate from circuit/proving costs and directly affect transaction fees.

## The Gas Model

Midnight's gas model tracks four cost dimensions for every circuit execution. Each ledger operation contributes to one or more of these dimensions, and the total determines the transaction fee.

### readTime

**What it measures:** The cost of reading state from the ledger.

**Operations that contribute:**
- `counter.read()` — Reading a counter value
- `map.lookup(key)` — Looking up a map entry
- `map.member(key)` — Checking map membership
- `set.member(elem)` — Checking set membership
- `list.head()` — Reading the list head
- `map.isEmpty()`, `set.isEmpty()`, `list.isEmpty()` — Emptiness checks
- `map.size()`, `set.size()`, `list.length()` — Size queries
- `counter.lessThan(n)` — Counter comparison
- `merkleTree.checkRoot(digest)` — Root verification
- `merkleTree.isFull()` — Capacity check
- Direct field reads

**Optimization strategies:**
- Cache read results in local `const` declarations instead of reading the same state multiple times
- Batch related reads together before performing computations
- Avoid reading state inside loops when the value doesn't change between iterations

```compact
// EXPENSIVE: reads counter 3 times
if (counter.read() > 0 as Uint<64>) {
  if (counter.read() < 100 as Uint<64>) {
    return counter.read();
  }
}

// BETTER: read once, use locally
const current = counter.read();
if (current > 0 as Uint<64>) {
  if (current < 100 as Uint<64>) {
    return current;
  }
}
```

### computeTime

**What it measures:** The cost of circuit computation itself.

**Operations that contribute:**
- All arithmetic operations on circuit values
- Hash function evaluations
- Commitment computations
- Conditional branches (at the language level, only the taken branch is evaluated; however, the compiled ZK circuit encodes both branches with a select gate — both sets of constraints exist in the circuit, affecting gate count)
- Loop body evaluations (all iterations)

**Optimization strategies:**
- Reduce gate count (see `circuit-proving-costs.md`)
- Use `transientHash` instead of `persistentHash` where possible
- Use pure circuits for reusable computation
- Minimize nested loop depth

### bytesWritten

**What it measures:** The cost of writing data to the ledger.

**Operations that contribute:**
- `counter.increment(n)` — Counter updates
- `counter.decrement(n)` — Counter updates
- `map.insert(key, value)` — Adding or updating map entries
- `map.insertDefault(key)` — Adding default entries
- `set.insert(elem)` — Adding set elements
- `list.pushFront(elem)` — Adding list elements
- `merkleTree.insert(leaf)` — Adding tree leaves
- Direct field assignments (`owner = newValue`)

**Optimization strategies:**
- Batch state writes when possible
- Avoid inserting default values if the default will be overwritten immediately
- Prefer updating existing entries over remove-then-insert patterns
- Use `sealed` fields for configuration values set at deployment

```compact
// EXPENSIVE: two writes for what could be one
map.remove(key);
map.insert(key, newValue);

// BETTER: insert overwrites existing entry
map.insert(key, newValue);
```

### bytesDeleted

**What it measures:** The cost of removing data from the ledger.

**Operations that contribute:**
- `map.remove(key)` — Removing map entries
- `set.remove(elem)` — Removing set elements
- `list.popFront()` — Removing list elements
- `counter.resetToDefault()` — Resetting counters
- `map.resetToDefault()` — Clearing maps
- `set.resetToDefault()` — Clearing sets
- `list.resetToDefault()` — Clearing lists
- `merkleTree.resetToDefault()` — Resetting trees

**Optimization strategies:**
- Only delete when necessary — stale entries that are never read again have no computational cost
- Prefer `resetToDefault()` over iterating and removing individual entries
- Consider whether a "soft delete" (setting a flag) is cheaper than actual removal

## RunningCost Structure

The SDK represents gas costs using the `RunningCost` type:

```typescript
interface RunningCost {
  readTime: bigint;
  computeTime: bigint;
  bytesWritten: bigint;
  bytesDeleted: bigint;
}

// Zero-cost starting point
const emptyRunningCost = (): RunningCost => ({
  readTime: 0n,
  computeTime: 0n,
  bytesWritten: 0n,
  bytesDeleted: 0n,
});
```

Each dimension is tracked independently as a `bigint`. The total gas cost is the sum across all dimensions weighted by the cost model.

## CostModel

The `CostModel` defines the per-unit prices for each gas dimension. It is initialized from the network's current parameters:

```typescript
const costModel = CostModel.initialCostModel();
```

Every ledger query during circuit execution is measured against the cost model:

```typescript
// compact-runtime 0.21.0, queryLedgerState
const res = circuitContext.callContext.currentQueryContext.query(
  program,
  circuitContext.costModel,
  circuitContext.gasLimit,
);
circuitContext.callContext.currentQueryContext = res.context;
circuitContext.callContext.currentGasCost = addRunningCost(circuitContext.callContext.currentGasCost, res.gasCost);
```

The cost model is a protocol parameter that can change through governance. Contract developers should design for cost efficiency regardless of current pricing, as costs may change over time.

## Gas Limits

Circuits can have a `gasLimit` set to cap total gas consumption. If the limit is exceeded during execution, the call fails with `ran out of gas budget`:

```typescript
// Set a gas limit when creating the circuit context (compact-runtime 0.21.0)
const context = createCircuitContext({
  circuitId: 'expensiveOperation',
  contractAddress,
  coinPublicKeyOrZswapState: coinPublicKey,
  contractState,
  privateState,
  // For scale: one trivial ledger write costs about 85,000,000 readTime and
  // 1,233,942,932 computeTime on compact-runtime 0.21.0.
  gasLimit: {
    readTime: 1_000_000_000n,
    computeTime: 20_000_000_000n,
    bytesWritten: 10_000n,
    bytesDeleted: 10_000n,
  },
});

// Circuits return a Promise on the ledger 9 runtimes; this rejects with
// "ran out of gas budget" if the call goes over the limit
await contract.circuits.expensiveOperation(context);
```

Gas limits protect against:
- Runaway computations that exhaust resources
- Unexpected cost spikes from large state operations
- Denial-of-service through expensive circuit calls

## Cost-Efficient Patterns

### Cache Ledger Reads

```compact
// EXPENSIVE: 3 separate reads
export circuit checkAndUpdate(threshold: Uint<64>): [] {
  if (counter.read() > threshold) {
    if (counter.read() < 1000 as Uint<64>) {
      const diff = (1000 as Uint<64> - counter.read()) as Uint<16>;
      counter.increment(diff);
    }
  }
}

// BETTER: 1 read, cached locally
export circuit checkAndUpdate(threshold: Uint<64>): [] {
  const current = counter.read();
  if (current > threshold) {
    if (current < 1000 as Uint<64>) {
      const diff = (1000 as Uint<64> - current) as Uint<16>;
      counter.increment(diff);
    }
  }
}
```

### Minimize State Mutations

```compact
// EXPENSIVE: multiple writes per call
export circuit updateScores(user: Bytes<32>, bonus: Uint<16>): [] {
  scores.lookup(user).increment(bonus);
  scores.lookup(user).increment(bonus);  // Why not just double the bonus?
  totalScore.increment(bonus);
  totalScore.increment(bonus);
}

// BETTER: fewer writes, same result
export circuit updateScores(user: Bytes<32>, bonus: Uint<16>): [] {
  const doubleBonus = (bonus * 2) as Uint<16>;
  scores.lookup(user).increment(doubleBonus);
  totalScore.increment(doubleBonus);
}
```

### Use Sealed Fields for Configuration

```compact
// Without sealed: state-write circuits are generated for admin
export ledger admin: Bytes<32>;

// With sealed: no state-write circuits, lower cost
export sealed ledger admin: Bytes<32>;
```

Sealed fields are set once in the constructor and can never change. This eliminates the need for state-write circuits entirely, reducing both circuit and gas costs for the contract.
