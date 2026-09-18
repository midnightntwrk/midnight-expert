# midnight-verify

<p align="center">
  <img src="assets/mascot.png" alt="midnight-verify mascot" width="200" />
</p>

Verification framework for Midnight claims -- verifies Compact code by compiling and executing test contracts, SDK/TypeScript claims by type-checking and devnet E2E testing, ZKIR circuits by running through the WASM checker and inspecting compiled structure, witness implementations by cross-domain type-checking and execution against compiled contracts, and ledger/protocol claims by Rust source inspection. Multi-agent pipeline with explicit /verify and /fast-verify commands.

## Skills

### midnight-verify:verify-correctness

Hub skill that classifies claims by domain (Compact, SDK, ZKIR, Witness, Wallet SDK, Ledger, Tooling), routes to the appropriate domain skill, dispatches sub-agents, and synthesizes final verdicts.

### midnight-verify:verify-compact

Classifies Compact-language claims and determines which verification method applies: execution (compile+run), source inspection, or both. Provides the claim type to method routing table and guidance on negative testing.

### midnight-verify:verify-sdk

Classifies SDK/TypeScript claims and determines which verification method applies: type-checking (tsc --noEmit), devnet E2E testing, source inspection, or package checks. Handles both claims about the SDK API and verification of user code that uses the SDK.

### midnight-verify:verify-ledger

Classifies ledger and protocol claims and determines which verification methods apply: source investigation (primary), type-checking (pre-flight for TypeScript API), compilation/execution (secondary), or ledger-v8 execution (secondary for API behavioral claims).

### midnight-verify:verify-tooling

Classifies Compact CLI tooling claims and determines which verification method applies: CLI execution (primary for behavioral claims) or source investigation (for internal/architectural claims).

### midnight-verify:verify-zkir

Classifies ZKIR-related claims and determines which verification method applies: WASM checker (accept/reject testing), circuit inspection (compiled structure analysis), or source investigation.

### midnight-verify:verify-witness

Classifies witness-related claims and dispatches to the witness-verifier agent. Handles claims about witness type correctness, name matching, return tuple shape, type mappings, behavioral correctness, and private state patterns.

### midnight-verify:verify-wallet-sdk

Classifies wallet SDK claims and determines which verification methods apply: type-checking (pre-flight only), source investigation (primary), or devnet E2E (fallback). Handles claims about @midnightntwrk/wallet-sdk-* packages, WalletFacade, WalletBuilder, and the three-wallet architecture.

### midnight-verify:verify-by-execution

Verification method that translates a Compact claim into a minimal test contract, compiles it with the Compact CLI, runs the compiled output with @midnight-ntwrk/compact-runtime, and interprets the result. Loaded by the contract-writer agent.

### midnight-verify:verify-by-source

Verification method that searches and reads actual compiler, ledger, and runtime source code to verify structural or architectural claims that cannot be tested via compilation. Uses octocode-mcp for quick lookups. Loaded by the source-investigator agent.

### midnight-verify:verify-by-type-check

Verification method that writes TypeScript test files exercising SDK type claims, then runs tsc --noEmit to check if types match. Also verifies user .ts files that import @midnight-ntwrk packages. Loaded by the type-checker agent.

### midnight-verify:verify-by-devnet

Verification method that runs E2E scripts against a local Midnight devnet. Writes SDK test scripts (raw or testkit-js) that exercise the full transaction pipeline: deploy, call circuits, observe state. Loaded by the sdk-tester agent.

### midnight-verify:verify-by-cli-execution

Verification method that runs Compact CLI commands and observes output. Checks CLI availability, captures stdout/stderr/exit codes, inspects filesystem changes, and interprets results. Loaded by the cli-tester agent.

### midnight-verify:verify-by-witness

Cross-domain witness verification pipeline. Compiles the Compact contract, type-checks the TypeScript witness against generated types, runs structural checklist analysis, executes the circuit with the witness, and recommends devnet E2E if needed. Loaded by the witness-verifier agent.

### midnight-verify:verify-by-zkir-checker

Verification method that runs the full ZK proof pipeline: compile without --skip-zk to generate PLONK keys, execute the circuit to get proof data, serialize with proofDataIntoSerializedPreimage(), then verify with the @midnight-ntwrk/zkir-v2 WASM PLONK checker. Loaded by the zkir-checker agent.

### midnight-verify:verify-by-zkir-inspection

Verification method that compiles Compact to ZKIR and analyzes the compiled circuit structure. Extracts .zkir JSON, parses instruction arrays, counts opcodes, traces data flow, and checks transcript encoding. Does not run the WASM checker. Loaded by the zkir-checker agent.

### midnight-verify:verify-by-ledger-source

Verification method that inspects the Midnight ledger Rust codebase. Searches and reads the actual Rust implementation to verify claims about transaction structure, token mechanics, cost model, on-chain VM, contract execution, and cryptographic primitives. Loaded by the source-investigator agent for ledger/protocol claims.

### midnight-verify:verify-by-wallet-source

Verification method that inspects the Midnight Wallet SDK source code. Searches and reads actual wallet SDK repositories to verify claims about wallet packages, the DApp Connector API, HD derivation, address encoding, and the three-wallet architecture. Loaded by the source-investigator agent for wallet SDK claims.

### midnight-verify:zkir-regression

Runs a curated set of verification claims against the current toolchain to detect behavioral changes. Supports full sweep (all categories) and targeted sweep by category (arithmetic, types, state, privacy, zk-proof, transcript).

## Commands

### midnight-verify:verify

Verify claims about Midnight, Compact code, or SDK APIs. Accepts a claim, file path, code snippet, SDK question, or no arguments to be prompted.

#### Output

A structured verdict (Confirmed, Refuted, or Inconclusive) with evidence from compilation, execution, type-checking, source inspection, or devnet testing.

#### Invokes

- `midnight-verify:verify-correctness` (hub skill for domain classification and routing)
- `midnight-verify:contract-writer` (agent, for Compact execution)
- `midnight-verify:source-investigator` (agent, for source inspection)
- `midnight-verify:type-checker` (agent, for SDK type-checking)
- `midnight-verify:sdk-tester` (agent, for devnet E2E)
- `midnight-verify:cli-tester` (agent, for CLI execution)
- `midnight-verify:witness-verifier` (agent, for witness verification)
- `midnight-verify:zkir-checker` (agent, for ZKIR checker and inspection)

### midnight-verify:fast-verify

Fast source-first verification of Midnight claims. Uses source inspection as the primary method with optional background execution checks. Faster and cheaper than /verify.

#### Output

A verdict based on source inspection, with an optional background execution check that only surfaces if it disagrees with the source-based verdict.

#### Invokes

- `midnight-verify:verify-correctness` (hub skill for domain classification)
- `midnight-verify:source-investigator` (agent, primary foreground method for most domains)
- `midnight-verify:cli-tester` (agent, foreground method for Tooling claims)
- `midnight-verify:contract-writer` (agent, optional background execution check for Compact claims)
- `midnight-verify:type-checker` (agent, optional background execution check for SDK claims)

## Agents

### contract-writer

Verifies Compact claims by writing and executing test contracts. Translates a claim into a minimal Compact contract, compiles it, runs the compiled output with compact-runtime, and reports observations.

#### When to use

Dispatched by /verify when a claim is about Compact syntax, types, stdlib functions, disclosure rules, or any behavior testable by compilation and execution.

### source-investigator

Verifies claims by inspecting actual source code of the compiler, ledger, runtime, wallet SDK, or related repositories. Uses octocode-mcp for quick lookups and falls back to local cloning.

#### When to use

Dispatched by /verify when a claim is about internal implementation details, architectural decisions, export counts, or protocol behavior that cannot be tested via compilation.

### type-checker

Verifies SDK type claims or checks user TypeScript files by running tsc --noEmit. Writes type assertion files for API claims or copies user .ts files into the SDK workspace.

#### When to use

Dispatched by /verify when a claim is about SDK function signatures, type shapes, import paths, error class hierarchies, or user TypeScript file correctness.

### cli-tester

Verifies Compact CLI tooling claims by running commands and observing output. Checks CLI availability, captures stdout/stderr/exit codes, and inspects filesystem changes.

#### When to use

Dispatched by /verify when a claim is about CLI flag behavior, compiler output structure, error messages, exit codes, or version information.

### sdk-tester

Verifies SDK behavioral claims by running E2E scripts against a local Midnight devnet. Checks devnet health first, then writes raw SDK scripts or testkit-js tests.

#### When to use

Dispatched by /verify when a claim requires runtime behavioral evidence that type-checking alone cannot provide, such as deploy+call+observe lifecycle claims.

### witness-verifier

Verifies that TypeScript witness implementations correctly match Compact contract declarations. Compiles the contract, type-checks the witness against generated types, runs structural analysis, and executes the combined pipeline.

#### When to use

Dispatched by /verify when a claim involves witness type correctness, name matching, return tuple shape, WitnessContext usage, or private state patterns.

### zkir-checker

Verifies ZKIR-level claims by running circuits through the @midnight-ntwrk/zkir-v2 WASM checker or inspecting compiled circuit structure. Supports both proof verification and structural analysis.

#### When to use

Dispatched by /verify when a claim is about opcode semantics, constraint behavior, field arithmetic, transcript protocol, proof data validity, or compiled circuit properties.

## Hooks

### SessionStart

Injects a warning at session start reminding the model that its training data about Midnight, Compact, and the Midnight SDK is unreliable and should not be trusted without verification.

The `.compact` hash baseline used by the SubagentStop checks below is the CURRENT session's own per-session state file at `~/.midnight-expert/state/<hash16>/<session-id>.json` (`<hash16>` = first 16 hex chars of `sha256(project_root)`). It is normally written by the `compact-core` plugin's `SessionStart-compact-check.sh`, but each of the four SubagentStop hooks below that use it (contract-writer, witness-verifier, zkir-checker, cli-tester) also self-initializes the state file -- quiet-on-doubt: baseline = current file hashes, nothing flagged this time -- if it doesn't exist yet, so this plugin's compile checks work even without `compact-core` installed. The plugins share that state directory, not a single settings file.

### SubagentStop

Validates that each verification sub-agent completed its work correctly before allowing it to stop. Separate hooks exist for each agent: contract-writer, source-investigator, type-checker, cli-tester, sdk-tester, witness-verifier, and zkir-checker. The contract-writer, witness-verifier, zkir-checker, and cli-tester hooks reuse the same `*.compact` hash-diff + compile-found check as `compact-core`'s Stop hook, run against the agent's own transcript (`agent_transcript_path`) via the CURRENT session's per-session state file, in addition to their agent-specific verifications (npm install, tsc, etc.). The shared helper `scripts/hooks/_compact-check.sh` is one of three byte-identical copies (the other two live in `compact-core` and `midnight-expert`); CI (`.github/workflows/ci-compact-core-hooks.yml`) enforces that all three copies stay byte-identical.
