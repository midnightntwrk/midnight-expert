# Troubleshooting and Common Mistakes

Definitive reference for diagnosing Compact compiler errors, correcting wrong syntax patterns, and avoiding functions that do not exist. Organized by error category for fast lookup.

## Functions That Do Not Exist

These functions are commonly assumed to be built-in but are not part of Compact. Attempting to use them produces `unbound identifier` errors.

### public_key()

There is no built-in key derivation function. Derive public keys using `persistentHash` with a domain-separation tag:

```compact
// Wrong -- unbound identifier "public_key"
const pk = public_key(sk);

// Correct -- persistentHash pattern
circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}
```

### verify_signature()

Signature verification cannot run inside a ZK circuit. Verify signatures off-chain in the witness (TypeScript prover) and pass the boolean result into the circuit:

```compact
// Wrong -- does not exist
const valid = verify_signature(msg, sig, pk);

// Correct -- verify off-chain, pass result as witness
witness signature_valid(msg: Bytes<32>, pk: Bytes<32>): Boolean;

export circuit submit(msg: Bytes<32>, pk: Bytes<32>): [] {
  assert(disclose(signature_valid(msg, pk)), "Invalid signature");
}
```

### random()

ZK circuits are deterministic. There is no source of randomness inside a circuit. Provide randomness from the prover via a witness:

```compact
// Wrong -- does not exist
const r = random();

// Correct -- randomness comes from the prover
witness get_random_value(): Bytes<32>;

export ledger ledger_commitment: Bytes<32>;

export circuit commit(value: Field): [] {
  const rand = get_random_value();
  ledger_commitment = persistentCommit<Field>(value, rand);
}
```

## Compiler Error Reference

Table mapping error messages to their cause and fix. Errors are grouped by category.

### Parse Errors

| Error Message | Cause | Fix |
|---|---|---|
| `parse error: found "{" looking for an identifier` | Using deprecated `ledger { }` block syntax | Use individual `export ledger` declarations |
| `parse error: found "{" looking for ";"` | Using `Void` as a return type | Use empty tuple `[]` for circuits that return nothing |
| `parse error: found ":" looking for ")"` | Using Rust-style `Enum::variant` double-colon syntax | Use dot notation: `Enum.variant` |
| `parse error: found "{" after witness declaration` | Adding an implementation body to a witness | Witnesses are declarations only -- end with `;` and implement in TypeScript |
| `version mismatch or parse error` | Pragma uses patch version (`0.22.0`) or wrong operator format | Use `pragma language_version 0.23;` |

### Unbound Identifier Errors

| Error Message | Cause | Fix |
|---|---|---|
| `unbound identifier "public_key"` | Assuming `public_key()` is a built-in | Use the `persistentHash` derivation pattern (see above) |
| `unbound identifier "Cell"` | Using deprecated `Cell<T>` wrapper removed in v0.15 | Use the type directly: `export ledger x: Field;` |
| `unbound identifier "function"` | Writing `pure function` instead of `pure circuit` | Compact uses `pure circuit` for helper functions |

### Type Errors

| Error Message | Cause | Fix |
|---|---|---|
| `incompatible combination of types Field and Uint` | Comparing or operating on `Field` with `Uint` without casting | Cast the `Uint` operand: `(myUint as Field)` |
| `expected ... Uint<64> but received Uint<0..N>` | Arithmetic result has expanded bounded type | Cast result back: `(a + b) as Uint<64>` |
| `cannot cast from type Uint<64> to type Bytes<32>` | Using an older compiler version that does not support direct `Uint` to `Bytes` cast | Upgrade compiler, or go through `Field`: `(amount as Field) as Bytes<32>` |
| `member access requires struct type` | Accessing a field on a non-struct type | Verify the base value is a struct. `Map.lookup()` and `Set.member()` are separate operations, not field accesses. |

### Disclosure Errors

| Error Message | Cause | Fix |
|---|---|---|
| `implicit disclosure of witness value` | Using a witness-derived value in a conditional without `disclose()` | Wrap the comparison: `if (disclose(witness_val == expected))` |
| `potential witness-value disclosure must be declared` | A circuit parameter flows to a ledger operation without acknowledgment | Disclose at the point of use: `const d = disclose(param); ledger.insert(d, v);` |

### Runtime / Proof Errors

| Error Message | Cause | Fix |
|---|---|---|
| `cannot prove assertion` | An `assert` condition evaluates to false during proof generation | Check witness return values, ensure range checks pass, and verify circuit logic. Common causes: (1) witness returns unexpected value, (2) bounded integer overflows range, (3) logic error in conditional chain |
| `operation "value" undefined for ledger field type Counter` | Calling `.value()` on a `Counter` instead of `.read()` | Use `counter.read()` which returns `Uint<64>` |

## Disclosure Errors in Detail

Disclosure errors are the most common semantic errors in Compact. They occur because values derived from witnesses are private by default, and the compiler requires explicit acknowledgment before they appear on-chain.

### Conditional Disclosure

Any branch condition that depends on a witness value must be wrapped in `disclose()`:

```compact
witness get_secret(): Field;

// Wrong -- implicit disclosure of witness value
export circuit check(guess: Field): Boolean {
  const secret = get_secret();
  if (guess == secret) {
    return true;
  }
  return false;
}

// Correct -- wrap comparison in disclose()
export circuit check(guess: Field): Boolean {
  const secret = get_secret();
  if (disclose(guess == secret)) {
    return true;
  }
  return false;
}
```

### Ledger Write Disclosure

Circuit parameters are tagged as witness data by the compiler — their taint propagates like witness function returns. The parameters themselves are PLONK private inputs to the proof and are not in the public transcript. Writing one to the ledger, however, crosses a public boundary, which is why the compiler requires `disclose()` at the write site (not at the parameter site):

```compact
// Wrong -- potential witness-value disclosure must be declared
export circuit store(key: Bytes<32>, value: Uint<64>): [] {
  balances.insert(key, value);
}

// Correct -- disclose parameters before ledger write
export circuit store(key: Bytes<32>, value: Uint<64>): [] {
  const d_key = disclose(key);
  const d_value = disclose(value);
  balances.insert(d_key, d_value);
}
```

## Type Cast Errors in Detail

### Uint to Bytes Casting

Direct `Uint<N> as Bytes<M>` compiles and works. The two-step route through `Field` is also valid:

```compact
// Direct cast -- compiles and works
const b: Bytes<32> = amount as Bytes<32>;

// Alternative -- two-step cast through Field
const b2: Bytes<32> = (amount as Field) as Bytes<32>;
```

Both routes produce the same result.

### Boolean to Field Cast

Direct `Boolean as Field` is valid (false → 0, true → 1). The two-step route `(flag as Uint<0..1>) as Field` also works but is not required.

### Arithmetic Results Must Be Cast Back

Arithmetic on `Uint` values produces an expanded bounded type. The result must be cast to the target type before assignment or use in a typed context:

```compact
// Wrong -- expected Uint<64> but received Uint<0..N>
balances.insert(key, a + b);

// Correct -- cast arithmetic result
balances.insert(key, (a + b) as Uint<64>);
```

This applies to all arithmetic operators. Subtraction can also fail at runtime if the result would be negative.

## Wrong-to-Correct Syntax Quick Reference

Complete table of common syntax mistakes with the error each one produces.

| Wrong | Correct | Error |
|---|---|---|
| `ledger { field: Type; }` | `export ledger field: Type;` | `parse error: found "{" looking for an identifier` |
| `circuit fn(): Void` | `circuit fn(): []` | `parse error: found "{" looking for ";"` |
| `pragma language_version >= 0.22.0;` | `pragma language_version 0.23;` | version mismatch or parse error |
| `enum State { a, b }` | `export enum State { a, b }` | enum not accessible from TypeScript |
| `if (witness_val == x)` | `if (disclose(witness_val == x))` | `implicit disclosure of witness value` |
| `Cell<Field>` | `Field` | `unbound identifier "Cell"` |
| `public_key(sk)` | `persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:pk:"), sk])` | `unbound identifier "public_key"` |
| `counter.value()` | `counter.read()` | `operation "value" undefined for Counter` |
| `Choice::rock` | `Choice.rock` | `parse error: found ":" looking for ")"` |
| `witness fn(): T { ... }` | `witness fn(): T;` | `parse error: found "{" after witness declaration` |
| `pure function helper(): T` | `pure circuit helper(): T` | `unbound identifier "function"` |
| `(amount as Field) as Bytes<32>` | `amount as Bytes<32>` (direct cast also works) | Both routes are valid |
| `ledger.insert(key, a + b)` | `ledger.insert(key, (a + b) as Uint<64>)` | `expected type Uint<64> but received Uint<0..N>` |
| `export circuit fn(p: T): [] { ledger.insert(p, v); }` | `export circuit fn(p: T): [] { const d = disclose(p); ledger.insert(d, v); }` | `potential witness-value disclosure must be declared` |

## Debugging Strategies

### "cannot prove assertion" at Runtime

This error occurs during proof generation, not compilation. The prover cannot satisfy the circuit constraints. Checklist:

1. **Witness values** -- Print or log what the witness functions return. A witness returning an unexpected value is the most common cause.
2. **Range checks** -- If a cast like `value as Uint<64>` appears before the failing assert, the value may exceed the target range. Use bounded parameters (`Uint<0..N>`) to constrain inputs.
3. **Arithmetic underflow** -- Subtraction on unsigned integers fails if the result would be negative. Guard with a comparison first: `assert(a >= b, "underflow");`
4. **Ledger state assumptions** -- The ledger may not be in the state your circuit expects. Verify preconditions with explicit asserts early in the circuit.

### Identifying Disclosure Errors

When the compiler reports a disclosure error, trace the data flow from witness to usage:

1. Identify which value originates from a witness call or circuit parameter.
2. Follow that value through any intermediate computations -- all derived values inherit witness status.
3. At the point where the value touches the ledger or controls a branch, wrap it (or the relevant comparison) in `disclose()`.

A single `disclose()` at the point of use is sufficient. You do not need to disclose every intermediate variable, only the expression that directly interacts with the ledger or conditional.
