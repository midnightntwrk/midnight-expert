---
name: midnight-verify:verify-zkir
description: >-
  ZKIR claim classification and method routing. Determines what kind of ZKIR
  claim is being verified and which verification method applies: WASM checker
  (accept/reject testing), circuit inspection (compiled structure analysis),
  or source investigation. Handles claims about opcode semantics, constraint
  behavior, field arithmetic, transcript protocol, and compiled circuit
  properties. Loaded by the /midnight-verify:verify command alongside the hub skill.
version: 0.4.0
---

# ZKIR Claim Classification

This skill classifies ZKIR-related claims and determines which verification method to use. The /midnight-verify:verify command loads this alongside the `midnight-verify:verify-correctness` hub skill.

## Claim Type → Method Routing

When you receive a ZKIR-related claim, classify it using this table to determine which agent(s) to dispatch:

### Claims About ZKIR Behavior

| Claim Type | Example | Dispatch |
|---|---|---|
| Opcode semantics | "add wraps modulo r", "mul by zero produces zero" | @"midnight-verify:zkir-checker (agent)" (checker method) |
| Constraint behavior | "assert requires boolean input", "constrain_eq fails on unequal values" | @"midnight-verify:zkir-checker (agent)" (checker method) |
| Field arithmetic | "there are no negative numbers, -1 is r-1", "(r-1) + 1 = 0" | @"midnight-verify:zkir-checker (agent)" (checker method) |
| Transcript protocol | "publicTranscript encodes ledger ops as field elements", "popeq bridges public_input" | @"midnight-verify:zkir-checker (agent)" (checker method) |
| Cryptographic opcodes | "persistent_hash produces two field elements", "ec_mul_generator derives public key" | @"midnight-verify:zkir-checker (agent)" (checker method) |
| Proof data validity | "extra private transcript outputs cause rejection", "tampered public transcript is detected" | @"midnight-verify:zkir-checker (agent)" (checker method) |
| Type encoding | "encode converts a curve point to two field elements", "decode is the inverse of encode" | @"midnight-verify:zkir-checker (agent)" (checker method) |

### Claims About Compiled Circuit Structure

| Claim Type | Example | Dispatch |
|---|---|---|
| Instruction count | "this contract produces N instructions" | @"midnight-verify:zkir-checker (agent)" (inspection method) |
| Opcode usage | "guard counter uses persistent_hash for authority" | @"midnight-verify:zkir-checker (agent)" (inspection method) |
| Transcript encoding | "increment circuit uses 3 transcript ops", "disclosure compiles to declare_pub_input" | @"midnight-verify:zkir-checker (agent)" (inspection method) |
| I/O shape | "this pure circuit has no private_input instructions" | @"midnight-verify:zkir-checker (agent)" (inspection method) |
| ZKIR version format | "compiled output uses v2 format with implicit variable numbering" | @"midnight-verify:zkir-checker (agent)" (inspection method) |

### Claims About ZKIR Internals

| Claim Type | Example | Dispatch |
|---|---|---|
| ZKIR version differences | "v3 uses named variables, v2 uses integer indices" | @"midnight-verify:source-investigator (agent)" |
| Compiler internals | "zkir-passes.ss handles v2 serialization" | @"midnight-verify:source-investigator (agent)" |
| Checker implementation | "the WASM checker enforces transcript integrity" | @"midnight-verify:source-investigator (agent)" |

### Cross-Domain Claims

| Claim Type | Example | Dispatch |
|---|---|---|
| Compact → ZKIR mapping | "this Compact disclosure compiles to these ZKIR constraints" | @"midnight-verify:zkir-checker (agent)" (both methods) + @"midnight-verify:contract-writer (agent)" (concurrent) |
| Behavior + structure | "the guard circuit uses persistent_hash AND correctly rejects wrong keys" | @"midnight-verify:zkir-checker (agent)" (both methods) |
| ZKIR + runtime agreement | "the checker and JS runtime agree on this circuit's behavior" | @"midnight-verify:zkir-checker (agent)" (checker) + @"midnight-verify:contract-writer (agent)" (concurrent) |

### Routing Rules

**When in doubt:**
- Observable checker behavior (accept/reject with specific inputs) → @"midnight-verify:zkir-checker (agent)" (checker method)
- Compiled output properties (structure, counts, patterns) → @"midnight-verify:zkir-checker (agent)" (inspection method)
- Compiler/toolchain internals (how the compiler works, not what it produces) → @"midnight-verify:source-investigator (agent)"

**When multiple methods apply, dispatch concurrently.** Checker and inspection are independent and can run in parallel within the same agent.

## Hints from the ZKIR Reference

The ZKIR reference document below catalogs the opcodes across 8 categories. The exact opcode set is tied to the installed Compact compiler — confirm the current version with `compact compile --version` (current toolchain: compactc 0.31.1) since ZKIR output may change between compiler versions. When a claim is about a specific opcode, mention the category to help the @"midnight-verify:zkir-checker (agent)" write an appropriate test contract:

- **Arithmetic:** add, mul, neg
- **Constraints:** assert, constrain_bits, constrain_eq, constrain_to_boolean
- **Control Flow:** cond_select, copy
- **Type Encoding:** decode, encode, reconstitute_field
- **Division:** div_mod_power_of_two
- **Cryptographic:** ec_mul, ec_mul_generator, hash_to_curve, keccak256, persistent_hash, transient_hash
- **I/O:** impact, output, private_input, public_input
- **Comparison:** less_than, test_eq
