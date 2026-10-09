# Compilation & Type Safety Review Checklist

Review checklist for the **Compilation & Type Safety** category. This covers deprecated syntax, incorrect return types, type casting errors, hallucinated API methods, and common compiler error patterns. LLM-generated Compact code is especially prone to these issues because training data contains outdated syntax and invented APIs. Apply every item below to the contract under review.

## Shared Evidence

The orchestrator runs `compact compile --skip-zk` on the contract before dispatching reviewers. The resulting `COMPILE_RESULT` (full stdout/stderr from the compiler) is provided in your prompt. Reference this compilation output when evaluating checklist items. Read the contract source files directly to inspect structure, declarations, and patterns. This category relies most heavily on the compilation output — cross-reference every checklist item against the actual compiler diagnostics before reporting findings.

## Syntax Error Checklist

Check the contract for deprecated or invalid syntax that will cause compilation failures.

- [ ] **`Void` return type instead of `[]`.** The `Void` return type has been removed from Compact. Functions (witnesses and circuits) that return no useful value must now use `[]`, signifying the empty tuple. LLMs frequently hallucinate `Void` because it appears in older documentation and is familiar from other languages.

  ```compact
  // BAD — Void is not a valid return type
  export circuit reset(): Void {
    counter.increment(1);
  }

  // GOOD — empty tuple [] is the correct "no return value" type
  export circuit reset(): [] {
    counter.increment(1);
  }
  ```

  > **Tool:** `COMPILE_RESULT` will show `unbound identifier Void` if present.

- [ ] **Deprecated `ledger { ... }` block instead of individual ledger declarations.** Older versions of Compact used a single `ledger { ... }` block to group all ledger declarations. Current Compact requires each ledger variable to be declared individually. The `export` modifier is optional — use it when the DApp needs to query the variable directly.

  ```compact
  // BAD — ledger block syntax is deprecated
  ledger {
    counter: Counter;
    balances: Map<Bytes<32>, Field>;
    owner: Bytes<32>;
  }

  // GOOD — individual ledger declarations (export is optional)
  export ledger counter: Counter;
  export ledger balances: Map<Bytes<32>, Field>;
  ledger owner: Bytes<32>;
  ```

  > **Tool:** `COMPILE_RESULT` shows `parse error: found "{" looking for an identifier` for deprecated ledger block syntax.

- [ ] **`Choice::variant` (Rust-style) instead of `Choice.variant` (dot notation).** Compact uses dot notation for enum/choice variant access, not Rust-style double-colon path syntax. LLMs trained on Rust code frequently produce the wrong syntax.

  ```compact
  // BAD — Rust-style double-colon path
  const status = State::Active;
  assert(state == State::Committed, "Wrong state");

  // GOOD — dot notation
  const status = State.Active;
  assert(state == State.Committed, "Wrong state");
  ```

- [ ] **`witness name() { ... }` with a function body instead of declaration-only syntax.** In Compact, witness functions are declared in the contract with a signature only (no body). The implementation lives in the TypeScript witness provider, not in the `.compact` file. A witness declaration that includes a body will not compile.

  ```compact
  // BAD — witness with a body (not valid in Compact)
  witness local_secret_key() {
    return generateSecretKey();
  }

  // GOOD — witness declaration only; body is in TypeScript
  witness local_secret_key(): Bytes<32>;
  ```

  > **Tool:** `COMPILE_RESULT` will show `parse error: found "{" looking for ";"` for a witness body after a return type, or `parse error: found "{" looking for ":"` when the return type is also missing.

- [ ] **`pure function` instead of `pure circuit`.** Compact does not have a `function` keyword. Reusable non-exported logic is declared as a `circuit` (or `pure circuit` for circuits that do not access ledger state). LLMs frequently hallucinate `function` because it is ubiquitous in other languages.

  ```compact
  // BAD — function keyword does not exist in Compact
  pure function computeHash(input: Bytes<32>): Bytes<32> {
    return persistentHash<Bytes<32>>(input);
  }

  // GOOD — pure circuit is the correct keyword
  pure circuit computeHash(input: Bytes<32>): Bytes<32> {
    return persistentHash<Bytes<32>>(input);
  }
  ```

  > **Tool:** `COMPILE_RESULT` will show `parse error: found keyword "function" (which is reserved for future use) looking for "circuit"`.

- [ ] **`Cell<T>` used as a type.** `Cell<T>` is not a valid Compact type. LLMs sometimes hallucinate it from Rust or other ZK language patterns. Use the type directly for ledger declarations.

  ```compact
  // BAD — Cell<T> is not a Compact type
  export ledger owner: Cell<Bytes<32>>;
  export ledger threshold: Cell<Field>;

  // GOOD — use the type directly
  export ledger owner: Bytes<32>;
  export ledger threshold: Field;
  ```

- [ ] **`let` or `var` instead of `const`.** Compact only supports `const` for variable bindings. There is no `let` or `var` keyword. All bindings are immutable once assigned.

  ```compact
  // BAD — let and var are not valid keywords
  let result = computeHash(input);
  var total = counter.read();

  // GOOD — const is the only variable binding keyword
  const result = computeHash(input);
  const total = counter.read();
  ```

- [ ] **`while` loop instead of bounded `for` loop.** Compact does not support `while` loops because circuits must have compile-time-bounded execution. Only `for` loops with compile-time-known bounds are allowed. An unbounded loop would make proof generation impossible.

  ```compact
  // BAD — while loops are not allowed (unbounded execution)
  while (i < n) {
    process(items[i]);
    i = i + 1;
  }

  // GOOD — for loop with compile-time bound (range syntax)
  for (const i of 0..9) {
    process(items[i]);
  }
  ```

- [ ] **Missing `import CompactStandardLibrary;` statement.** Compact contracts that use standard library types (`Counter`, `Map`, `Set`, `MerkleTree`, `HistoricMerkleTree`, `Vector`, etc.) must import the standard library. Without this import, all standard library types and functions are undefined.

  ```compact
  // BAD — missing import; Counter and Map are undefined
  export ledger counter: Counter;
  export ledger balances: Map<Bytes<32>, Field>;

  // GOOD — import standard library first
  import CompactStandardLibrary;

  export ledger counter: Counter;
  export ledger balances: Map<Bytes<32>, Field>;
  ```

  > **Tool:** `COMPILE_RESULT` will show `unbound identifier Counter` (or the first other stdlib name used) if the import is missing.

- [ ] **`include "std"` (outdated) instead of `import CompactStandardLibrary;`.** Older versions of Compact used `include "std"` to load the standard library. Since language version 0.12.3 (compiler 0.19.7), the standard library is a builtin module imported via `import CompactStandardLibrary;`. The `std.compact` file is still provided for backward compatibility, so `include "std"` may still compile, but the `import` form is the recommended approach. Note: the `include` keyword itself is still valid for including other `.compact` files — only its use for the standard library is outdated.

  ```compact
  // BAD — deprecated include syntax
  include "std";

  // GOOD — current import syntax
  import CompactStandardLibrary;
  ```

## Semantic Error Checklist

Check the contract for code that is syntactically valid but semantically incorrect, causing compiler rejections or runtime failures.

- [ ] **Implicit disclosure of witness value at a public boundary.** When a witness-derived value flows to a public context (ledger write, return from exported circuit, public assertion) without an explicit `disclose()` call, the compiler rejects the code. This is the most common semantic error in Compact. The fix is to add `disclose()` at the point where the value crosses the public boundary.

  ```compact
  // BAD — witness value written to ledger without disclose()
  witness get_owner(): Bytes<32>;

  export circuit initialize(): [] {
    const owner_pk = get_owner();
    authority = owner_pk;
    // Compiler error: potential witness-value disclosure must be declared but is not: …
  }

  // GOOD — explicit disclose() at the public boundary
  export circuit initialize(): [] {
    const owner_pk = get_owner();
    authority = disclose(owner_pk);
  }
  ```

- [ ] **Recursive circuit calls.** Circuits in Compact cannot call themselves, either directly or through mutual recursion. The compiler rejects recursive circuit definitions because ZK circuits must have a fixed, finite structure that can be flattened into constraints. If you need iterative logic, use a bounded `for` loop instead.

  ```compact
  // BAD — recursive circuit call (not allowed)
  circuit factorial(n: Uint<64>): Uint<64> {
    if (n == 0) {
      return 1;
    }
    return n * factorial(n - 1);
    // Compiler error: recursion involving factorial
  }

  // GOOD — fold over a fixed-size vector (a const cannot be reassigned
  // inside a for loop, so accumulate with fold instead)
  circuit factorial(n: Uint<8>): Uint<64> {
    assert(n <= 20, "n! does not fit in Uint<64> above 20");
    return fold((acc: Uint<64>, i: Uint<8>): Uint<64> => (i <= n ? acc * i : acc) as Uint<64>,
                1 as Uint<64>,
                [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  }
  ```

- [ ] **Mutable reassignment of a `const` binding.** All variable bindings in Compact use `const` and are immutable. Attempting to reassign a previously bound variable is a compiler error. If you need to compute a new value from an existing one, bind it to a new `const` with a different name.

  ```compact
  // BAD — reassigning a const binding
  const total = balances.lookup(account);
  total = total + amount;
  // Compiler error: expected left-hand side of = to have an ADT type, received …

  // GOOD — bind to a new const
  const current_total = balances.lookup(disclose(account));
  const new_total = current_total + amount;
  ```

- [ ] **Non-exported circuit returning witness data that crosses a public boundary.** If a non-exported circuit receives witness-tainted data and returns it, the caller may unknowingly pass that tainted data to a public context. The compiler tracks taint through the call chain. Ensure that `disclose()` is applied at the appropriate point before the data reaches a ledger write or exported circuit return.

  ```compact
  // BAD — helper circuit returns tainted data; caller writes to ledger
  circuit computeKey(): Bytes<32> {
    const sk = local_secret_key();
    return publicKey(sk);
    // Return value is witness-tainted
  }

  export circuit register(): [] {
    const pk = computeKey();
    authority = pk;
    // Compiler error: potential witness-value disclosure must be declared but is not: …
  }

  // GOOD — disclose at the public boundary in the caller
  export circuit register(): [] {
    const pk = computeKey();
    authority = disclose(pk);
  }
  ```

- [ ] **Constructor witness usage: valid but prefer parameters.** Constructors in Compact can access witness functions. However, the common pattern is to pass initialization values as constructor parameters for simplicity and testability. If a constructor calls witnesses, verify that the deployment workflow correctly provides the witness implementation at deploy time.

  ```compact
  // VALID but complex — constructor calling a witness function
  constructor() {
    const sk = local_secret_key();
    authority = disclose(publicKey(sk));
  }

  // PREFERRED — pass initial values as constructor parameters (simpler deployment)
  // (constructor parameters are witness data too, so disclose them on write)
  constructor(initial_authority: Bytes<32>) {
    authority = disclose(initial_authority);
  }
  ```

## Type Error Checklist

Check the contract for type mismatches, incorrect casts, and wrong method names that will cause compiler rejections.

- [ ] **`Uint<N>` to `Bytes<M>` casts.** Do not flag a direct `Uint<N> as Bytes<M>` cast: it compiles on compiler 0.31.1. Casting through `Field` (`value as Field as Bytes<32>`) also compiles. Flag a cast only when `COMPILE_RESULT` reports one.

  ```compact
  // Both compile on 0.31.1
  const value: Uint<64> = 42;
  const direct = value as Bytes<32>;
  const viaField = value as Field as Bytes<32>;
  ```

  > **Tool:** `COMPILE_RESULT` will show `cannot cast from type X to type Y` for a cast the compiler rejects.

- [ ] **`Boolean` to `Field` cast is direct.** `Boolean` can be cast directly to `Field` without an intermediate step. This is a common source of unnecessary complexity — LLMs sometimes generate a multi-step cast through `Uint<8>` which works but is not required.

  ```compact
  // GOOD — direct Boolean to Field cast is supported
  const flag: Boolean = true;
  const field_value = flag as Field;

  // ALSO WORKS but unnecessary — multi-step cast through Uint<8>
  const flag: Boolean = true;
  const field_value = flag as Uint<8> as Field;
  ```

- [ ] **Relational operators (`<`, `>`, `<=`, `>=`) used on `Field` type.** The `Field` type does not support relational (ordering) operators because field elements do not have a natural total ordering. If you need to compare field values, cast them to `Uint<N>` first where ordering is defined.

  ```compact
  // BAD — relational operators not supported on Field
  const a: Field = 10;
  const b: Field = 20;
  assert(a < b, "a must be less than b");
  // Compiler error: incompatible combination of types Field and Field for relational operator

  // GOOD — cast to Uint for comparison
  const a: Field = 10;
  const b: Field = 20;
  assert(a as Uint<64> < b as Uint<64>, "a must be less than b");
  ```

- [ ] **Mixing `Field` and `Uint<N>` in arithmetic expressions.** `Uint` is a subtype of `Field`. In mixed arithmetic, `Uint` operands are implicitly widened to `Field`. This means the result is a `Field`, not a `Uint` — losing the range constraint. If you need the result to remain a `Uint`, cast explicitly after the operation.

  ```compact
  // WORKS — Uint is implicitly widened to Field; result is Field
  const field_val: Field = 100;
  const uint_val: Uint<64> = 5;
  const result = field_val + uint_val;
  // result is Field (Uint<64> implicitly widened)

  // If you need a Uint result, cast explicitly:
  const field_val: Field = 100;
  const uint_val: Uint<64> = 5;
  const result = (field_val + uint_val) as Uint<64>;
  ```

- [ ] **Arithmetic result type widening: `Uint<8> + Uint<8>` produces a wider type.** When two `Uint<N>` values are added, the result type widens to accommodate the full range of possible values (e.g., two `Uint<8>` values can sum to at most 510, so the result is a range type). This means the result may not fit back into the original type without an explicit cast. Assignments to narrower types will fail without a cast.

  ```compact
  // BAD — result is wider than Uint<8>, cannot assign without cast
  const a: Uint<8> = 100;
  const b: Uint<8> = 50;
  const c: Uint<8> = a + b;
  // Compiler error: mismatch between actual type Uint<0..511> and declared type Uint<8> of const binding

  // GOOD — explicit cast back to narrower type
  const a: Uint<8> = 100;
  const b: Uint<8> = 50;
  const c: Uint<8> = (a + b) as Uint<8>;
  ```

- [ ] **Missing generic parameters on data structure types.** Some Compact data structures require multiple generic parameters. A common mistake is omitting the depth parameter on `MerkleTree` or `HistoricMerkleTree`, which require both a depth and a leaf type.

  ```compact
  // BAD — missing depth parameter
  export ledger members: MerkleTree<Bytes<32>>;
  // Compiler error: mismatch between actual number 1 and declared number 2 of ADT parameters for MerkleTree

  // GOOD — include depth and leaf type
  export ledger members: MerkleTree<16, Bytes<32>>;
  ```

- [ ] **`Counter.value()` instead of `Counter.read()`.** The `Counter` type does not have a `.value()` method. The correct method to read the current counter value is `.read()`. LLMs frequently hallucinate `.value()` from other language patterns.

  ```compact
  // BAD — .value() does not exist on Counter
  const current = counter.value();
  // Compiler error: operation value undefined for ledger field type Counter

  // GOOD — use .read()
  const current = counter.read();
  ```

  > **Tool:** `COMPILE_RESULT` will show `operation value undefined for ledger field type Counter`.

- [ ] **`Map.get(key)` instead of `Map.lookup(key)`.** The `Map` type does not have a `.get()` method. The correct method to retrieve a value by key is `.lookup(key)`. LLMs hallucinate `.get()` from JavaScript `Map` or other language standard libraries.

  ```compact
  // BAD — .get() does not exist on Map
  const balance = balances.get(account);
  // Compiler error: operation get undefined for ledger field type Map<…>

  // GOOD — use .lookup() (disclose a parameter used as a key)
  const balance = balances.lookup(disclose(account));
  ```

  > **Tool:** `COMPILE_RESULT` will show `operation get undefined for ledger field type Map<…>`. Use `octocode` to search the LFDT-Minokawa/compact repository for correct Map usage patterns in reference code.

- [ ] **`Map.has(key)` instead of `Map.member(key)`.** The `Map` type does not have a `.has()` method. The correct method to check whether a key exists is `.member(key)`. LLMs hallucinate `.has()` from JavaScript `Map` or similar APIs.

  ```compact
  // BAD — .has() does not exist on Map
  if (balances.has(account)) {
    // ...
  }
  // Compiler error: operation has undefined for ledger field type Map<…>

  // GOOD — use .member() (disclose a parameter used as a key)
  if (balances.member(disclose(account))) {
    // ...
  }
  ```

## Common Hallucination Traps

Check the contract for functions and types that LLMs commonly invent but do not exist in Compact. These are the most frequent hallucinations found in LLM-generated Compact code.

- [ ] **`hash()` instead of `persistentHash<T>()` or `transientHash<T>()`.** There is no generic `hash()` function in Compact. The correct functions are `persistentHash<T>()` (deterministic, for values that must be reproducible) or `transientHash<T>()` (non-deterministic, for one-time use). Both require an explicit type parameter.

  ```compact
  // BAD — hash() does not exist
  const h = hash(input);

  // GOOD — use the specific hash function with type parameter
  const h = persistentHash<Bytes<32>>(input);
  // or
  const h2 = transientHash<Bytes<32>>(input);
  ```

  > **Tool:** `COMPILE_RESULT` will show `unbound identifier hash`.

- [ ] **`verify()` as a general verification function.** There is no general `verify()` function in Compact. Verification is done through `assert()` for condition checks, `checkRoot()` for Merkle tree root verification, or specific cryptographic operations. LLMs invent `verify()` because it sounds natural.

  ```compact
  // BAD — verify() does not exist
  verify(proof, publicInput);
  verify(signature, message, publicKey);

  // GOOD — use assert() for condition checks
  assert(condition, "Verification failed");
  // GOOD — use checkRoot() for Merkle verification
  assert(tree.checkRoot(disclose(root)), "Invalid root");
  ```

- [ ] **`encrypt()` / `decrypt()` functions.** Compact does not provide encryption or decryption operations. Privacy in Midnight is achieved through the zero-knowledge proof system and the `disclose()` mechanism, not through encryption. If data must be hidden, use commitments (`persistentCommit`) or keep it off-chain in witness state.

  ```compact
  // BAD — encrypt/decrypt do not exist in Compact
  const ciphertext = encrypt(plaintext, key);
  const decrypted = decrypt(ciphertext, key);

  // GOOD — use commitments for hiding data
  const salt = get_randomness();
  const hidden = persistentCommit<Field>(value, salt);
  ```

- [ ] **`random()` function.** There is no `random()` function available in Compact circuits. Circuits are deterministic by nature. Randomness must be sourced from a witness function (e.g., `get_randomness()`) which runs outside the circuit in the TypeScript witness provider.

  ```compact
  // BAD — random() does not exist in circuits
  const nonce = random();

  // GOOD — source randomness from a witness function
  witness get_randomness(): Bytes<32>;

  export circuit next_nonce(): Bytes<32> {
    const nonce = get_randomness();
    return disclose(nonce);
  }
  ```

- [ ] **`public_key()` or `publicKey()` instead of domain-separated hash.** Neither `public_key()` nor `publicKey()` exists in the Compact standard library. LLMs frequently hallucinate these function names. The correct pattern for deriving a public key is a domain-separated hash:

  ```compact
  // BAD — neither function exists (unbound identifier error)
  const pk = public_key(sk);
  const pk = publicKey(sk);

  // GOOD — domain-separated hash pattern
  const pk = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:pk:"), sk]);
  ```

- [ ] **`CurvePoint` or `NativePoint` instead of `JubjubPoint`.** The correct type name for elliptic curve points in Compact is `JubjubPoint`. `CurvePoint` was the oldest name and `NativePoint` was the intermediate name — both are now rejected by the compiler. LLMs hallucinate `CurvePoint`, `NativePoint`, or `EllipticCurvePoint` because they appear in older documentation or are invented from convention.

  ```compact
  // BAD — CurvePoint is not a valid Compact type (oldest name, rejected by compiler)
  const point: CurvePoint = computePoint(scalar);

  // BAD — NativePoint is not a valid Compact type (old name, rejected by compiler)
  const point: NativePoint = computePoint(scalar);

  // BAD — EllipticCurvePoint does not exist in Compact
  const point: EllipticCurvePoint = computePoint(scalar);

  // GOOD — JubjubPoint is the correct current type name
  const point: JubjubPoint = computePoint(scalar);
  ```

  > **Tool:** `COMPILE_RESULT` will show `apparent use of an old standard-library / ledger operator name CurvePoint` (or `NativePoint`) on compiler 0.31.1, and `unbound identifier CurvePoint` on 0.35.0. Use `octocode` to search the LFDT-Minokawa/compact repository to confirm `JubjubPoint` as the current type name.

- [ ] **`CoinInfo` instead of `ShieldedCoinInfo` or `QualifiedShieldedCoinInfo`.** The correct type names for coin information in Compact are `ShieldedCoinInfo` or `QualifiedShieldedCoinInfo`, not `CoinInfo`. LLMs simplify the type name because `CoinInfo` is shorter.

  ```compact
  // BAD — CoinInfo is not a valid type
  const coin: CoinInfo = getCoinDetails();

  // GOOD — use the correct type name
  const coin: ShieldedCoinInfo = getCoinDetails();
  // or
  const qcoin: QualifiedShieldedCoinInfo = getQualifiedCoinDetails();
  ```

## Compiler Error Quick Reference

Quick reference of common compiler error patterns, their likely causes, and fixes.

| Error Pattern | Likely Cause | Fix |
|---|---|---|
| `potential witness-value disclosure must be declared but is not: …` | Witness-derived value (including a circuit parameter) flows to a public context (ledger write, branch condition, return from exported circuit) without `disclose()` | Add `disclose()` at the point where the value crosses the public boundary |
| `unbound identifier Void` | `Void` used as a return type (e.g., `circuit foo(): Void {`) | Use `[]` as the return type for circuits that return nothing |
| `parse error: found "{" looking for an identifier` | Deprecated ledger block syntax (`ledger { ... }`) | Use individual `export ledger` declarations |
| `parse error: found "{" looking for ";"` | A witness declared with a body (`witness w(): T { ... }`) | End the witness declaration with `;` and implement it in TypeScript |
| `parse error: found keyword "function" (which is reserved for future use) looking for "circuit"` | `pure function` instead of `pure circuit` | Use `pure circuit` (or `circuit`) |
| `cannot cast from type X to type Y` | A cast the compiler does not allow | Check the cast rules; note that `Uint<N> as Bytes<M>` and `Boolean as Field` are both direct casts on 0.31.1 |
| `operation value undefined for ledger field type Counter` | Using `.value()` instead of `.read()` on a `Counter` | Replace `.value()` with `.read()` |
| `operation get undefined for ledger field type Map<…>` | Using `.get(key)` instead of `.lookup(key)` on a `Map` | Replace `.get()` with `.lookup()` |
| `operation has undefined for ledger field type Map<…>` | Using `.has(key)` instead of `.member(key)` on a `Map` | Replace `.has()` with `.member()` |
| `parse error: found keyword "delete" (which is reserved for future use) …` | Using `.delete(key)` on a `Map` (`delete` is a reserved word) | Replace `.delete()` with `.remove()` |
| `recursion involving <circuit>` | A circuit calls itself directly or through mutual recursion | Rewrite with `fold` or `map` over a fixed-size vector, or restructure logic to avoid recursion |
| `mismatch between actual number N and declared number M of ADT parameters for <ADT>` | Missing generic parameters on a data structure (e.g., `MerkleTree<Bytes<32>>` instead of `MerkleTree<16, Bytes<32>>`) | Add all required type parameters; check documentation for the type's full generic signature |
| `mismatch between actual type Uint<0..N> and declared type Uint<M> of const binding` | Arithmetic widening — `Uint<8> + Uint<8>` produces `Uint<0..511>`, which cannot be bound as `Uint<8>` | Add explicit cast to narrow the result: `(a + b) as Uint<8>` |
| `expected left-hand side of = to have an ADT type, received …` | Reassigning a `const` binding | Bind the new value to a new `const` |
| `unbound identifier hash` | Using `hash()` instead of `persistentHash<T>()` or `transientHash<T>()` | Use the correct hash function with explicit type parameter |
| Witness-related deployment error in constructor | Constructor calls a witness but the deployment workflow does not provide the witness implementation | Ensure witness providers are available at deploy time, or prefer passing initial values as constructor parameters |
| `incompatible combination of types Field and Field for relational operator` | Using relational operators on `Field` type | Cast to `Uint<N>` before comparison: `(a as Uint<64>) < (b as Uint<64>)` |

> Messages verified 2026-10-09 by compiling each pattern with Compact compiler 0.31.1 (language 0.23.0), and re-checked on 0.35.0. Mixing `Field` and `Uint<N>` in `+` compiles on both versions (the `Uint` operand widens to `Field`). Mixing them in `==` compiles on 0.31.1, but 0.35.0 rejects it with `incompatible types Field and Uint<64> for equality operator`, so recommend `f == (u as Field)`.
