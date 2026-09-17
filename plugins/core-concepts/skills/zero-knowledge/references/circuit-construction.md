# Circuit Construction

## From Compact to Circuit

### Compilation Pipeline

```text
Compact Source
     ↓
  Compiler
     ↓
Circuit IR
     ↓
   ZKIR
     ↓
Proving/Verification Keys
(derived from universal SRS)
```

- **Circuit IR**: Intermediate representation that captures the contract logic as abstract circuit operations, before ZK-specific transformations.
- **ZKIR**: Zero-Knowledge IR — the final circuit representation optimized for the PLONK proving system.

### What Becomes Constraints

| Compact Construct | Circuit Representation |
|-------------------|----------------------|
| `assert(x == y, "msg")` | Equality constraint |
| `assert(x != 0, "msg")` | Inverse exists constraint |
| `x + y` | Addition gate |
| `x * y` | Multiplication gate |
| `if c then a else b` | Selection constraint |
| `persistentHash(x)` | Hash circuit (many gates) |

## Witness vs Public Input

### Public Inputs

- Known to verifier
- Part of verified statement
- In Compact: ledger reads, explicit public values

### Witness (Private Inputs)

- Known only to prover
- Never revealed
- In Compact: values returned by witness functions

### Example

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger hash: Bytes<32>;

// Witness declaration (implementation in TypeScript)
witness get_secret(): Bytes<32>;

// Circuit that uses the witness
export circuit checkSecret(): [] {
  const secret = get_secret();
  // ledger.hash is public input
  assert(persistentHash<Bytes<32>>(secret) == hash, "Hash does not match");
}
```

Circuit has:
- Public input: `hash` ledger value
- Witness: `secret` (returned by witness function)
- Constraint: `Hash(secret) = public_hash`

## Circuit Optimization

### Minimize Gates

```compact
// More expensive (bit decomposition required for ordering)
if (amount > threshold) { ... }

// Cheaper (direct field comparison)
if (amount == target) { ... }
```

Note: these are not equivalent operations — choose based on your actual requirement. The point is that comparison operators (`>`, `<`, `>=`, `<=`) are more expensive in ZK circuits than equality checks (`==`, `!=`) because they require bit decomposition.

### Batch Operations

```compact
// Expensive: Multiple hash calls
hash1 = persistentHash<Bytes<32>>(a);
hash2 = persistentHash<Bytes<32>>(b);

// Consider: Single hash of combined data where possible
```

### Reuse Intermediate Values

```compact
// Computed twice (wasteful)
assert(persistentHash<Bytes<32>>(x) == target1, "Mismatch 1");
assert(persistentHash<Bytes<32>>(x) == target2, "Mismatch 2");

// Computed once
const h = persistentHash<Bytes<32>>(x);
assert(h == target1, "Mismatch 1");
assert(h == target2, "Mismatch 2");
```

## Circuit Size Impact

### On Proof Generation

Larger circuits mean:
- More memory during proving
- Longer proof generation time
- Larger proving key files

### On Verification

Verification is constant time regardless of circuit size. This is the "succinct" property.

## Debugging Circuits

### Common Compiler Errors

- **"potential witness-value disclosure must be declared"**: A witness-derived value flows to a public context without `disclose()`. Add `disclose()` at the public boundary.
- **"no compatible function named X is in scope"**: Missing type parameter on a generic function (e.g., `persistentCommit` needs `persistentCommit<T>`). Check the function's generic signature.
- **"parse error: found X looking for Y"**: Syntax error. Common causes: missing parentheses on `if`/`assert`/`for`, using `let` instead of `const`, missing semicolons.

### TypeScript-Side Testing

Test witness implementations independently before integrating:
1. Verify witness functions return correctly typed values
2. Test Merkle path computation against known tree states
3. Validate nullifier derivation produces deterministic results

### Unsatisfied Constraints

When proof generation fails:
1. The witness doesn't satisfy some circuit constraint
2. Check that assert conditions are satisfiable with your inputs
3. Verify Merkle paths are computed against the correct tree version
4. Ensure committed values match the stored commitments exactly
