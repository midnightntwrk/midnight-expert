# Code Quality & Best Practices Review Checklist

Review checklist for the **Code Quality & Best Practices** category. This covers naming conventions, circuit complexity, dead code detection, standard library usage verification, Compact idioms, and code duplication. These items catch maintainability and correctness issues that do not fall under security or performance but still affect long-term contract health. Apply every item below to the contract under review.

## Shared Evidence

The orchestrator runs `compact compile --skip-zk` on the contract before dispatching reviewers. The resulting `COMPILE_RESULT` (full stdout/stderr from the compiler) is provided in your prompt. Reference this compilation output when evaluating checklist items. Read the contract source files directly to inspect structure, declarations, and patterns.

## Naming Conventions Checklist

Check every identifier in the contract for consistent and idiomatic naming. Compact follows specific conventions that differ from Solidity, Rust, and TypeScript. Inconsistent naming reduces readability and makes review harder.

- [ ] **Circuit names should use camelCase.** All circuits — exported, internal, and pure — should follow camelCase naming. This matches the convention used across the Compact standard library and official examples.

  ```compact
  // BAD — PascalCase or snake_case circuit names
  circuit TransferTokens(to: Bytes<32>, amount: Field): [] {
    // ...
  }
  circuit check_balance(account: Bytes<32>): Field {
    // ...
  }

  // GOOD — camelCase circuit names
  circuit transferTokens(to: Bytes<32>, amount: Field): [] {
    // ...
  }
  circuit checkBalance(account: Bytes<32>): Field {
    // ...
  }
  ```

- [ ] **Ledger variable names should use camelCase (or snake_case if the project is consistent).** Ledger variables appear in the contract's public API when exported. The primary convention is camelCase, but snake_case is acceptable if the entire project uses it consistently. Mixing both styles in a single contract is a code quality issue.

  ```compact
  // BAD — mixed naming styles in the same contract
  export ledger voteCount: Counter;
  export ledger total_supply: Field;
  export ledger MemberList: Set<Bytes<32>>;

  // GOOD — consistent camelCase throughout
  export ledger voteCount: Counter;
  export ledger totalSupply: Field;
  export ledger memberList: Set<Bytes<32>>;

  // ALSO GOOD — consistent snake_case throughout (if project convention)
  export ledger vote_count: Counter;
  export ledger total_supply: Field;
  export ledger member_list: Set<Bytes<32>>;
  ```

- [ ] **Types, structs, and enums should use PascalCase.** All user-defined type names — structs, enums (called `enum` in Compact), and type aliases — must use PascalCase. This matches the Compact standard library types (`Maybe<T>`, `Either<A, B>`, `MerkleTreePath<N, T>`) and the built-in types (`Counter`, `Boolean`, `Field`).

  ```compact
  // BAD — lowercase or camelCase type names
  enum gameState { setup, playing, finished }
  struct tokenInfo {
    owner: Bytes<32>;
    amount: Field;
  }

  // GOOD — PascalCase type names
  enum GameState { Setup, Playing, Finished }
  struct TokenInfo {
    owner: Bytes<32>;
    amount: Field;
  }
  ```

- [ ] **Enum variants should use a consistent naming style.** Official Compact examples use varying conventions — lowercase (`apple, pear, plum` in the language reference), UPPER_SNAKE_CASE (`UNSET, SET` in lock.compact, `VACANT, OCCUPIED` in bboard.compact), and PascalCase. The key requirement is consistency within a single contract. Mixed variant styles in the same enum is a code quality issue.

  ```compact
  // BAD — mixed variant naming styles in one enum
  enum State { setup, IN_PROGRESS, Completed }

  // GOOD — consistent PascalCase variants
  enum State { Setup, InProgress, Completed }

  // ALSO GOOD — consistent UPPER_SNAKE_CASE variants (common in official examples)
  enum State { SETUP, IN_PROGRESS, COMPLETED }

  // ALSO GOOD — consistent lowercase variants (matches language reference style)
  enum State { setup, in_progress, completed }
  ```

- [ ] **Witness function names should use camelCase and be descriptive of their purpose.** Witnesses are the bridge between off-chain TypeScript and on-chain Compact. Their names should clearly communicate what data they provide. Common prefixes include `local` for secret state, `get` for retrieval, and `context` for environmental data.

  ```compact
  // BAD — vague or inconsistent witness names
  witness key(): Bytes<32>;
  witness data(): Field;
  witness GetPath(): MerkleTreePath<16, Bytes<32>>;

  // GOOD — descriptive camelCase witness names
  witness localSecretKey(): Bytes<32>;
  witness getProposalData(): Field;
  witness contextPathOf(commitment: Bytes<32>): MerkleTreePath<16, Bytes<32>>;
  ```

- [ ] **Module names should use PascalCase.** Modules are namespaces and follow the same convention as types. A module name in camelCase or snake_case is inconsistent with the language idiom.

  ```compact
  // BAD — non-PascalCase module names
  module token_helpers { /* ... */ }
  module auth { /* ... */ }

  // GOOD — PascalCase module names
  module TokenHelpers { /* ... */ }
  module Auth { /* ... */ }
  ```

## Circuit Complexity Checklist

Check every circuit for excessive complexity. Long circuits with deep nesting are harder to audit, more prone to bugs, and more expensive to prove. Each circuit should have a single, clear responsibility.

- [ ] **Circuit violates single responsibility.** A circuit should do one logical thing. If a circuit performs authorization, then modifies state, then emits a result, and then updates auxiliary data structures for an unrelated subsystem, it is doing too much. Split it into focused helper circuits composed by the exported circuit.

  ```compact
  // BAD — one circuit doing authorization, token transfer, membership update,
  // and vote counting all at once
  export circuit doEverything(
    sk: Bytes<32>,
    to: Bytes<32>,
    amount: Field,
    proposalId: Field
  ): [] {
    // Authorization
    const pk = disclose(publicKey(sk));
    assert(authority == pk, "Not authorized");
    // Token transfer
    const fromBalance = balances.lookup(pk);
    assert(fromBalance >= amount, "Insufficient balance");
    balances.insert(pk, fromBalance - amount);
    balances.insert(to, balances.lookup(to) + amount);
    // Membership update
    members.insert(disclose(to));
    // Vote counting
    votes.increment(1);
  }

  // GOOD — decomposed into focused helper circuits
  circuit verifyAuthority(sk: Bytes<32>): Bytes<32> {
    const pk = disclose(publicKey(sk));
    assert(authority == pk, "Not authorized");
    return pk;
  }

  circuit transferBalance(from: Bytes<32>, to: Bytes<32>, amount: Field): [] {
    assert(balances.member(from), "Sender not found");
    const fromBalance = balances.lookup(from);
    assert(fromBalance >= amount, "Insufficient balance");
    balances.insert(from, fromBalance - amount);
    const toBalance = balances.member(to) ? balances.lookup(to) : 0;
    balances.insert(to, toBalance + amount);
  }

  export circuit transfer(sk: Bytes<32>, to: Bytes<32>, amount: Field): [] {
    const pk = verifyAuthority(sk);
    transferBalance(pk, to, amount);
  }
  ```

- [ ] **Circuit exceeds ~50 lines.** While not a hard rule, a circuit longer than ~50 lines is a strong signal that it should be decomposed. Long circuits are difficult to review line-by-line, increase the chance of subtle bugs, and make it harder to reuse logic across the contract.

- [ ] **Deeply nested control flow.** More than 2-3 levels of nesting (if inside if inside for, etc.) makes the circuit hard to reason about. Flatten by extracting conditions into helper circuits or using guard-then-act patterns (assert early, then proceed linearly).

  ```compact
  // BAD — deeply nested control flow
  export circuit process(items: Vector<10, Field>, threshold: Field): [] {
    for (let i = 0; i < 10; i++) {
      if (items[i] > 0) {
        if (items[i] < threshold) {
          if (balances.member(items[i] as Bytes<32>)) {
            // ... deeply nested logic
          }
        }
      }
    }
  }

  // GOOD — flattened with guard assertions and helper circuit
  circuit isValidItem(item: Field, threshold: Field): Boolean {
    return item > 0 && item < threshold;
  }

  export circuit process(items: Vector<10, Field>, threshold: Field): [] {
    for (let i = 0; i < 10; i++) {
      if (isValidItem(items[i], threshold)) {
        processItem(items[i]);
      }
    }
  }
  ```

- [ ] **Pure circuits not used for reusable logic.** If a circuit does not read or write any ledger state, it should be declared as a `pure circuit`. The `pure` modifier signals that a circuit should have no side effects; the compiler's `identify-pure-circuits` pass checks for ledger access, witness calls, and calls to impure circuits. It primarily affects whether the circuit generates ZK proving keys and appears in `pureCircuits` exports. Look for internal circuits that only compute values from their parameters without accessing ledger variables.

  ```compact
  // BAD — circuit marked as regular but has no side effects
  circuit computeHash(domain: Bytes<32>, value: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([domain, value]);
  }

  // GOOD — pure circuit signals no side effects
  pure circuit computeHash(domain: Bytes<32>, value: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([domain, value]);
  }
  ```

  > **Tool:** Read the contract source to identify all circuits and whether they access ledger state. Flag any non-pure circuit that could be marked `pure`. Use `octocode` to search the LFDT-Minokawa/compact repository for idiomatic use of `pure circuit` in reference contracts.

## Dead Code Detection Checklist

Check the contract for code that serves no purpose. Dead code increases audit surface, confuses reviewers, and may mask missing functionality.

- [ ] **Unused ledger variables (declared but never read or written).** A ledger variable that is declared but never referenced in any circuit adds to the contract's state footprint without providing value. It may indicate incomplete implementation or leftover code from a removed feature.

  ```compact
  // BAD — ledger variable declared but never used in any circuit
  export ledger oldBalance: Field;
  export ledger currentBalance: Field;
  export ledger balances: Map<Bytes<32>, Field>;

  export circuit getBalance(account: Bytes<32>): Field {
    // Only uses balances; oldBalance and currentBalance are never touched
    assert(balances.member(account), "Account not found");
    return disclose(balances.lookup(account));
  }
  ```

  Review action: search every circuit body for references to each ledger variable. Any ledger variable with zero references should be flagged for removal or investigation.

  > **Tool:** Read the contract source to identify all ledger declarations. Cross-reference each against usage in circuit bodies.

- [ ] **Unused circuits (defined but never called).** An internal or pure circuit that is defined but never called from any other circuit is dead code. It increases audit surface without contributing to contract behavior. Note: `export circuit` declarations are always callable externally, so they are not dead code even if not called internally.

  ```compact
  // BAD — helper circuit defined but never called
  circuit computeNullifier(sk: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([pad(32, "app:nul:"), sk]);
  }

  // This circuit is the only exported one and does not call computeNullifier
  export circuit register(pk: Bytes<32>): [] {
    members.insert(disclose(pk));
  }
  ```

  Review action: for every non-exported circuit, search for at least one call site. If none exists, flag it.

- [ ] **Unreachable code after unconditional `assert(false)` or early structural exits.** Code after `assert(false, ...)` can never execute because the assertion always fails. This is sometimes used as a placeholder but should not appear in production code.

  ```compact
  // BAD — unreachable code after assert(false)
  export circuit placeholder(): [] {
    assert(false, "Not implemented");
    // Everything below is unreachable
    counter.increment(1);
    state = State.Active;
  }
  ```

- [ ] **Commented-out code left in production.** Blocks of commented-out Compact code suggest incomplete refactoring. Commented-out code should be removed before review; version control preserves history.

  ```compact
  // BAD — commented-out code left in the contract
  export circuit transfer(to: Bytes<32>, amount: Field): [] {
    // const fee = amount / 100;
    // treasury.insert(treasuryAddr, fee);
    // amount = amount - fee;
    const senderBalance = balances.lookup(sender);
    assert(senderBalance >= amount, "Insufficient balance");
    balances.insert(sender, senderBalance - amount);
    balances.insert(to, amount);
  }
  ```

- [ ] **Unused witness declarations.** A witness function declared but never called in any circuit is dead code. It adds unnecessary complexity to the TypeScript witness provider without being used on-chain.

  ```compact
  // BAD — witness declared but never called in any circuit
  witness getTimestamp(): Field;
  witness localSecretKey(): Bytes<32>;

  export circuit register(pk: Bytes<32>): [] {
    // Only uses pk parameter; neither witness is called
    members.insert(disclose(pk));
  }
  ```

## Standard Library Usage Checklist (Hallucination Guard)

Verify that every standard library call in the contract actually exists in `CompactStandardLibrary`. LLM-generated Compact code frequently invents plausible-sounding functions that do not exist. Each item below lists a common hallucination and its correct replacement.

- [ ] **Verify every stdlib function call exists.** For each function call in the contract, confirm it is a real `CompactStandardLibrary` function. Key stdlib functions include: `persistentHash<T>()`, `transientHash<T>()`, `persistentCommit<T>()`, `transientCommit<T>()`, `disclose()`, `assert()`, `pad()`, `default<T>()`, `some<T>()`, `none<T>()`, `left<A, B>()`, `right<A, B>()`, `slice<N>()`, `merkleTreePathRoot<N, T>()`, `merkleTreePathRootNoLeafHash<N, T>()`, `ownPublicKey()`, `evolveNonce()`, `mergeCoin()`, `ecAdd()`, `ecMul()`, `ecMulGenerator()`, `hashToCurve()`, `degradeToTransient()`, `upgradeFromTransient()`, and ADT methods on `Counter`, `Map`, `Set`, `List`, `MerkleTree`, and `HistoricMerkleTree`, plus token operations like `mintShieldedToken()`, `sendShielded()`, `receiveShielded()`, `sendImmediateShielded()`, `mintUnshieldedToken()`, `sendUnshielded()`, `unshieldedBalance()`, `unshieldedBalanceGt()`, `unshieldedBalanceLt()`, `unshieldedBalanceGte()`, `unshieldedBalanceLte()`. Note: `publicKey()` is NOT a stdlib function — it is commonly defined as a user-created helper circuit using `persistentHash` with domain separation.

  > **Tool:** `COMPILE_RESULT` will show `unknown function` or `operation undefined` errors for any hallucinated API calls. Use `octocode` to search the LFDT-Minokawa/compact repository for the authoritative list of valid stdlib functions. Cross-reference every function call in the contract against these two sources.

- [ ] **`hash()` does not exist.** Use `persistentHash<T>()` for deterministic hashing or `transientHash<T>()` for circuit-efficient one-time hashing. Both require an explicit type parameter.

  ```compact
  // BAD — hash() is not a Compact function
  const h = hash(input);

  // GOOD — use the specific hash function with type parameter
  const h = persistentHash<Bytes<32>>(input);
  ```

  > **Tool:** `COMPILE_RESULT` will show `unbound identifier hash` if present.

- [ ] **`verify()` does not exist.** There is no general verification function. Use `assert()` for condition checks and `checkRoot()` for Merkle tree root verification.

  ```compact
  // BAD — verify() is not a Compact function
  verify(proof, publicInput);

  // GOOD — use assert for condition checks
  assert(condition, "Verification failed");
  // GOOD — use checkRoot for Merkle verification
  assert(tree.checkRoot(disclose(root)), "Invalid root");
  ```

- [ ] **`encrypt()` / `decrypt()` do not exist.** Compact does not provide encryption. Privacy is achieved through the zero-knowledge proof system and disclosure control, not through symmetric or asymmetric encryption.

  ```compact
  // BAD — encrypt/decrypt are not Compact functions
  const ciphertext = encrypt(plaintext, key);
  const recovered = decrypt(ciphertext, key);

  // GOOD — use commitments to hide values
  const salt = getRandom();
  const hidden = persistentCommit<Field>(value, salt);
  ```

- [ ] **`random()` does not exist.** Circuits are deterministic. Randomness must come from a witness function implemented in the TypeScript provider.

  ```compact
  // BAD — random() is not available in circuits
  const nonce = random();

  // GOOD — source randomness from a witness
  witness getRandom(): Bytes<32>;
  // Then in a circuit:
  const nonce = getRandom();
  ```

- [ ] **`counter.value()` does not exist.** The correct method is `counter.read()`, which returns `Uint<64>`.

  ```compact
  // BAD — .value() does not exist on Counter
  const current = counter.value();

  // GOOD — use .read()
  const current = counter.read();
  ```

  > **Tool:** `COMPILE_RESULT` will show `operation value undefined for ledger field type Counter`.

- [ ] **`map.get()` does not exist.** The correct method is `map.lookup()`. LLMs hallucinate `.get()` from JavaScript's `Map`.

  ```compact
  // BAD — .get() does not exist on Map
  const balance = balances.get(account);

  // GOOD — use .lookup()
  const balance = balances.lookup(account);
  ```

- [ ] **`map.has()` does not exist.** The correct method is `map.member()`. LLMs hallucinate `.has()` from JavaScript's `Map` or `Set`.

  ```compact
  // BAD — .has() does not exist on Map
  if (balances.has(account)) { /* ... */ }

  // GOOD — use .member()
  if (balances.member(account)) { /* ... */ }
  ```

- [ ] **`CoinInfo` does not exist.** The correct type is `ShieldedCoinInfo` (or `QualifiedShieldedCoinInfo` for qualified variants).

  ```compact
  // BAD — CoinInfo is not a valid type
  const coin: CoinInfo = getCoinDetails();

  // GOOD — use the correct type name
  const coin: ShieldedCoinInfo = getCoinDetails();
  ```

- [ ] **`CurvePoint`, `NativePoint`, or `EllipticCurvePoint` do not exist.** The correct type name is `JubjubPoint`. Older documentation referenced `CurvePoint`, then `NativePoint`, but both have been superseded.

  ```compact
  // BAD — CurvePoint, NativePoint, and EllipticCurvePoint are not valid types
  const point: CurvePoint = getPoint();
  const point: NativePoint = getPoint();
  const point: EllipticCurvePoint = getPoint();

  // GOOD — use the current type name
  const point: JubjubPoint = getPoint();
  ```

  > **Tool:** `COMPILE_RESULT` will show an unknown type error. Use `octocode` to search the LFDT-Minokawa/compact repository to confirm `JubjubPoint` as the current type name.

## Compact Idioms Checklist

Check the contract for idiomatic Compact patterns. Non-idiomatic code is harder to review, may hide bugs, and misses opportunities for clarity and safety.

- [ ] **Guard-then-act pattern: assert first, modify state second.** Every exported circuit should validate all preconditions at the top before performing any state modifications. This makes the circuit easier to reason about: either all assertions pass and the circuit proceeds, or a precondition fails and no state is touched.

  ```compact
  // BAD — state modified before all checks are complete
  export circuit withdraw(amount: Field): [] {
    const current = balances.lookup(account);
    balances.insert(account, current - amount);  // State modified
    assert(amount > 0, "Amount must be positive");  // Check comes AFTER modification
    assert(current >= amount, "Insufficient");  // Check comes AFTER modification
  }

  // GOOD — all guards first, then state modifications
  export circuit withdraw(amount: Field): [] {
    assert(amount > 0, "Amount must be positive");
    assert(balances.member(account), "Account not found");
    const current = balances.lookup(account);
    assert(current >= amount, "Insufficient balance");
    balances.insert(account, current - amount);
  }
  ```

- [ ] **Prefer `default<T>` over zero-construction for initial values.** When initializing a value to its type's default (zero for `Field`, false for `Boolean`, zero-bytes for `Bytes<N>`), use `default<T>` instead of manually constructing the zero value. This is self-documenting and resilient to type changes.

  ```compact
  // BAD — manual zero construction
  const emptyHash: Bytes<32> = 0 as Field as Bytes<32>;
  const initialState: Field = 0;

  // GOOD — use default<T> for type-safe defaults
  const emptyHash: Bytes<32> = default<Bytes<32>>;
  const initialState: Field = default<Field>;
  ```

- [ ] **Use `pad(N, "string")` for fixed-width byte padding.** When constructing domain strings for hashing, use `pad(N, "string")` to produce a fixed-width `Bytes<N>` value. Do not manually pad with zeros or cast from arbitrary strings.

  ```compact
  // BAD — manual padding attempt
  const domain: Bytes<32> = "myapp:pk:" as Bytes<32>;

  // GOOD — use pad() for fixed-width byte construction
  const domain: Bytes<32> = pad(32, "myapp:pk:");

  // GOOD — pad() used inline in hash construction (common pattern)
  const pk = persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"),
    sk
  ]);
  ```

- [ ] **Use destructuring with `slice<N>()` for vector extraction.** When extracting a contiguous sub-vector from a larger vector, use `slice<N>()` with destructuring. This is more readable and less error-prone than manual index access.

  ```compact
  // BAD — manual index access for contiguous elements
  const first = data[0];
  const second = data[1];
  const third = data[2];

  // GOOD — destructuring with slice for contiguous extraction
  const [first, second, third] = slice<3>(data, 0);
  ```

- [ ] **Type-safe enum comparison: use `State.Active` not magic numbers.** Never compare state against raw numeric values. Always use the enum variant name. Magic numbers obscure intent and break if enum ordering changes.

  ```compact
  // BAD — magic number comparison; fragile and unreadable
  assert(state == 1, "Not in active state");

  // BAD — string comparison; not how Compact enums work
  assert(state == "active", "Not in active state");

  // GOOD — type-safe enum comparison
  assert(state == State.Active, "Not in active state");
  ```

- [ ] **Consistent use of `disclose()` at the public boundary.** The `disclose()` call should appear at the point where a witness-derived value crosses into the public domain (ledger write, return from exported circuit). Wrapping values too early makes it harder to track what is public and what is private. Wrapping too late causes compiler errors.

  ```compact
  // BAD — disclose deep inside helper; unclear where value becomes public
  circuit computePk(sk: Bytes<32>): Bytes<32> {
    return disclose(persistentHash<Vector<2, Bytes<32>>>([
      pad(32, "app:pk:"),
      sk
    ]));
  }

  export circuit register(sk: Bytes<32>): [] {
    const pk = computePk(sk);  // Already disclosed, but not obvious
    authority = pk;
  }

  // GOOD — disclose at the public boundary in the exported circuit
  circuit computePk(sk: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([
      pad(32, "app:pk:"),
      sk
    ]);
  }

  export circuit register(sk: Bytes<32>): [] {
    const pk = computePk(sk);
    authority = disclose(pk);  // Clear: this is where the value goes public
  }
  ```

## Code Duplication Checklist

Check the contract for repeated logic that should be extracted into reusable circuits. Duplication increases the chance of inconsistent fixes, makes the contract harder to maintain, and bloats the audit surface.

- [ ] **Same logic repeated in multiple circuits: extract to a helper circuit.** If two or more exported circuits contain the same sequence of operations (e.g., authorization check, balance lookup, hash computation), extract that logic into a shared internal circuit. This ensures that a bug fix or improvement is applied once, not in every copy.

  ```compact
  // BAD — authorization logic duplicated in every exported circuit
  export circuit transfer(to: Bytes<32>, amount: Field): [] {
    const sk = localSecretKey();
    const pk = disclose(publicKey(sk));
    assert(authority == pk, "Not authorized");
    // ... transfer logic
  }

  export circuit mint(amount: Field): [] {
    const sk = localSecretKey();
    const pk = disclose(publicKey(sk));
    assert(authority == pk, "Not authorized");
    // ... mint logic
  }

  export circuit burn(amount: Field): [] {
    const sk = localSecretKey();
    const pk = disclose(publicKey(sk));
    assert(authority == pk, "Not authorized");
    // ... burn logic
  }

  // GOOD — authorization extracted to a helper circuit
  circuit requireAuthority(): Bytes<32> {
    const sk = localSecretKey();
    const pk = disclose(publicKey(sk));
    assert(authority == pk, "Not authorized");
    return pk;
  }

  export circuit transfer(to: Bytes<32>, amount: Field): [] {
    const pk = requireAuthority();
    // ... transfer logic
  }

  export circuit mint(amount: Field): [] {
    requireAuthority();
    // ... mint logic
  }

  export circuit burn(amount: Field): [] {
    requireAuthority();
    // ... burn logic
  }
  ```

- [ ] **Same validation repeated: extract to a validation circuit.** If the same set of assertions appears in multiple circuits (e.g., checking that an account exists and has sufficient balance), extract them into a dedicated validation circuit.

  ```compact
  // BAD — balance validation duplicated
  export circuit transfer(to: Bytes<32>, amount: Field): [] {
    assert(amount > 0, "Amount must be positive");
    assert(balances.member(sender), "Sender not found");
    const balance = balances.lookup(sender);
    assert(balance >= amount, "Insufficient balance");
    // ... transfer logic
  }

  export circuit withdraw(amount: Field): [] {
    assert(amount > 0, "Amount must be positive");
    assert(balances.member(sender), "Sender not found");
    const balance = balances.lookup(sender);
    assert(balance >= amount, "Insufficient balance");
    // ... withdraw logic
  }

  // GOOD — validation extracted to a reusable circuit
  circuit validateSufficientBalance(
    account: Bytes<32>,
    amount: Field
  ): Field {
    assert(amount > 0, "Amount must be positive");
    assert(balances.member(account), "Account not found");
    const balance = balances.lookup(account);
    assert(balance >= amount, "Insufficient balance");
    return balance;
  }

  export circuit transfer(to: Bytes<32>, amount: Field): [] {
    const balance = validateSufficientBalance(sender, amount);
    balances.insert(sender, balance - amount);
    const toBalance = balances.member(to) ? balances.lookup(to) : 0;
    balances.insert(to, toBalance + amount);
  }

  export circuit withdraw(amount: Field): [] {
    const balance = validateSufficientBalance(sender, amount);
    balances.insert(sender, balance - amount);
  }
  ```

- [ ] **Similar struct or hash construction repeated: extract to a constructor circuit.** If the same struct literal or hash computation with the same domain string appears in multiple places, extract it into a dedicated circuit. This ensures consistency and prevents domain-string typos across copies.

  ```compact
  // BAD — same hash construction repeated with risk of domain-string typo
  export circuit register(sk: Bytes<32>): [] {
    const pk = persistentHash<Vector<2, Bytes<32>>>([
      pad(32, "myapp:pk:"), sk
    ]);
    authority = disclose(pk);
  }

  export circuit verify(sk: Bytes<32>): [] {
    const pk = persistentHash<Vector<2, Bytes<32>>>([
      pad(32, "myapp:pk:"), sk  // Must match exactly — easy to mistype
    ]);
    assert(authority == disclose(pk), "Not authorized");
  }

  // GOOD — hash construction extracted to a dedicated circuit
  pure circuit derivePublicKey(sk: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([
      pad(32, "myapp:pk:"), sk
    ]);
  }

  export circuit register(sk: Bytes<32>): [] {
    authority = disclose(derivePublicKey(sk));
  }

  export circuit verify(sk: Bytes<32>): [] {
    assert(authority == disclose(derivePublicKey(sk)), "Not authorized");
  }
  ```

- [ ] **Duplicated nullifier construction across circuits.** Nullifier derivation must be identical wherever it is computed (same domain string, same inputs, same hash function). If the derivation is duplicated rather than extracted, a typo in one copy creates a subtle bug where nullifiers do not match across circuits.

  ```compact
  // BAD — nullifier constructed inline in two circuits; typo risk
  export circuit commit(sk: Bytes<32>): [] {
    const nul = persistentHash<Vector<3, Bytes<32>>>(
      [pad(32, "app:vote-nul:"), round as Field as Bytes<32>, sk]
    );
    assert(!usedNullifiers.member(disclose(nul)), "Already committed");
    usedNullifiers.insert(disclose(nul));
  }

  export circuit reveal(sk: Bytes<32>, value: Field): [] {
    const nul = persistentHash<Vector<3, Bytes<32>>>(
      [pad(32, "app:vote-nul:"), round as Field as Bytes<32>, sk]
    );
    assert(usedNullifiers.member(disclose(nul)), "Must commit first");
    // ... reveal logic
  }

  // GOOD — nullifier construction extracted to a single source of truth
  pure circuit voteNullifier(roundVal: Field, sk: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<3, Bytes<32>>>(
      [pad(32, "app:vote-nul:"), roundVal as Bytes<32>, sk]
    );
  }

  export circuit commit(sk: Bytes<32>): [] {
    const nul = voteNullifier(round as Field, sk);
    assert(!usedNullifiers.member(disclose(nul)), "Already committed");
    usedNullifiers.insert(disclose(nul));
  }

  export circuit reveal(sk: Bytes<32>, value: Field): [] {
    const nul = voteNullifier(round as Field, sk);
    assert(usedNullifiers.member(disclose(nul)), "Must commit first");
    // ... reveal logic
  }
  ```

## Anti-Patterns Table

Quick reference of common code quality anti-patterns in Compact contracts.

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| Mixed naming conventions (camelCase + snake_case) in one contract | Inconsistency makes the code harder to read and review; signals careless authorship | Pick one convention and apply it consistently throughout the contract |
| Circuit doing authorization + business logic + auxiliary updates | Violates single responsibility; harder to audit, test, and reuse individual pieces | Decompose into focused helper circuits; compose in the exported circuit |
| Circuit > 50 lines | Difficult to review line-by-line; high chance of subtle bugs hiding in the length | Extract logical blocks into helper or pure circuits |
| Deeply nested if/for (> 3 levels) | Hard to reason about all code paths; increases audit complexity | Flatten with guard assertions; extract inner logic to helper circuits |
| Unused ledger variable declared but never referenced | Adds to state footprint and audit surface without contributing to behavior | Remove the variable or implement the missing feature that should use it |
| `hash()`, `verify()`, `encrypt()`, `random()` function calls | These functions do not exist in Compact; code will not compile | Use `persistentHash<T>`/`transientHash<T>`, `assert()`, commitments, and witness functions respectively |
| `counter.value()`, `map.get()`, `map.has()` | Wrong method names; code will not compile | Use `counter.read()`, `map.lookup()`, `map.member()` |
| Magic numbers instead of enum variants | Fragile; breaks if enum ordering changes; obscures intent | Use `State.Active` instead of `1`; define named constants |
| State modified before assertions | If a later assertion fails, state may be partially modified; harder to reason about correctness | Assert all preconditions first (guard), then modify state (act) |
| Same logic copy-pasted across circuits | Bug fixes must be applied to every copy; easy to miss one; inconsistency risk | Extract shared logic to a helper or pure circuit |
| Inline domain strings duplicated across circuits | Typo in one copy creates mismatched hashes; subtle and hard to debug | Extract hash/nullifier construction to a single pure circuit |
| Commented-out code blocks in production | Clutters the contract; confuses reviewers; may mask incomplete refactoring | Remove commented code; rely on version control for history |

