# compact-core

<p align="center">
  <img src="assets/mascot.png" alt="compact-core mascot" width="200" />
</p>

Core knowledge for writing Midnight Compact smart contracts -- contract structure, data types, ledger declarations, circuits, witnesses, and common patterns.

## Skills

### compact-core:compact-structure

Covers Compact smart contract anatomy: pragma and imports, ledger declarations (including sealed ledger), data types, circuits, witnesses, constructors, export patterns, and disclosure rules.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [data-types](skills/compact-structure/references/data-types.md) | All data types, operations, and casting rules | When working with Field, Bytes, Uint, enums, structs, or type conversions |
| [ledger-declarations](skills/compact-structure/references/ledger-declarations.md) | Ledger modifiers and ADT operations (Counter, Map, Set, etc.) | When declaring or interacting with on-chain state |
| [circuits-and-witnesses](skills/compact-structure/references/circuits-and-witnesses.md) | Circuit types, witness declarations, constructors, and pure circuits | When defining circuits, witnesses, or constructors |
| [common-mistakes](skills/compact-structure/references/common-mistakes.md) | Common syntax mistakes with explanations | When troubleshooting contract structure issues |
| [patterns](skills/compact-structure/references/patterns.md) | Authentication, commit-reveal, Merkle trees, and disclosure patterns | When implementing common contract patterns |

### compact-core:compact-language-ref

Covers Compact language mechanics: types, operators, arithmetic, type casting, control flow, for loops, modules, imports, and standard library functions.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [types-and-values](skills/compact-language-ref/references/types-and-values.md) | Primitives, opaque, collections, custom types, defaults, subtyping, and TypeScript mappings | When working with the Compact type system |
| [operators-and-expressions](skills/compact-language-ref/references/operators-and-expressions.md) | Arithmetic, comparison, boolean operators, cast paths, conditionals, and lambdas | When writing expressions or performing type casts |
| [control-flow](skills/compact-language-ref/references/control-flow.md) | Variable declarations, if/else, for loops, return, blocks, and destructuring | When writing control flow logic |
| [modules-and-imports](skills/compact-language-ref/references/modules-and-imports.md) | Pragma, include, modules, import forms, exports, and file organization | When organizing code across files and modules |
| [stdlib-functions](skills/compact-language-ref/references/stdlib-functions.md) | persistentHash, transientHash, persistentCommit, transientCommit, pad, disclose, assert, default | When using standard library functions |
| [troubleshooting](skills/compact-language-ref/references/troubleshooting.md) | Compiler error reference, wrong-to-correct syntax, and debugging strategies | When diagnosing compilation errors |

### compact-core:compact-ledger

Covers on-chain state: ledger declarations, modifiers (export, sealed), ADT types (Counter, Map, Set, List, MerkleTree, HistoricMerkleTree), constructor initialization, state design, on-chain visibility, and the Kernel ledger.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [types-and-operations](skills/compact-ledger/references/types-and-operations.md) | Complete ADT operations tables, parameters, return types, nested composition, and Kernel API | When using ADT methods or the Kernel |
| [state-design](skills/compact-ledger/references/state-design.md) | Choosing the right type, decision matrix, constructor patterns, nested ADT strategies, and state machines | When designing contract state |
| [privacy-and-visibility](skills/compact-ledger/references/privacy-and-visibility.md) | Per-operation visibility, MerkleTree vs Set privacy, disclosure rules, and privacy design | When reasoning about what is visible on-chain |

### compact-core:compact-standard-library

Authoritative index of everything `import CompactStandardLibrary;` provides -- types, constructors, hashing/commitment circuits, elliptic curve functions, Merkle tree path verification, block time circuits, coin management, and ledger ADTs. Includes a verification protocol to prevent hallucinated functions.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [types-and-constructors](skills/compact-standard-library/references/types-and-constructors.md) | Stdlib types (Maybe, Either, JubjubPoint, address types) and constructor circuits (some, none, left, right) | When using stdlib types or constructors |
| [cryptographic-functions](skills/compact-standard-library/references/cryptographic-functions.md) | Elliptic curve functions, Merkle tree path functions, and hashing/commitment summary | When using EC operations or Merkle tree verification |
| [cross-reference-index](skills/compact-standard-library/references/cross-reference-index.md) | Alphabetical index of every stdlib export with authoritative documentation location | When verifying whether a function exists in the standard library |

### compact-core:compact-tokens

Covers tokens on Midnight: shielded vs unshielded approaches, mint/send/receive functions, token colors and domain separators, the NIGHT/DUST model, and standard token contract patterns.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [token-architecture](skills/compact-tokens/references/token-architecture.md) | Shielded vs unshielded deep dive, UTXO vs account model | When choosing a token approach |
| [token-operations](skills/compact-tokens/references/token-operations.md) | Complete function signatures, parameters, nonce management, and merge strategies | When implementing token operations |
| [token-patterns](skills/compact-tokens/references/token-patterns.md) | OpenZeppelin FungibleToken, NonFungibleToken, and MultiToken patterns | When building ERC-20/721/1155 style token contracts |

#### Examples

| Name | Description | When it is used |
|------|-------------|-----------------|
| [FungibleToken.compact](skills/compact-tokens/examples/FungibleToken.compact) | ERC-20 style fungible token (requires OpenZeppelin compact-contracts) | When building a basic fungible token contract |
| [NonFungibleToken.compact](skills/compact-tokens/examples/NonFungibleToken.compact) | Non-fungible token with ownership tracking (requires OpenZeppelin compact-contracts) | When building an NFT contract |
| [MultiToken.compact](skills/compact-tokens/examples/MultiToken.compact) | Multi-token collection with mint/burn per ID (requires OpenZeppelin compact-contracts) | When building a multi-token contract |
| [ShieldedFungibleToken.compact](skills/compact-tokens/examples/ShieldedFungibleToken.compact) | Shielded fungible token using zswap coin infrastructure (requires OpenZeppelin midnight-apps) | When building a privacy-preserving fungible token |

### compact-core:compact-privacy-disclosure

Covers Midnight's privacy model: disclose() rules, privacy-by-default design, the Witness Protection Program, commitment schemes, nullifier patterns, Merkle membership proofs, unlinkable actions, selective disclosure, and debugging disclosure errors.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [disclosure-mechanics](skills/compact-privacy-disclosure/references/disclosure-mechanics.md) | How disclose() works, Witness Protection Program, safe routines, placement best practices | When understanding or applying disclosure rules |
| [privacy-patterns](skills/compact-privacy-disclosure/references/privacy-patterns.md) | Commitments, nullifiers, MerkleTree auth, unlinkability, threat model, and anti-patterns | When implementing privacy-preserving patterns |
| [debugging-disclosure](skills/compact-privacy-disclosure/references/debugging-disclosure.md) | Fixing disclosure compiler errors step-by-step and common error patterns | When debugging "potential witness-value disclosure" errors |

#### Examples

| Name | Description | When it is used |
|------|-------------|-----------------|
| [CommitRevealScheme.compact](skills/compact-privacy-disclosure/examples/CommitRevealScheme.compact) | Two-phase commit-reveal with salt-based commitments | When implementing a commit-reveal pattern |
| [NullifierDoubleSpend.compact](skills/compact-privacy-disclosure/examples/NullifierDoubleSpend.compact) | Single-use tokens with commitment and nullifier | When preventing double-spend with nullifiers |
| [PrivateVoting.compact](skills/compact-privacy-disclosure/examples/PrivateVoting.compact) | Anonymous voting with Merkle proofs and commit-reveal | When building a private voting system |
| [UnlinkableAuth.compact](skills/compact-privacy-disclosure/examples/UnlinkableAuth.compact) | Round-based key rotation for unlinkable actions | When implementing unlinkable authentication |
| [SelectiveDisclosure.compact](skills/compact-privacy-disclosure/examples/SelectiveDisclosure.compact) | Proving properties without revealing values | When disclosing boolean results instead of raw data |
| [ShieldedAuction.compact](skills/compact-privacy-disclosure/examples/ShieldedAuction.compact) | Sealed-bid auction with time constraints | When building a private auction |

### compact-core:compact-witness-ts

Covers TypeScript witness implementation: WitnessContext pattern, private state management, Compact-to-TypeScript type mappings, compiler-generated .d.ts files, the Contract class, pure circuits, and the compact runtime.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [type-mappings](skills/compact-witness-ts/references/type-mappings.md) | Complete type mapping table, CompactType<T>, runtime validation, and casting rules | When mapping Compact types to TypeScript |
| [witness-implementation](skills/compact-witness-ts/references/witness-implementation.md) | WitnessContext API, return tuples, common patterns, and state transitions | When implementing witness functions |
| [contract-runtime](skills/compact-witness-ts/references/contract-runtime.md) | Contract class, circuits vs impureCircuits, pureCircuits, and ledger() | When using the compiler-generated Contract class |

### compact-core:compact-patterns

Catalog of 18 reusable contract design patterns covering access control, state management, commitment schemes, value handling, governance, identity/membership, and privacy.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [access-control-patterns](skills/compact-patterns/references/access-control-patterns.md) | Owner-Only, RBAC, Pausable, and Initializable patterns | When implementing access control |
| [state-management-patterns](skills/compact-patterns/references/state-management-patterns.md) | State Machine and Time-Locked Operations patterns | When managing multi-phase protocols or deadlines |
| [commitment-patterns](skills/compact-patterns/references/commitment-patterns.md) | Commit-Reveal and Sealed-Bid Auction patterns | When hiding values for later revelation |
| [value-handling-patterns](skills/compact-patterns/references/value-handling-patterns.md) | Escrow and Treasury / Pot Management patterns | When holding or managing pooled funds |
| [governance-patterns](skills/compact-patterns/references/governance-patterns.md) | Multi-Party Auth (Multi-Sig) and Voting / Governance patterns | When implementing multi-party decisions |
| [identity-membership-patterns](skills/compact-patterns/references/identity-membership-patterns.md) | Registry, Credential Verification, Domain-Separated Identity, and Anonymous Membership patterns | When managing identity or membership |
| [privacy-patterns](skills/compact-patterns/references/privacy-patterns.md) | Round-Based Unlinkability and Selective Disclosure patterns | When breaking transaction linkability or proving properties privately |

### compact-core:compact-transaction-model

Covers transaction execution: guaranteed vs fallible phases, kernel.checkpoint(), transaction composition, merging for atomic swaps, the state model, concurrency and conflicts, fees/gas, and proof verification.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [execution-phases](skills/compact-transaction-model/references/execution-phases.md) | Three execution stages, phase semantics, state lifecycle, weak vs strong values | When understanding how circuits map to on-chain execution |
| [state-and-conflicts](skills/compact-transaction-model/references/state-and-conflicts.md) | Contract state model, concurrency, conflict minimization, and append-only patterns | When designing for concurrent transaction safety |
| [fees-and-gas](skills/compact-transaction-model/references/fees-and-gas.md) | DUST generation, SyntheticCost dimensions, gas-to-fee conversion, and dynamic pricing | When reasoning about transaction costs |
| [zswap-and-offers](skills/compact-transaction-model/references/zswap-and-offers.md) | Zswap offers, inputs/outputs, balance vectors, transaction merging, and Pedersen binding | When implementing atomic swaps or understanding the Zswap protocol |

#### Examples

| Name | Description | When it is used |
|------|-------------|-----------------|
| [CheckpointUsage.compact](skills/compact-transaction-model/examples/CheckpointUsage.compact) | Guaranteed/fallible split with kernel.checkpoint() | When learning how to use checkpoint for phase separation |
| [TransactionComposition.compact](skills/compact-transaction-model/examples/TransactionComposition.compact) | Multi-call transaction composition | When composing multiple contract calls in one transaction |
| [FeeAwareContract.compact](skills/compact-transaction-model/examples/FeeAwareContract.compact) | Fee-aware contract with gas considerations | When designing circuits mindful of gas costs |
| [AtomicSwap.compact](skills/compact-transaction-model/examples/AtomicSwap.compact) | Atomic swap via transaction merging | When implementing trustless token exchanges |

### compact-core:compact-circuit-costs

Covers the three-dimensional cost model for Compact contracts: circuit/proving costs (gate counts, hash tradeoffs, loop unrolling, pure circuits), runtime gas costs (readTime, computeTime, bytesWritten, bytesDeleted), and state costs (ledger type comparisons, privacy-cost tradeoffs).

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [circuit-proving-costs](skills/compact-circuit-costs/references/circuit-proving-costs.md) | Gate counts, loop unrolling, hash costs, pure circuits, vector ops, compiler passes, and proving benchmarks | When optimizing proof generation time |
| [runtime-gas-costs](skills/compact-circuit-costs/references/runtime-gas-costs.md) | Gas model dimensions, RunningCost, CostModel, gas limits, and cost-efficient patterns | When reducing transaction fees |
| [state-costs](skills/compact-circuit-costs/references/state-costs.md) | Ledger type cost comparison, privacy-cost tradeoffs, sealed fields, and nested ADTs | When choosing ledger types for cost efficiency |

### compact-core:compact-init-project

Guides creation of new Midnight projects using a vendored, deterministic scaffolder bundled with the skill (replacing the sunset `create-mn-app` tool), covering environment checks, scaffolding, local network setup, and compilation. Scaffolds a single self-contained project template (contract + vitest harness + local Docker network); pass `--witnesses` for contracts with off-chain private logic.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [new-example-workflow](skills/compact-init-project/references/new-example-workflow.md) | Step-by-step workflow for scaffolding a new project | When creating a new Midnight project from scratch |
| [project-structure](skills/compact-init-project/references/project-structure.md) | Project layout, SDK/toolchain versions, and network URLs | When understanding the generated project structure |
| [troubleshooting](skills/compact-init-project/references/troubleshooting.md) | Common init failures and fixes | When scaffolding fails or produces errors |

### compact-core:basic-start

Step-by-step procedural walkthrough that takes you from zero to a working Midnight DApp on a local devnet, verifying your environment along the way. Output is ephemeral and intended for environment verification and familiarity-building, not retention.

### compact-core:compact-review

Review checklists for 10 categories of Compact smart contract review. Each reference file provides a focused checklist for one review dimension.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [privacy-review](skills/compact-review/references/privacy-review.md) | disclose() usage, witness data leaks, Set vs MerkleTree, salt reuse | When reviewing privacy and disclosure correctness |
| [security-review](skills/compact-review/references/security-review.md) | Access control, hash/commit usage, domain separation, nullifiers, error leakage | When reviewing security and cryptographic correctness |
| [token-security-review](skills/compact-review/references/token-security-review.md) | Double-spend, overflow, unsafe transfers, missing receiveShielded | When reviewing token and economic security |
| [concurrency-review](skills/compact-review/references/concurrency-review.md) | Read-then-write patterns, Counter ops, transaction conflicts | When reviewing for concurrency issues |
| [compilation-review](skills/compact-review/references/compilation-review.md) | Deprecated syntax, return types, disclosure errors, casts, generics | When reviewing compilation and type safety |
| [performance-review](skills/compact-review/references/performance-review.md) | Proof cost, ledger reads, MerkleTree depth, redundant computation, loops | When reviewing performance and circuit efficiency |
| [architecture-review](skills/compact-review/references/architecture-review.md) | ADT selection, depth planning, visibility, modules, decomposition | When reviewing architecture and state design |
| [code-quality-review](skills/compact-review/references/code-quality-review.md) | Naming, complexity, dead code, stdlib hallucinations, idioms | When reviewing code quality and best practices |
| [testing-review](skills/compact-review/references/testing-review.md) | Edge cases, negative tests, private state testing, witness mocks | When reviewing testing adequacy |
| [documentation-review](skills/compact-review/references/documentation-review.md) | Circuit docs, witness contracts, ledger semantics | When reviewing documentation completeness |

### compact-core:compact-security

Threat model and adversarial methodology for reviewing Compact contracts: the three execution contexts (public ledger, ZK circuit, local witness), the witness trust boundary and the ownPublicKey()-for-authorization anti-pattern, sealed-field misuse, disclosure placement, cryptographic-primitive selection, domain separation, and the Verification Requests protocol used by the security-reviewer agent. Routes to the compact-review checklists for granular line-items.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [threat-catalog](skills/compact-security/references/threat-catalog.md) | Catalog of Compact threats with adversarial methodology and the Reuse Map to compact-review checklists | When reasoning about attacks and threat categories |
| [witness-trust-boundary](skills/compact-security/references/witness-trust-boundary.md) | The witness trust boundary, ownPublicKey()-for-auth anti-pattern, and witness-derived identity | When reviewing authentication and witness-supplied data |

### compact-core:compact-debugging

Process orchestration for debugging Compact smart contract errors. Routes to domain-specific compact-core skills based on symptom-driven triage, tracks fix attempts, and triggers escalation when consecutive fixes reveal deeper problems.

#### Examples

| Name | Description | When it is used |
|------|-------------|-----------------|
| [debugging-session.md](skills/compact-debugging/examples/debugging-session.md) | Walkthrough of a debugging session with triage and fix tracking | When learning the debugging methodology |

## Commands

### compact-core:audit-compact

Deep adversarial security audit of Compact smart contract code. Runs a single security-reviewer specialist over the threat model, then confirms Critical/High findings via midnight-verify and synthesizes a consolidated security report. Security-only; for a full 10-category review use /compact-core:review-compact.

#### Output

A consolidated security audit report with severity-sorted findings, each Critical/High finding marked Confirmed, Refuted, or Inconclusive based on mechanical verification.

#### Invokes

- `compact-core:security-reviewer` agent (one deep security pass)
- `compact-core:compact-security` skill (loaded by the security-reviewer agent for the threat model)
- `/midnight-verify:verify` (main-thread confirmation of Critical/High findings)

### compact-core:debug-contract

Systematic debugging for Compact smart contracts -- analyzes errors, investigates root causes, and guides fixes.

#### Output

A consolidated analysis report with categorized errors, warnings, and compiler output, followed by an interactive investigation using the compact-debugging methodology.

#### Invokes

- `compact-core:compact-debugging` skill (for systematic investigation after initial analysis)
- `/midnight-verify:verify` (for mechanical verification baseline)

### compact-core:review-compact

Comprehensive review of Compact smart contract code covering 10 categories including privacy, security, tokens, concurrency, performance, and more, with mechanical verification via /midnight-verify:verify.

#### Output

A consolidated review report with findings grouped by category (Privacy always first), severity-sorted (Critical through Suggestions), a summary table, mechanical verification results, and positive highlights.

#### Invokes

- `compact-core:compact-review` skill (loaded by each reviewer agent for category checklists)
- `compact-core:reviewer` agent (10 instances, one per review category)
- `/midnight-verify:verify` (for mechanical verification)

## Agents

### compact-dev

Compact smart contract developer agent that writes, generates, reviews, and fixes Compact code for the Midnight blockchain.

#### When to use

When you need to create new contracts, modify existing ones, fix compilation errors, implement privacy patterns, work with shielded tokens, or answer questions about Compact syntax and semantics. Follows a mandatory workflow: gather syntax reference, load skills, research patterns, write code, pre-check, compile, verify, and review.

### security-reviewer

Focused, adversarial security review agent for Compact smart contract code. Performs a single coherent threat-model pass (witness trust boundary, access control, cryptography, tokens, privacy leakage) and reasons across dimensions so compounding issues are caught.

#### When to use

When you need a security-only review of Compact code. Unlike the command-only `reviewer` agent, this agent is directly invocable by users and other agents. It cannot spawn subagents: for Critical/High findings it emits a structured "Verification Requests" block and hands mechanical confirmation back to the caller (typically the /compact-core:audit-compact orchestrator). For a full multi-category review, use /compact-core:review-compact instead.

### reviewer

Focused single-category reviewer agent for Compact smart contract code. Dispatched by the review-compact command with a specific category assignment.

#### When to use

Not intended for direct user invocation. Automatically dispatched by the review-compact command to review one of 10 categories (privacy, security, tokens, concurrency, compilation, performance, architecture, code quality, testing, documentation) in parallel.

## Hooks

### SessionStart

Two scripts run at session start:

- **CLI version check** (`scripts/SessionStart.sh`) -- checks Compact CLI availability, compiler version, and language version. Injects context about the current compiler state and reminds the agent about Midnight ecosystem practices (public npm packages, version checking commands). Falls back to static context if the compact CLI is not installed.
- **Per-session state + baseline snapshot** (`scripts/hooks/SessionStart-compact-check.sh`) -- resolves this session's state file at `~/.midnight-expert/state/<hash16>/<session-id>.json` (`<hash16>` = first 16 hex chars of `sha256(project_root)`), garbage-collects sibling state files older than 7 days (mtime), and writes a fresh `compact_files` baseline of SHA-256 hashes for every `*.compact` file under the project root (respecting `.claude/compact-check.json` exclusions) for the Stop hook to diff against. It also collects unchecked-contract handoffs left by SIBLING sessions' SessionEnd runs: each handoff entry is filtered by exclusion, dropped if the file no longer exists or its current hash no longer matches the recorded one, deduped newest-wins by path, and dropped if older than 72 hours (`flagged_at`). Any sibling file that contributed an entry has its queue atomically cleared in the same pass, so each handoff note is surfaced exactly once, and surviving entries are prepended to the additional context as a warning.

### SessionEnd

Runs the same hash + compile-found check as the Stop hook against the ending session's transcript and persists any unchecked `*.compact` files as structured handoff entries (`{path, sha256, flagged_at}`) in this session's OWN state file under `unchecked_from_previous_session`, for a sibling session's next SessionStart to collect (see above). `compact_files` is left untouched -- the 7-day GC in SessionStart is what eventually reaps a stale state file. Configured `async: true` in `hooks.json` so it does not delay session shutdown; this hook always exits 0.

### Stop

Diffs every `*.compact` file in the project against this session's state-file baseline. Quiet-on-doubt: if the state file doesn't exist yet (e.g. the plugin was installed mid-session), it's initialized from the CURRENT file hashes and nothing is flagged this time -- the check never fires from an empty baseline. For files that are new or whose hash has changed, scans the transcript -- and the session's subagent transcripts, `<transcript_dir>/<session-id>/subagents/*.jsonl` -- for a Bash `compact compile` / `compactc` invocation that names the file and was issued after the file's last modification time.

The check runs on **every** Stop event. Whether the agent is BLOCKED on the result is gated by a 5-trigger + 2-hour cooldown plus the `stop_hook_active` reattempt flag:

- **Block path** (cooldown clear, not a reattempt): emits `{decision: "block", reason: ...}` on stderr and exits 2.
- **Defer path** (cooldown active OR Stop reattempt): does not block, but writes the unchecked file list to `on_next_user_prompt[type == "compact-not-compiled"]` in this session's own state file. The `midnight-expert` plugin's `UserPromptSubmit` hook surfaces and drains that queue on the next user turn, so the warning still reaches the conversation without preventing the agent from stopping.

When the check is clean, any stale `compact-not-compiled` queue entry left from a prior turn is removed.

**Escalation**: if this session has flagged uncompiled contracts 2 or more times within the last 30 minutes, escalation text is appended to the reason on BOTH the block path and the defer path. It points at two scripts:

- `scripts/compact-check-reset.sh --state-file <path>` -- re-snapshots this session's `compact_files` baseline and clears `triggers_since_last_block`, `last_block_timestamp`, `flag_events`, `on_next_user_prompt`, and `unchecked_from_previous_session`. Intended only for confirmed false positives (files the agent did not actually modify this session) -- never as a way to silence a reminder about a real change.
- `scripts/compact-check-exclude.sh [--project-root <dir>] <path> [<path>...]` -- adds file or directory paths to `<project_root>/.claude/compact-check.json`'s `exclude` array (directories get a trailing `/`, matched as a prefix; files are exact project-relative matches). This is committed, project-level config: excluded paths are invisible to the entire compact-check machinery (scan, baselines, handoffs, queues, messages) everywhere it reads the config, not just at the point where they were flagged. Many projects gitignore `.claude/` wholesale, which would silently untrack this file -- the script warns (via `git check-ignore`) when that's the case, so you can `git add -f` it or add a negation instead.

All three hooks above (and the `midnight-expert` plugin's `UserPromptSubmit` hook) source the shared helper `scripts/hooks/_compact-check.sh`. It is one of three byte-identical copies of this file -- the other two live in `midnight-verify` and `midnight-expert` -- kept in sync by CI (`.github/workflows/ci-compact-core-hooks.yml`).
