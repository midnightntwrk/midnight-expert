# Circuits and Witnesses

Complete reference for circuit definitions, witness declarations, constructors, and pure circuits in Compact.

## Circuits

A circuit in Compact is a function that generates a zero-knowledge proof. All computation inside a circuit is proven correct and enforced on-chain.

### Return Types

The return type for circuits that return nothing is `[]` (empty tuple). `Void` does not exist in Compact.

```compact
export circuit doSomething(): [] {        // Correct
  counter.increment(1);
}

export circuit getValue(): Uint<64> {     // Returns a value
  return balances.lookup(caller);
}

export circuit doSomething(): Void { }    // Wrong - parse error
```

### Circuit Modifiers

#### `export`

Makes the circuit a transaction entry point callable from TypeScript:

```compact
export circuit transfer(to: Bytes<32>, amount: Uint<64>): [] {
  // This can be called from the DApp
}
```

Non-exported circuits are internal helpers:

```compact
circuit computeHash(data: Bytes<32>): Bytes<32> {
  // Only callable from other circuits within this contract
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "prefix:"), data]);
}
```

#### `pure`

The `pure` modifier signals that a circuit should have no side effects. The compiler's `identify-pure-circuits` pass checks for ledger access, witness calls, and calls to impure circuits. The `pure` modifier primarily affects whether the circuit generates ZK proving keys and appears in `pureCircuits` exports. Use for stateless helper computations:

```compact
export pure circuit add(a: Field, b: Field): Field {
  return a + b;
}

pure circuit determineWinner(p1: Choice, p2: Choice): Result {
  if (p1 == p2) { return Result.draw; }
  // ... logic
}
```

**Important**: The keyword is `pure circuit`, not `pure function`. The `function` keyword does not exist in Compact.

```compact
pure circuit helper(): Field { ... }     // Correct
pure function helper(): Field { ... }    // Wrong - parse error
```

### Parameters and Disclosure

Circuit parameters that flow to ledger operations require `disclose()`:

```compact
export circuit store(key: Bytes<32>, value: Uint<64>): [] {
  const d_key = disclose(key);
  const d_value = disclose(value);
  balances.insert(d_key, d_value);
}
```

Without `disclose()`, the compiler reports: `potential witness-value disclosure must be declared`.

### Assertions

Use `assert()` to enforce conditions. Failed assertions abort the transaction:

```compact
export circuit withdraw(amount: Uint<64>): [] {
  assert(amount > 0, "Amount must be positive");
  assert(disclose(caller == owner), "Not authorized");
  // ...
}
```

### Loops

For-loops iterate over ranges or arrays:

```compact
circuit process(): [] {
  for (const i of 0 .. 10) {
    // i goes from 0 to 9
  }

  for (const item of [3, 2, 1]) {
    // iterate over array literal
  }
}
```

Loop bounds must be compile-time constants (circuits have fixed computational bounds).

### Variable Declarations

Use `const` for all local variables:

```compact
circuit example(): Field {
  const x: Field = 42;
  const y = x + 1;          // Type inferred
  const hash = persistentHash<Field>(x);
  return hash as Field;
}
```

## Witnesses

Witnesses declare functions that run off-chain on the prover's machine. They provide private/confidential data to circuits.

### Declaration-Only Rule

Witnesses are declarations only — they cannot have implementation bodies in Compact. Implementation goes in the TypeScript prover:

```compact
witness local_secret_key(): Bytes<32>;                  // Correct
witness get_data(id: Bytes<32>): Maybe<UserRecord>;     // Correct
witness store_value(v: Field): [];                      // Correct (side-effect only)

witness get_key(): Bytes<32> { return pad(32, "key"); } // Wrong - parse error
```

### Witness Properties

- **Confidential**: Witness values are not revealed on-chain unless explicitly `disclose()`d
- **Untrusted**: The contract cannot verify witness values are correct — the prover controls them
- **Local**: Witnesses run on the user's machine, not on-chain
- **Typed**: Witnesses have full type signatures matching their TypeScript implementations

### Disclosure of Witness Values

When witness values flow into conditionals or ledger operations, wrap with `disclose()`:

```compact
witness get_secret(): Field;

export circuit check(guess: Field): Boolean {
  const secret = get_secret();

  // Conditional on witness value requires disclose()
  if (disclose(guess == secret)) {
    return true;
  }
  return false;
}

export circuit setOwner(): [] {
  // Writing witness-derived value to ledger requires disclose()
  owner = disclose(get_public_key(local_secret_key()));
}
```

Without `disclose()`: `implicit disclosure of witness value` error.

### Common Witness Patterns

**Secret key provider**:
```compact
witness local_secret_key(): Bytes<32>;
```

**Data lookup**:
```compact
witness find_record(key: Bytes<32>): Maybe<Record>;
```

**Local storage side-effect**:
```compact
witness store_locally(data: Field): [];
witness advance_local_state(): [];
```

**Merkle proof provider**:
```compact
witness get_merkle_path(leaf: Bytes<32>): MerkleTreePath<10, Bytes<32>>;
```

**Random value provider** (ZK circuits are deterministic):
```compact
witness get_random_value(): Field;
```

## Constructor

The constructor runs once at contract deployment. It initializes ledger state, especially `sealed` fields that cannot be changed after deployment.

```compact
export sealed ledger owner: Bytes<32>;
export sealed ledger nonce: Bytes<32>;
export ledger state: GameState;

constructor(initNonce: Bytes<32>) {
  owner = disclose(get_public_key(local_secret_key()));
  nonce = disclose(initNonce);
  state = GameState.waiting;
}
```

### Constructor Rules

- Runs exactly once at deployment
- Can call witnesses and helper circuits
- Must initialize all `sealed` ledger fields
- Can initialize non-sealed fields too
- Values written to ledger need `disclose()` if derived from witnesses
- Parameters are provided by the deployer

### Constructor Without Parameters

```compact
constructor() {
  owner = disclose(get_public_key(local_secret_key()));
  // counter initializes to 0 automatically
}
```

## Module Organization

For larger contracts, split code across files using `include`:

```compact
// main.compact
pragma language_version 0.23;
import CompactStandardLibrary;

include "ledger";
include "witnesses";
include "circuits";

constructor(admin: Bytes<32>) {
  // ...
}
```

Each included file contains its respective declarations without needing its own pragma or imports.

## Circuit vs Witness Comparison

| Aspect | Circuit | Witness |
|--------|---------|---------|
| Execution | On-chain (verified by ZK proof) | Off-chain (prover's machine) |
| Trust | Enforced correct | Untrusted (prover-controlled) |
| State access | Can read/write ledger | No ledger access |
| Privacy | Computation is hidden, results may be public | Values are confidential |
| Implementation | In Compact | In TypeScript |
| Body | Required (has `{ }` block) | Declaration only (ends with `;`) |
