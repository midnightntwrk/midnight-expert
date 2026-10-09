# Privacy & Disclosure Review Checklist

Review checklist for the **Privacy & Disclosure** category. This is the highest-priority review category in Midnight's privacy-first design philosophy. Apply every item below to the contract under review.

## Shared Evidence

The orchestrator runs `compact compile --skip-zk` on the contract before dispatching reviewers. The resulting `COMPILE_RESULT` (full stdout/stderr from the compiler) is provided in your prompt. Reference this compilation output when evaluating checklist items. Read the contract source files directly to inspect structure, declarations, and patterns.

## Unnecessary Disclosure Checklist

Check every `disclose()` call in the contract for necessity and placement.

- [ ] **Every `disclose()` call: is it actually needed?** For each `disclose()`, ask whether the value could remain private. A value only needs disclosure if it flows to a public context (ledger write, return value, public assertion). If the value is only used in private computation, `disclose()` is unnecessary and reduces privacy.

> **Tool:** Read the contract source to list all `disclose()` call sites. Cross-reference each one against necessity.

- [ ] **`disclose()` placed at witness call site instead of near the public boundary.** Disclosing at the witness call site (e.g., `const x = disclose(getSecret())`) is bad practice because it marks the value as public immediately, and ALL downstream uses of that value lose privacy. Instead, place `disclose()` as close to the actual disclosure point as possible (e.g., the ledger write or return statement).

  ```compact
  // BAD — over-discloses at call site
  const secret = disclose(getSecret());
  const derived = computeSomething(secret);  // derived is now public too
  ledgerField = derived;

  // GOOD — disclose only at the public boundary
  const secret = getSecret();
  const derived = computeSomething(secret);
  ledgerField = disclose(derived);
  ```

> **Tool:** Read the contract source to inspect each `disclose()` call site for early-disclosure patterns.

- [ ] **Bulk `disclose()` on structs when only one field needs disclosure.** If a struct has multiple fields but only one needs to be public, disclosing the entire struct leaks all fields. Extract and disclose only the specific field that must be public.

  ```compact
  // BAD — discloses all fields
  const profile = disclose(getProfile());
  ledgerName = profile.name;

  // GOOD — disclose only the needed field
  const profile = getProfile();
  ledgerName = disclose(profile.name);
  ```

- [ ] **Return values from exported circuits: does everything returned need to be public?** Every value returned from an `export circuit` is visible to the caller and on-chain observers. Review whether all returned fields are necessary. If only a boolean confirmation is needed, do not return the underlying data.

## Witness Data Leakage Checklist

Check for private witness data escaping the zero-knowledge proof boundary.

- [ ] **Before flagging an exported circuit parameter as a leak, identify the actual public-boundary crossing in the circuit body.** Exported circuit parameters are tagged as witness data by the compiler, but they are PLONK *private inputs* to the proof and are not observable on-chain unless the circuit body explicitly crosses a public boundary with them. A finding is only valid if the parameter flows to one of: a ledger write (the compiler enforces `disclose()` here), a return from the exported circuit, a public conditional, or a cross-contract call. A parameter consumed only by a witness call, a commitment input, an internal hash, or a private assert stays inside the proof and is NOT a privacy issue.

  This rule guards against a common false positive: flagging private-looking parameters (e.g., `acceptGame(x1, x2)` taking ship coordinates) without checking whether the circuit body actually leaks them. Verified empirically — contract-writer + zkir-checker confirm that parameters not reached by `disclose()` never enter the public transcript; the verifier sees only PLONK public inputs the source code declared public.

- [ ] **Witness-derived values written to public ledger without `disclose()`.** The compiler catches this as an error, but review the intent. If the developer added `disclose()` solely to silence the compiler without considering whether the value should actually be public, that is a privacy bug even though the code compiles.

> **Tool:** `COMPILE_RESULT` shows `potential witness-value disclosure must be declared but is not: …` errors for these cases.

- [ ] **Conditional branches revealing private information.** Patterns like `if (disclose(secret == expected))` leak the boolean result of a private comparison. An observer learns whether the secret matched the expected value. Consider whether the branch outcome itself is sensitive.

  ```compact
  // BAD — leaks whether the secret matches
  if (disclose(secret == expected)) {
    // ...
  }

  // BETTER — assert privately, only disclose the final action result
  assert(secret == expected, "Mismatch");
  ```

> **Tool:** Read the source for circuits that use `disclose()` inside conditionals to understand the full privacy implications.

- [ ] **Assert conditions that leak private state.** Patterns like `assert(disclose(balance > 0), "...")` reveal private state through the assertion. The observer learns the boolean result of the condition. Consider whether the assertion condition itself is sensitive information.

  ```compact
  // BAD — leaks whether balance > 0
  assert(disclose(balance > 0), "Insufficient balance");

  // BETTER — keep the check private where possible
  assert(balance > 0, "Insufficient balance");
  // Only disclose the final derived value that must be public
  ```

- [ ] **Indirect leakage through control flow timing or state changes observable on-chain.** Even without explicit disclosure, an observer can infer private state from:
  - Which exported circuit was called (circuit name is always visible)
  - Whether a transaction succeeded or failed
  - The number and pattern of ledger state changes
  - Transaction timing and ordering

- [ ] **Cross-contract calls passing witness data.** When witness-derived data crosses a contract boundary via a cross-contract call, it crosses a trust boundary. The receiving contract may disclose or store the data publicly. Verify that any data passed to another contract is safe to share.

## Data Structure Privacy Checklist

Check ledger data structure choices for unintended information leakage.

- [ ] **Using `Set<Bytes<32>>` for membership that should be private.** `Set` operations (`member()`, `insert()`) reveal the exact element being checked or added. If membership should be anonymous, use `MerkleTree` (or `HistoricMerkleTree`) with a nullifier pattern instead. The observer sees only a root check and a nullifier insertion, not which member acted.

  ```compact
  // BAD — reveals who is a member
  export ledger members: Set<Bytes<32>>;
  assert(disclose(members.member(myPublicKey)), "Not a member");

  // GOOD — anonymous membership proof
  export ledger members: HistoricMerkleTree<16, Bytes<32>>;
  export ledger usedNullifiers: Set<Bytes<32>>;
  const digest = merkleTreePathRoot<16, Bytes<32>>(path);
  assert(members.checkRoot(disclose(digest)), "Not a member");
  ```

> **Tool:** Read the contract source to find all data structure declarations. Look for `Set` types used in membership contexts.

- [ ] **Using `Map<key, value>` where key reveals identity.** Map keys are always visible on insert and lookup. If the key is a user identifier (public key, address, name hash), every operation reveals which user is acting. Consider whether the key can be replaced with a commitment or whether the data model should use a different structure.

- [ ] **Using `Counter` read-then-increment vs direct `increment()`.** Reading a `Counter` with `counter.read()` followed by `increment()` reveals the current counter value unnecessarily. If the current value is not needed for circuit logic, use `counter.increment(n)` directly. Note that all `Counter` operations are public regardless.

  ```compact
  // BAD — reads and exposes current value when only increment is needed
  const current = counter.read();  // observer sees current value
  counter.increment(1);

  // GOOD — increment without reading
  counter.increment(1);
  ```

- [ ] **Using `List` which reveals insertion order and all values.** `List` operations make all stored values and their insertion order visible on-chain. If the data should be private, consider whether a `MerkleTree` or off-chain storage is more appropriate.

- [ ] **`MerkleTree` used for anonymous membership proofs.** `MerkleTree.insert()` hides the leaf value — the compiler applies `leaf_hash()` (a `persistent_hash`) before storing, so only the hash appears in the transaction transcript. This is the only ledger operation that hides its data argument. The additional privacy benefit is that ZK membership proofs do not reveal which specific leaf is being proven. For stronger hiding (e.g., preventing brute-force preimage attacks on small input spaces), use commitments (e.g., `persistentCommit`) with a blinding factor before inserting.

## Cryptographic Privacy Checklist

Check cryptographic operations for correctness and privacy guarantees.

- [ ] **`persistentHash` used where `persistentCommit` is needed.** `persistentHash` does NOT clear witness taint. The compiler still tracks the result as witness-derived. If the goal is to hide a private value on-chain, `persistentCommit` (or `transientCommit` for in-circuit intermediates) with a blinding factor (nonce/salt) is required — both `persistentCommit` and `transientCommit` clear witness taint. `persistentHash` only provides binding, not hiding.

  ```compact
  // BAD — hash does not clear taint or hide the value
  const hidden = persistentHash<Vector<2, Bytes<32>>>([pad(32, "app:"), secret]);
  // Compiler still considers 'hidden' as witness-tainted

  // GOOD — commit clears taint and provides hiding
  const salt = get_randomness();
  const hidden = persistentCommit<Vector<2, Bytes<32>>>([pad(32, "app:"), secret], salt);
  // 'hidden' is no longer tainted; value is cryptographically hidden
  ```

> **Tool:** Read the contract source to inspect `persistentHash` vs `persistentCommit` usage. Check for misuse patterns.

- [ ] **Transient vs persistent confusion.** `transientHash` and `transientCommit` produce values that are deterministic within a single circuit execution but are NOT guaranteed to produce the same output across compiler upgrades or different contract versions. Their results must NEVER be stored in ledger state because a value committed with `transientCommit` cannot be reliably verified in a future transaction after a compiler upgrade. Use `persistentHash` or `persistentCommit` for any value that will be stored on-chain or compared across transactions.

  ```compact
  // BAD — transient result stored on ledger is meaningless
  storedCommitment = disclose(transientCommit<Field>(value, salt));

  // GOOD — persistent result is stable across calls
  storedCommitment = persistentCommit<Field>(value, salt);
  ```

> **Tool:** Use `octocode` to search the LFDT-Minokawa/compact repository for documentation clarifying the transient vs persistent guarantees if there is any ambiguity in the contract's usage.

- [ ] **Salt/nonce reuse in commitments.** Reusing the same salt across different commitments allows rainbow table attacks. If two commitments use the same salt and the same value, they produce identical outputs, breaking the hiding property. Always source fresh randomness from a witness function for each commitment.

- [ ] **Same domain string used for both commitment and nullifier.** If the commitment and nullifier for the same secret use the same domain separator, an observer can link them by comparing derivation outputs. Use distinct domain strings for each purpose.

  ```compact
  // BAD — same domain enables linking
  const commitment = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:"), sk]);
  const nullifier  = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:"), sk]);

  // GOOD — different domains prevent correlation
  const commitment = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:commit:"), sk]);
  const nullifier  = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:nullifier:"), sk]);
  ```

- [ ] **Missing salt/randomness in commitment schemes.** A commitment without randomness is just a hash and does not provide hiding. If the input space is small (e.g., a boolean, a small integer), an observer can brute-force the hash to recover the committed value. Always include a random blinding factor.

## Selective Disclosure Checklist

Check that disclosed values reveal the minimum necessary information.

- [ ] **Disclosing the actual value when only a boolean comparison result is needed.** If the contract only needs to prove that a value meets a condition (e.g., balance above a threshold), disclose the boolean result of the comparison, not the value itself.

  ```compact
  // BAD — reveals the actual balance
  assert(disclose(balance) >= threshold, "Insufficient");

  // GOOD — reveals only whether the condition holds
  assert(disclose(balance >= threshold), "Insufficient");
  ```

- [ ] **Disclosing more fields than necessary from a struct.** When working with multi-field data, review whether each disclosed field is truly required by the public context. Disclose individual fields rather than entire structs.

  ```compact
  // BAD — discloses name, age, AND income
  const profile = disclose(getProfile());
  assert(profile.age >= 18, "Underage");

  // GOOD — discloses only the age comparison result
  const profile = getProfile();
  assert(disclose(profile.age >= 18), "Underage");
  ```

- [ ] **Missing `disclose()` on derived values that should be public.** The compiler catches missing `disclose()` calls when a witness-tainted value flows to a public context. However, review for intent: if the developer had to add `disclose()` to make the code compile, verify that the value was actually intended to be public. A compiler-driven `disclose()` added without privacy consideration is a code smell.

## Anti-Patterns Table

Quick reference of common privacy anti-patterns in Compact contracts.

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| `disclose(getSecret())` at call site | Marks private data as public too early; all downstream uses of the value lose privacy, risking multiple unintended disclosure paths | `disclose(x)` at the point where `x` crosses a public boundary (ledger write, return, public assertion) |
| `Set<Bytes<32>>` for private membership | Set operations (`member()`, `insert()`) reveal the exact element identity on-chain; any observer can see who acted | `MerkleTree` + nullifier for anonymous membership proof; `insert()` hides the leaf (via `leaf_hash()`), and observer sees only a root check and opaque nullifier |
| `persistentHash(secret)` to "hide" data | Hash does not clear witness taint; the compiler still tracks the result as private; hash without blinding provides no hiding guarantee | `persistentCommit(secret, nonce)` which cryptographically hides the input and clears witness taint |
| Storing `transientHash` result in ledger | Transient operations are deterministic within a single execution but not guaranteed across compiler upgrades; the stored value cannot be reliably verified in future transactions | Use `persistentHash` or `persistentCommit` for any value that must be stored on the ledger or compared across transactions |
| Same domain for commit + nullifier | Allows an observer to link a commitment to its corresponding nullifier, breaking unlinkability and deanonymizing the user | Different domain strings for each purpose: `"app:commit"` vs `"app:nullifier"` |
| Raw secret in sealed field | Sealed fields are set publicly during contract deployment; the secret value is visible in the deployment transaction to all observers | Hash or commit the secret before storing it in a sealed field |

