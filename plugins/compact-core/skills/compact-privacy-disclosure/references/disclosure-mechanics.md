# Disclosure Mechanics

> **Last verified:** 2026-09-18 — commit-vs-hash taint behavior and signatures compile-verified against Compact compiler `0.31.1` / language `0.23` / runtime `0.16.0`: `persistentCommit<Field>(_, Bytes<32>): Bytes<32>` and `transientCommit<Field>(_, Field): Field` clear taint (ledger write without `disclose()` compiles); `persistentHash` does not (rejected: "ledger operation might disclose a hash of the witness value").

Deep reference for how `disclose()` works in Compact, what the compiler tracks,
where disclosure is required, and how to place it correctly.

## What disclose() Actually Does

`disclose()` is a compiler annotation, not a runtime operation. It tells the Witness Protection Program (the compiler's abstract interpreter) to treat the wrapped expression's value as if it does not contain witness data. It does not encrypt, hash, or transform the value in any way. Placing `disclose(x)` simply marks `x` as "okay to make public."

The official docs state: placing `disclose()` around an expression "tells the compiler that it is okay to disclose the value of the wrapped expression."

```compact
// Without disclose -- compiler rejects:
import CompactStandardLibrary;

witness getBalance(): Bytes<32>;

export ledger balance: Bytes<32>;

export circuit recordBalance(): [] {
  balance = getBalance();  // ERROR: missing disclose() wrapper
}
```

```compact
// With disclose -- compiler accepts:
import CompactStandardLibrary;

witness getBalance(): Bytes<32>;

export ledger balance: Bytes<32>;

export circuit recordBalance(): [] {
  balance = disclose(getBalance());  // OK: programmer acknowledges public disclosure
}
```

The compiler error for the missing `disclose()` reads:

> potential witness-value disclosure must be declared but is not: witness value potentially disclosed: the return value of witness getBalance ... nature of the disclosure: ledger operation might disclose the witness value

## Sources of Witness Data

Witness data enters a circuit from three sources. Any value derived from these sources (through arithmetic, field access, circuit calls, casts, or any other computation) is also treated as witness data by the compiler.

| Source | Description | Example |
|--------|-------------|---------|
| `witness` function return values | Data provided by the off-chain DApp at proof time | `const sk = secretKey();` |
| Exported circuit parameters | Arguments supplied by the transaction submitter | `export circuit deposit(amount: Uint<64>)` |
| Constructor parameters | Values passed when deploying the contract | `constructor(initialOwner: Bytes<32>)` |
| Derived values | Any computation involving the above | `const pk = persistentHash<Bytes<32>>(sk);` |

Because witness functions are implemented off-chain in TypeScript, not in the Compact source, their return values are inherently untrusted. The compiler treats all witness outputs as potentially private data that must be explicitly disclosed before crossing a public boundary.

> **Note: tagging is not visibility.** "Witness data" in this table means the compiler tags these values for taint tracking — it does NOT mean they are publicly visible. All three sources (witness returns, exported circuit parameters, constructor parameters) start their lives as PLONK *private inputs* to the proof. They only enter the public transaction transcript if the source code crosses a public boundary while the value is still tainted (i.e., via `disclose()` at a ledger write, a return from an exported circuit, a public conditional, or a cross-contract call). An exported circuit parameter consumed only by an internal commitment, hash, or private assert never appears on-chain. Empirically confirmed via `compact compile` + ZKIR inspection: PLONK private inputs include every untouched parameter; the public transcript reflects only the disclosed boundary points.

## The Witness Protection Program

The Witness Protection Program is the compiler's abstract interpreter. Instead of evaluating a program with actual runtime values, it evaluates using abstract values that track whether each value contains witness data.

How it works:

1. **Tagging** -- Every value returned from a `witness` function, every exported circuit parameter, and every constructor parameter is tagged as "contains witness data."
2. **Propagation** -- Operations are modified to propagate witness data metadata through the program flow. If you add a witness value to a constant, the result is still tagged. If you store a witness value in a struct field, the struct is tagged.
3. **Boundary detection** -- When a tagged value reaches a public boundary (ledger write, exported circuit return, cross-contract call), the compiler checks for a `disclose()` wrapper.
4. **Error reporting** -- When the compiler encounters an undeclared disclosure point, it halts and produces an error message that includes the full path from the witness source to the disclosure point. It reports ALL disclosure violations, not just the first one.

The abstract interpreter follows data through arithmetic, struct construction, circuit calls, type casts, and lambda captures. There is no way to "hide" witness data from it through intermediate computation.

## Exhaustive Disclosure Contexts

Every context where witness data crosses a public boundary requires `disclose()`.

| Context | Example | Why Disclosure Occurs |
|---------|---------|----------------------|
| Ledger write (direct) | `owner = disclose(pk)` | Value becomes public on-chain |
| Ledger write (ADT method) | `map.insert(disclose(key), val)` | Arguments to ADT operations are public |
| Conditional (`if`) | `if (disclose(x == y)) { ... }` | Branch choice reveals information |
| Conditional (`assert`) | `assert(x > 0, "msg")` | The compiler does not require `disclose()` in assert conditions, but `assert(disclose(...), "msg")` is also valid |
| Return from exported circuit | `return disclose(value)` | Return value leaves the ZK proof |
| Cross-contract call | Calling another contract's circuit | Arguments cross trust boundary |
| Constructor sealed field | `owner = disclose(pk)` in constructor | Sealed values are set publicly |

A subtle but important case is conditionals. Even a `Boolean` comparison result derived from witness data leaks information, because the branch taken is observable:

```compact
import CompactStandardLibrary;

witness getBalance(): Uint<64>;

// ERROR: the return value discloses the result of a comparison involving witness data
export circuit balanceExceeds(n: Uint<64>): Boolean {
  return getBalance() > n;
}

// FIXED: explicit disclose on the comparison result
export circuit balanceExceeds(n: Uint<64>): Boolean {
  return disclose(getBalance() > n);
}
```

## Where Disclosure Is NOT Required

Not every use of witness data requires `disclose()`. If the value never crosses a public boundary, it stays inside the ZK proof and remains confidential.

| Context | Example | Why No Disclosure |
|---------|---------|-------------------|
| Pure witness computation | `const h = persistentHash<Bytes<32>>(sk)` | Result stays within circuit |
| Internal circuit calls | `helper(witness_val)` | Non-exported circuit, stays in proof |
| Intermediate variables | `const x = a + b` | No public boundary crossed |
| Witness-to-witness flow | `const derived = compute(getSecret())` | All computation stays private |
| Commitment inputs | `persistentCommit<Field>(secret, rand)` | Commitment cryptographically hides the input |

The key principle: `disclose()` is only needed at public boundaries. All computation that stays inside the ZK proof is inherently private and requires no annotation.

## Safe Stdlib Routines

The standard library includes cryptographic functions that interact with witness taint tracking in specific ways. The critical distinction is between **commit** functions (which clear taint on their input) and **hash** functions (which do not).

| Function | Signature | Brute-Force Resistant? | Clears Witness Taint? | Why |
|----------|-----------|----------------------|----------------------|-----|
| `persistentCommit<T>` | `(value: T, rand: Bytes<32>): Bytes<32>` | **Yes** | **Yes** | Random nonce prevents brute-force guessing even for small input spaces |
| `transientCommit<T>` | `(value: T, rand: Field): Field` | **Yes** | **Yes** | Same property, circuit-efficient algorithm |
| `persistentHash<T>` | `(value: T): Bytes<32>` | **No** | **No** | One-way (output cannot be reversed), but without a random nonce, small input spaces can be brute-forced |
| `transientHash<T>` | `(value: T): Field` | **No** | **No** | Same as `persistentHash` |

Both hash and commit functions produce one-way outputs that cannot be reverse-computed. The critical difference is that commits add a **random nonce** (blinding factor) that prevents an attacker from brute-forcing the preimage when the input space is small (e.g., a boolean, a small integer, or a known set of values). For high-entropy inputs, a hash also effectively hides the value.

Important nuance: commits clear taint on both the *input* and the *output*. The commitment result does not carry witness taint, so `disclose()` is technically optional when storing it. However, using `disclose()` for explicitness is harmless and can improve readability.

```compact
witness getSecret(): Field;
witness getRandom(): Bytes<32>;

export ledger storedCommitment: Bytes<32>;

export circuit storeCommitment(): [] {
  const secretValue = getSecret();
  const randomness = getRandom();

  // Commitment clears witness taint on both INPUT and OUTPUT:
  const commitment = persistentCommit<Field>(secretValue, randomness);

  // disclose() is optional here (taint already cleared), but used for explicitness:
  storedCommitment = disclose(commitment);
}
```

Compare with hashing, which does NOT clear taint:

```compact
witness getSecret(): Bytes<32>;

export ledger storedHash: Bytes<32>;

export circuit storeHash(): [] {
  const secret = getSecret();

  // Hash does NOT clear witness taint:
  const h = persistentHash<Bytes<32>>(secret);

  // disclose() is required here because the hash still carries witness taint:
  storedHash = disclose(h);
}
```

The commit functions require a randomness argument with sufficient entropy. If the randomness is predictable or reused, the commitment provides no privacy benefit even though it clears witness taint from the compiler's perspective. The `rand` argument should come from a witness function providing cryptographically secure random bytes.

## Best Practices for Placement

Where you place `disclose()` matters for readability, correctness, and minimizing accidental over-disclosure.

**Place `disclose()` as close to the disclosure point as possible.** This is the recommended practice from the official documentation. Placing it at the witness call site risks accidentally disclosing the value through multiple paths.

```compact
witness getPrivateKey(): Bytes<32>;

export ledger publicKeyHash: Bytes<32>;

// PREFERRED: disclose at the ledger write (the disclosure point)
export circuit registerKey(): [] {
  const sk = getPrivateKey();
  const pk = persistentHash<Bytes<32>>(sk);
  publicKeyHash = disclose(pk);
}

// DISCOURAGED: disclose at the witness call site
export circuit registerKey(): [] {
  const sk = disclose(getPrivateKey());  // over-discloses; sk is now "public" everywhere
  const pk = persistentHash<Bytes<32>>(sk);
  publicKeyHash = pk;
}
```

**For structured values, only wrap the witness-containing fields.** Do not wrap an entire struct if only one field contains witness data.

```compact
// PREFERRED: wrap only the witness-derived field
map.insert(disclose(witnessKey), publicValue);

// DISCOURAGED: wrapping more than necessary
map.insert(disclose(witnessKey), disclose(publicValue));  // publicValue does not need disclose
```

**Exception: if a witness always returns non-private data,** put `disclose()` at the call site. Some witnesses return data that is inherently public (e.g., the current block number, a public configuration value). In these cases, disclosing at the call site is clearer.

```compact
// OK when the witness intentionally returns non-private data:
const config = disclose(getPublicConfig());
```

**Never wrap more than necessary.** Over-disclosure is an anti-pattern. Every `disclose()` is an assertion by the programmer that the wrapped value is safe to reveal. Wrapping values that should stay private defeats the purpose of the compiler check.

## Indirect Disclosure Tracking

The compiler follows witness data through every form of computation. There is no operation that "accidentally" strips witness taint (other than the commit functions documented above).

The compiler tracks witness data through:

| Propagation Path | Example | Taint Status |
|-----------------|---------|-------------|
| Arithmetic | `witness_val + 73` | Still witness data |
| Type casts | `witness_val as Bytes<32>` | Still witness data |
| Struct construction | `S { x: witness_val }` | Struct contains witness data |
| Struct field access | `s.x` where `s` contains witness data | Extracted field is witness data |
| Circuit calls | `helper(witness_val)` where `helper` is non-exported | Witness data flows through arguments |
| Lambda captures | Closure capturing a witness variable | Captured value carries taint |
| Comparisons | `witness_val == constant` | Result is witness data |

The following example from the official documentation demonstrates how the compiler traces witness data through multiple layers of indirection:

```compact
import CompactStandardLibrary;

struct S { x: Field; }

witness getBalance(): Bytes<32>;

export ledger balance: Bytes<32>;

circuit obfuscate(x: Field): Field {
  return x + 73;
}

// ERROR: compiler traces witness data through struct, circuit call, arithmetic, and cast
export circuit recordBalance(): [] {
  const s = S { x: getBalance() as Field };  // struct construction + cast
  const x = obfuscate(s.x);                  // circuit call + field access + arithmetic
  balance = x as Bytes<32>;                   // cast + ledger write = undeclared disclosure
}
```

The compiler error for this case reports the full path:

> potential witness-value disclosure must be declared but is not: witness value potentially disclosed: the return value of witness getBalance ... nature of the disclosure: ledger operation might disclose the result of an addition involving the witness value

The fix is to place `disclose()` at the point where the taint should be acknowledged:

```compact
import CompactStandardLibrary;

struct S { x: Field; }

witness getBalance(): Bytes<32>;

export ledger balance: Bytes<32>;

circuit obfuscate(x: Field): Field {
  return disclose(x) + 73;
}

export circuit recordBalance(): [] {
  const s = S { x: getBalance() as Field };
  const x = obfuscate(s.x);
  balance = x as Bytes<32>;
}
```

Here, `disclose(x)` inside `obfuscate` tells the compiler: "I acknowledge that `x` (which carries witness data from `getBalance()`) is being used in a computation whose result will become public." After the `disclose()`, the addition result `disclose(x) + 73` no longer carries witness taint, so the subsequent ledger write does not require another `disclose()`.
