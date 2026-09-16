---
name: compact-core:compact-language-ref
description: This skill should be used when the user asks about Compact language mechanics, syntax reference, types (Field, Bytes, Uint, Boolean, Opaque, Vector, Maybe, Either, enums, structs), type casting with "as", operators, arithmetic, control flow, for loops, modules, imports, include, pragma, stdlib functions (persistentHash, transientHash, disclose, assert, pad, default), map and fold operations, or Compact compiler errors and wrong syntax patterns.
version: 0.1.0
---

# Compact Language Reference

This skill covers Compact language mechanics: the type system, operators, expressions, type casting, control flow, the module system, and the standard library. It does not cover contract architecture (ledger declarations, circuit design, witness integration, constructor layout) -- those belong in `compact-structure`. Use this skill when you need to know how the language works rather than how to structure a contract.

## Types Quick Reference

Compact is statically and strongly typed. Every expression has a type known at compile time.

| Category | Type | Description |
|----------|------|-------------|
| **Primitive** | `Field` | Scalar field element; unbounded within the field prime |
| **Primitive** | `Boolean` | `true` or `false` |
| **Primitive** | `Bytes<N>` | Fixed-size byte array of N bytes |
| **Primitive** | `Uint<N>` | N-bit unsigned integer; values 0 to 2^N - 1 |
| **Primitive** | `Uint<0..MAX>` | Bounded unsigned integer; 0 to MAX inclusive; `Uint<8>` = `Uint<0..255>` |
| **Opaque** | `Opaque<"string">` | Hashed in circuits, full string in witnesses and TypeScript |
| **Opaque** | `Opaque<"Uint8Array">` | Hashed in circuits, `Uint8Array` in witnesses and TypeScript |
| **Collection** | `Vector<N, T>` | Fixed-size array of N elements; shorthand for `[T, T, ..., T]` |
| **Collection** | `Maybe<T>` | Optional; `some<T>(v)` / `none<T>()`; inspect `.is_some`, `.value` |
| **Collection** | `Either<L, R>` | Sum type; `left<L,R>(v)` / `right<L,R>(v)`; inspect `.is_left`, `.left`, `.right` |
| **Custom** | `enum` | Named variants; dot notation (`State.active`); export for TypeScript |
| **Custom** | `struct` | Named fields; named, positional, and spread construction |
| **Custom** | Tuples `[T, ...]` | Heterogeneous fixed-size sequences; `[]` is the unit type |

Numeric literals have tight bounded types: `42` has type `Uint<0..42>`. Subtyping allows implicit widening -- `Uint<0..42>` fits wherever `Uint<64>` is expected. All `Uint` types are subtypes of `Field`.

For full type documentation, default values, subtyping rules, and TypeScript representations, see `references/types-and-values.md`.

## Operators

### Arithmetic Operators

Compact provides three arithmetic operators. Division and modulo do not exist in the language.

| Operator | Name | Uint Result Type | Notes |
|----------|------|-----------------|-------|
| `+` | Add | `Uint<0..m+n>` | Result widens; cast back before assignment |
| `-` | Subtract | `Uint<0..m>` | Runtime error if result would be negative |
| `*` | Multiply | `Uint<0..m*n>` | Result widens; cast back before assignment |

When either operand is `Field`, the result is `Field` and wraps modulo the field prime. Cast `Uint` to `Field` explicitly only if you want to force field arithmetic semantics. Because arithmetic widens result types, cast before assigning: `balance = (balance + amount) as Uint<64>;`.

### Comparison Operators

| Operator | Name | Operand Requirement |
|----------|------|-------------------|
| `==` | Equal | Any two values with types in a subtype relation |
| `!=` | Not equal | Any two values with types in a subtype relation |
| `<` | Less than | Both operands must be `Uint` (not `Field`) |
| `<=` | Less or equal | Both operands must be `Uint` (not `Field`) |
| `>` | Greater than | Both operands must be `Uint` (not `Field`) |
| `>=` | Greater or equal | Both operands must be `Uint` (not `Field`) |

Relational operators do not work on `Field`. Cast to `Uint` first: `(f as Uint<64>) > 0`.

### Boolean Operators

| Operator | Name | Behavior |
|----------|------|----------|
| `&&` | Logical AND | Short-circuit; evaluates right only if left is `true` |
| `\|\|` | Logical OR | Short-circuit; evaluates right only if left is `false` |
| `!` | Negation | Unary prefix; flips `true` to `false` and vice versa |

All operands must have type `Boolean`.

For full details on operator type rules, conditional expressions, literal typing, and anonymous circuits (lambdas), see `references/operators-and-expressions.md`.

## Type Casting Quick Reference

Compact uses the `as` keyword for casts. TypeScript-style angle-bracket casts are not supported.

### Direct Casts

| From | To | Kind | Example |
|------|----|------|---------|
| `Uint<0..m>` | `Field` | Static (always safe) | `myUint as Field` |
| `Uint<0..m>` | `Uint<0..n>` (m <= n) | Static (widening) | `small as Uint<64>` |
| `Uint<0..m>` | `Uint<0..n>` (m > n) | Checked (runtime) | `big as Uint<8>` |
| `Field` | `Uint<0..n>` | Checked (runtime) | `f as Uint<64>` |
| `Field` | `Boolean` | Conversion | `f as Boolean` (0 -> false, else true) |
| `Field` | `Bytes<N>` | Conversion (checked) | `f as Bytes<32>` |
| `Boolean` | `Uint<0..n>` | Conversion | `flag as Uint<0..1>` (false -> 0, true -> 1). Checked when n=0 (fails at runtime if true) |
| `Boolean` | `Field` | Conversion | `flag as Field` (false -> 0, true -> 1) |
| `Uint<0..m>` | `Boolean` | Conversion | `myUint as Boolean` (0 -> false, non-zero -> true) |
| `Bytes<N>` | `Field` | Conversion (checked) | `b as Field` |
| `enum` | `Field` | Conversion | `Choice.rock as Field` (variant index) |

### Optional Multi-Step Casts

| From | To | Direct | Via Field |
|------|----|--------|-----------|
| `Uint<N>` | `Bytes<M>` | `amount as Bytes<32>` | `(amount as Field) as Bytes<32>` |

Both routes compile and produce the same result. The `Field` intermediate step is optional.

For the complete cast path table, see `references/operators-and-expressions.md`.

## Control Flow

### Variable Declarations

All local bindings use `const`. No `let`, `var`, or reassignment. Multiple bindings in one statement: `const x = 1, y = x + 1;`. Destructuring works for tuples (`const [a, b] = pair;`) and structs (`const { x, y } = point;`).

### Conditional Branching

Standard `if`/`else` with `Boolean` condition. No `else if` keyword -- use nested `if`/`else`. Ternary `c ? a : b` is also available. An `if` without `else` is allowed only when the circuit returns `[]`.

### For Loops

Two forms, both requiring compile-time-known bounds:

- **Range:** `for (const i of 0..5)` -- 0 inclusive to 5 exclusive
- **Vector/tuple:** `for (const v of values)` -- each element in order

The compiler unrolls every loop into flat circuit gates. `return` inside a loop body is rejected. Nested loops multiply gate count.

### What Does Not Exist

| Omitted | Reason | Alternative |
|---------|--------|-------------|
| `while` / `do-while` | Iteration count unknown at compile time | `for` with fixed range |
| Recursion | Unbounded call depth | Loops or repeated calls with fixed unrolling |
| `let` / `var` | Mutable state complicates circuit generation | `const` and shadowing |
| `switch` / `match` | Not part of the language | Nested `if`/`else` or ternary `c ? a : b` |
| `try` / `catch` | No exception model | `assert(condition, "message")` |
| `break` / `continue` | Every loop iteration must execute | `if` inside the loop body |

For full documentation on variable declarations, destructuring, shadowing, blocks, return statements, and loop restrictions, see `references/control-flow.md`.

## Module System

### Pragma

Every source file begins with a version pragma:

```compact
pragma language_version 0.23;
```

> **Tip:** Run `compact compile --language-version` to check which language version your compiler supports.

### Standard Library Import

`import CompactStandardLibrary;` brings all stdlib types (`Counter`, `Map`, `Set`, `MerkleTree`, `Maybe`, `Either`, `CoinInfo`) and utility functions into scope.

### Include

`include "path/to/file";` inserts contents verbatim. The compiler searches for `path/to/file.compact` in the current directory and `COMPACT_PATH` directories. No namespace isolation.

### Modules

Modules group definitions into namespaces. Identifiers are private unless exported. Modules can accept generic type parameters specialized at import time.

### Import Forms

| Form | Example | Effect |
|------|---------|--------|
| Standard library | `import CompactStandardLibrary;` | Brings all stdlib names into scope |
| Local module | `import Runner;` | Brings exported names from a local module into scope |
| Prefixed | `import Runner prefix Run_;` | All imported names get the `Run_` prefix |
| Selective | `import { test as t } from Test;` | Imports specific names with optional renaming |
| Generic | `import Identity<Field>;` | Specializes a generic module |
| Path-based | `import "utils/Auth";` | Imports from a file; file must contain a single module |

### Exports

Top-level `export` on circuits, types, and ledger fields defines the public API for TypeScript. Re-export stdlib types with `export { Maybe, Either };`.

For all import forms, generic modules, path resolution, and file organization patterns, see `references/modules-and-imports.md`.

## Standard Library Functions

All functions are available after `import CompactStandardLibrary;`.

### Hashing and Commitment Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `persistentHash` | `persistentHash<T>(value: T): Bytes<32>` | SHA-256 based hash; stable across compiler upgrades; safe to store in ledger |
| `transientHash` | `transientHash<T>(value: T): Field` | Circuit-efficient hash; may change across upgrades; use only within one circuit |
| `persistentCommit` | `persistentCommit<T>(value: T, rand: Bytes<32>): Bytes<32>` | SHA-256 based commitment with randomness; stable; safe to store in ledger |
| `transientCommit` | `transientCommit<T>(value: T, rand: Field): Field` | Circuit-efficient commitment with randomness; use only within one circuit |

Use **persistent** variants when storing in ledger or comparing across transactions. Use **transient** variants for in-circuit intermediates where lower cost matters.

### Conversion Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `degradeToTransient` | `degradeToTransient(x: Bytes<32>): Field` | Convert persistent-domain `Bytes<32>` to transient-domain `Field` |
| `upgradeFromTransient` | `upgradeFromTransient(x: Field): Bytes<32>` | Convert transient-domain `Field` back to persistent-domain `Bytes<32>` |

Use these when mixing persistent and transient operations in a single circuit.

### Utility Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `pad` | `pad(length, value): Bytes<N>` | Create fixed-size `Bytes<N>` from a string literal; pads with zero bytes; both args must be literals |
| `disclose` | `disclose(value: T): T` | Mark a witness-derived value as publicly visible; required for ledger writes, cross-contract calls, and returns |
| `assert` | `assert(condition: Boolean, message: string): []` | Abort the transaction if condition is false; the only error-handling mechanism |
| `default` | `default<T>: T` | Return the default value for any type (false, 0, all-zero bytes, first enum variant, etc.); keyword expression, not a function call |

`disclose` is required whenever a witness-derived value is stored in the public ledger, returned from an exported circuit, or passed to another contract via a cross-contract call. Commitments protect their inputs and the commitment result from disclosure. No `disclose()` wrapper is needed, even when storing the commitment in the ledger.

For full documentation on each function including examples, disclosure rules, and persistent vs. transient guidance, see `references/stdlib-functions.md`.

## Troubleshooting Quick Reference

Common wrong-to-correct patterns:

| Wrong | Correct |
|-------|---------|
| `ledger { field: Type; }` | `export ledger field: Type;` |
| `circuit fn(): Void` | `circuit fn(): []` |
| `pragma >= 0.22.0` | `pragma language_version 0.23;` |
| `Choice::rock` | `Choice.rock` |
| `public_key(sk)` | `persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:pk:"), sk])` |
| `counter.value()` | `counter.read()` |
| `if (witness_val == x)` | `if (disclose(witness_val == x))` |
| `witness fn(): T { body }` | `witness fn(): T;` (declaration only) |

For the complete compiler error reference, debugging strategies, and detailed explanations of disclosure and cast errors, see `references/troubleshooting.md`.

## Reference Routing

| Topic | Reference File |
|-------|---------------|
| Type system: primitives, opaque, collections, custom types, defaults, subtyping, TypeScript mappings | `references/types-and-values.md` |
| Arithmetic, comparison, boolean operators, cast path table, conditional expressions, literals, lambdas | `references/operators-and-expressions.md` |
| const declarations, if/else, for loops, return, blocks, destructuring, what does not exist | `references/control-flow.md` |
| Pragma, include, modules, import forms, exports, file organization patterns | `references/modules-and-imports.md` |
| persistentHash, transientHash, persistentCommit, transientCommit, pad, disclose, assert, default | `references/stdlib-functions.md` |
| Compiler error reference, wrong-to-correct syntax, non-existent functions, debugging strategies | `references/troubleshooting.md` |
