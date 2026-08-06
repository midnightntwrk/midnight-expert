---
name: compact-core:compact-privacy-disclosure
description: This skill should be used when the user asks about Midnight's privacy model, the disclose() function and disclosure rules, how to fix disclosure compiler errors, privacy-by-default design, witness protection program, commitment schemes (persistentCommit, transientCommit), nullifier patterns for double-spend prevention, MerkleTree membership proofs for anonymous authentication, unlinkable actions via round-based keys, selective disclosure, commit-reveal schemes, shielded vs transparent state design, what is visible on-chain, safe stdlib routines (transientCommit hiding witness data), or debugging "potential witness-value disclosure must be declared" errors.
version: 0.1.0
---

# Compact Privacy & Disclosure

This skill covers the privacy dimension of Compact: understanding what is private by default, when and how to disclose, and how to build contracts that preserve user privacy. For visibility rules per ledger operation, see `compact-ledger`. For contract anatomy and circuit/witness design, see `compact-structure`. For standard library function signatures, see `compact-standard-library`. For shielded token privacy, see `compact-tokens`.

## Midnight's Privacy Model

Privacy is the default in Compact. All witness-derived data is private unless explicitly disclosed. The compiler's **Witness Protection Program** (an abstract interpreter) tracks which values contain witness data at every point in the program. When a tagged value reaches a public boundary (ledger write, conditional, exported circuit return, cross-contract call) without a `disclose()` wrapper, the compiler halts with an error reporting the full path from witness source to disclosure point.

`disclose()` is a compiler annotation, not a runtime operation. It does not encrypt, hash, or transform the value. Placing `disclose(x)` simply marks `x` as "okay to make public." The programmer is asserting: "I understand this value will be visible on-chain, and that is intentional."

## Visibility vs. Taint (Two Different Properties)

These are routinely conflated and must be kept separate:

- **Witness taint** (compile-time concept). The compiler tags every value returned from a `witness` function, every exported circuit parameter, and every constructor parameter as "potentially private." Taint propagates through arithmetic, struct construction, circuit calls, casts, lambda captures. The compiler enforces taint at every public boundary, where `disclose()` is the only way to clear it.
- **Public transcript visibility** (on-chain reality). A value only enters the public transaction transcript if the source code crosses a public boundary with that value while it is still tainted (or via an unprotected return / ledger write / cross-contract call / public conditional). Values that are not disclosed remain PLONK *private inputs* to the proof and are never observable on-chain.

**Exported circuit parameters are private by default.** They are PLONK private inputs. They become publicly visible only when the circuit body crosses a public boundary with them. A parameter that is consumed only by witness calls, commitments, internal hashes, or private asserts is never observable on-chain. Verified empirically: a contract with `export circuit addPrivately(amount, rand) { lastHash = persistentCommit(amount, rand); }` produces a transaction whose `publicTranscript` contains only the 32-byte commitment hash — the raw `amount` value is absent.

The corollary: a value being "tagged with witness taint" does NOT mean it is publicly visible — it means the compiler is watching it. Tagging is a safety mechanism; visibility is what actually reaches the chain.

## Privacy Decision Tree

| What to Protect | Approach | Key Primitives |
|----------------|----------|----------------|
| Hide a value on-chain | Commitment | `persistentCommit<T>` / `transientCommit<T>` |
| Prove membership anonymously | MerkleTree + ZK path (assert on the result, see below) | `HistoricMerkleTree` + `merkleTreePathRoot<N, T>` |
| Prevent double-actions | Nullifier | `persistentHash<T>([domain, secret])` + `Set<Bytes<32>>` |
| Hide who is acting | Unlinkable auth | `Counter` + rotated `persistentHash` |
| Multi-step hidden value | Commit-reveal | Commit phase + reveal phase |
| Private token balances | Shielded tokens | zswap infrastructure (see `compact-tokens`) |
| Share specific data only | Selective disclosure | `disclose()` on boolean result, not the value |

## Disclosure Rules Quick Reference

**When `disclose()` IS required:**

| Context | Example | Why |
|---------|---------|-----|
| Ledger write (direct) | `owner = disclose(pk)` | Value becomes public on-chain |
| Ledger write (ADT method) | `map.insert(disclose(key), val)` | Arguments to ADT ops are public |
| Conditional (`if`) with ledger writes | `if (disclose(x == y)) { balance = ... }` | Branch choice reveals information when it contains ledger writes |
| Return from exported circuit | `return disclose(value)` | Return value leaves the ZK proof |
| Cross-contract call | Calling another contract's circuit | Arguments cross trust boundary |
| Constructor sealed field | `owner = disclose(pk)` | Sealed values are set publicly |

**When `disclose()` is NOT required:**

| Context | Example | Why |
|---------|---------|-----|
| Pure witness computation | `const h = persistentHash<Bytes<32>>(sk)` | Result stays within circuit |
| Internal circuit calls | `helper(witness_val)` | Non-exported, stays in proof |
| Intermediate variables | `const x = a + b` | No public boundary crossed |
| Commitment inputs | `persistentCommit<Field>(secret, rand)` | Commitment cryptographically hides input |
| Exported circuit parameter used only internally | `lastHash = persistentCommit(amount, rand)` where `amount` is a circuit param | Param is a PLONK private input; raw value never enters the public transcript unless disclosed at a boundary |

## Safe Stdlib Routines

| Function | Signature | Cryptographically Hides Input? | Why |
|----------|-----------|----------------------|-----|
| `persistentCommit<T>` | `(value: T, rand: Bytes<32>): Bytes<32>` | **Yes** | Commitment cryptographically hides input |
| `transientCommit<T>` | `(value: T, rand: Field): Field` | **Yes** | Same hiding property, circuit-efficient |
| `persistentHash<T>` | `(value: T): Bytes<32>` | **No** | Hash could theoretically be brute-forced |
| `transientHash<T>` | `(value: T): Field` | **No** | Same reasoning as persistentHash |

Commit functions (`persistentCommit`, `transientCommit`) clear witness taint on both the input and the output. The commitment result does not carry witness taint, so `disclose()` is not required when storing it in ledger state. Hash functions (`persistentHash`, `transientHash`) do NOT clear taint — values derived from hashes still require `disclose()`.

```compact
const commitment = persistentCommit<Field>(secretValue, randomness);
storedCommitment = commitment;  // No disclose() needed — persistentCommit clears taint

const hash = persistentHash<Field>(secretValue);
storedHash = disclose(hash);  // disclose() required — persistentHash does NOT clear taint
```

## checkRoot Publishes Its Result

`checkRoot` is a ledger operation, so it has two disclosure surfaces, not one. The
argument is the widely-known part. The **return value** is the part that is easy to
miss: the call compiles to a `member` check against the tree's historic roots
followed by `popeq`, and `popeq` writes the outcome into the public transcript,
tagged with the index of the ledger field that was checked.

Omitting `disclose()` makes the compiler name all three channels at once:

```text
nature of the disclosure:
  ledger operation might disclose a hash of the witness value
nature of the disclosure:
  ledger operation might disclose a hash of the boolean value of the witness value
nature of the disclosure:
  ledger operation might disclose a hash of a modulus of a hash of the witness value
```

The middle channel is the result of the check. A single `disclose()` clears all
three, and the message reads as though it concerns only the root, so the second
line is easy to skip past.

**This is why every membership example in this skill asserts immediately:**

```compact
assert(members.checkRoot(disclose(digest)), "Not a member");
```

Asserting makes the published bit *constant*. A caller whose check fails never
lands a transaction, so every transcript on-chain carries the same value and it
reveals nothing.

Capturing the result and branching on it removes that property:

```compact
// Anti-pattern: leaks which trees the caller belongs to
const inA = treeA.checkRoot(disclose(merkleTreePathRoot<10, Bytes<32>>(pathA(leaf))));
const inB = treeB.checkRoot(disclose(merkleTreePathRoot<10, Bytes<32>>(pathB(leaf))));
assert(inA || inB, "not a member of either");
```

`inA || inB` is never disclosed, but each result reached the transcript
separately. Reading `proofData.publicTranscript` for two callers, one enrolled
only in tree A and one only in tree B:

| Caller | check vs `treeA` | check vs `treeB` |
|--------|------------------|------------------|
| A-only | `popeq -> [1]`   | `popeq -> []`    |
| B-only | `popeq -> []`    | `popeq -> [1]`   |

No inference is required; the answers are recorded in order.

### The rule

> Every `checkRoot` call in a circuit must return the same value for every honest
> caller. If a call can legitimately return `false` for some callers, that `false`
> is public.

For "N of M" designs, use **one shared tree** with the category folded into the
leaf, `hash(domain, identity, categoryTag)`, prove N memberships against that
single tree, and assert inside the circuit that the tags differ. Every caller then
publishes the same constant.

The corollary is worth stating plainly: supplying a deliberately invalid path so a
check can return `false` without failing the proof is the only way to express
*optional* membership across several trees, and it is exactly what makes the
published bit vary. Optional membership and unlinkability are not simultaneously
achievable this way.

Verified against Compact 0.31.1 and `@midnight-ntwrk/compact-runtime` 0.16.0.
Reproduction: https://github.com/tomiin/checkroot-transcript-probe

## Common Disclosure Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `balance = getBalance()` | `balance = disclose(getBalance())` | Ledger write requires disclosure |
| `if (getFlag()) { ... }` | `if (disclose(getFlag())) { ... }` | Conditional requires disclosure |
| `return computeResult()` | `return disclose(computeResult())` | Exported circuit return requires disclosure |
| `disclose(getBalance()); ...; balance = x` | `balance = disclose(x)` | Disclose at disclosure point, not at source |
| `Set` for private membership | `MerkleTree` + ZK path proof | Set reveals which element is tested |
| `const ok = tree.checkRoot(...)` then branch on `ok` | `assert(tree.checkRoot(...), "...")` | The result is written to the public transcript; asserting keeps it constant |
| Same domain for commitment and nullifier | Different domains | Same domain enables linking attack |
| `persistentHash(secret)` to "hide" witness | `persistentCommit(secret, rand)` | Hash doesn't clear witness taint; commit does |

## Reference Routing

| Topic | Reference File |
|-------|---------------|
| How `disclose()` works, Witness Protection Program, safe routines, placement best practices | `references/disclosure-mechanics.md` |
| Commitments, nullifiers, MerkleTree auth, unlinkability, threat model, anti-patterns | `references/privacy-patterns.md` |
| Fixing disclosure compiler errors step-by-step, common error patterns | `references/debugging-disclosure.md` |

## Examples

| Example | File | Pattern |
|---------|------|---------|
| Two-phase commit-reveal with salt-based commitments | `examples/CommitRevealScheme.compact` | Commit-Reveal |
| Single-use tokens with commitment + nullifier | `examples/NullifierDoubleSpend.compact` | Nullifiers |
| Anonymous voting with Merkle proofs and commit-reveal | `examples/PrivateVoting.compact` | Private Voting |
| Round-based key rotation for unlinkable actions | `examples/UnlinkableAuth.compact` | Unlinkable Auth |
| Proving properties without revealing values | `examples/SelectiveDisclosure.compact` | Selective Disclosure |
| Sealed-bid auction with time constraints | `examples/ShieldedAuction.compact` | Shielded Auction |
