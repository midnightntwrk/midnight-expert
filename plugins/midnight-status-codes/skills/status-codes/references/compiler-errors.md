# Compact Compiler Errors Reference

> **Last verified:** 2026-05-04 against `LFDT-Minokawa/compact@main` — toolchain compiler `0.31.101`, language `0.23.101` (anchor: `compiler/compactc.ss`, modified 2026-04-23).

Compact compiler diagnostics organized by compiler phase. The compiler is written in Chez Scheme and uses a condition-based error system.

---

## Exit Codes

| Code | Meaning | Fix |
|------|---------|-----|
| 0 | Compilation succeeded | N/A |
| 1 | Bad command-line arguments | Check `compact compile --help` for correct flags |
| 254 | Internal compiler error (unhandled exception) | Report as a bug; include the full error output |
| 255 | Compilation failed (source error) | Fix the reported source errors and recompile |

---

## Error Severity Levels

| Mechanism | Severity | Description |
|-----------|----------|-------------|
| `source-errorf` | Fatal | User-visible error with source location |
| `source-warningf` | Warning | Continuable warning with source location |
| `pending-errorf` | Deferred | Collected and shown together after the pass |
| `internal-errorf` | Fatal | Compiler internal bug — "please report" |
| `external-errorf` | Fatal | External tool/file system error |

---

## Lexer Errors

These errors occur during tokenization, before any parsing takes place.

### Unexpected end of file / newline / character

**Messages:**
- `"unexpected end of file"`
- `"unexpected newline"`
- `"unexpected character '<c>'"`

**Triggers:** Unclosed string literals, unclosed block comments, or invalid characters in source.

**Fix:** Check for unclosed strings (`"…`), unclosed block comments (`/* …`), or characters that are not valid in Compact source.

---

### Nested block comment

**Message:** `"attempt to nest block comment"`

**Triggers:** Using `/*` inside an already-open `/* */` block comment.

**Fix:** Block comments cannot be nested in Compact. Use line comments (`//`) for inner comments, or restructure to avoid nesting.

---

### Invalid leading zero in numeric literal

**Compiler emits:**

```text
unsupported numeric syntax syntax: leading 0 must be followed by b, B, o, O, x, X
```

> Note: the duplicated word "syntax" matches upstream as of `compactc-v0.31.0`. The lookup catalogue stores both the duplicated and de-duplicated forms in `aliases`.

**Triggers:** Writing a number like `0123` where a digit follows the leading zero.

**Fix:** Use an explicit prefix for non-decimal literals:
- Binary: `0b1010`
- Octal: `0o755`
- Hexadecimal: `0xFF`

Do not start a decimal literal with `0` followed by another digit.

---

### Numeric literal out of Field range

**Message:** `"<value> is out of Field range"`

**Triggers:** A numeric literal exceeds the maximum representable Field value.

**Fix:** Use a smaller number. Field values are bounded by the prime used in the ZK proof system.

---

### Invalid digit in binary literal

**Message:** `"unexpected digit <d> (expected 0 or 1)"`

**Triggers:** A digit other than `0` or `1` appears in a `0b…` literal.

**Fix:** Binary literals may only contain the digits `0` and `1`.

---

### Invalid digit in octal literal

**Message:** `"unexpected digit <d> (expected 0 through 7)"`

**Triggers:** A digit `8` or `9` appears in a `0o…` literal.

**Fix:** Octal literals may only contain digits `0` through `7`.

---

## Parser Errors

These errors occur after tokenization, while the compiler builds the AST.

### Parse error (most common compiler error)

**Message:** `"parse error: found <token> looking for <expected>"`

**Triggers:** Any syntax that does not match the Compact grammar at the point the parser expected something else.

**Fix:** Read the location carefully. Common causes:
- Missing semicolons at the end of statements
- Mismatched braces `{` / `}`
- Wrong or misspelled keyword
- Extra or missing commas in argument lists

---

### Unrecognized pragma setting

**Message:** `"unrecognized pragma setting <value>"`

**Triggers:** A `pragma` directive uses a value the compiler does not recognize.

**Fix:** Check supported pragma directives. Example of a valid pragma:

```compact
pragma language_version 0.23;
```

---

### File I/O errors

**Messages:**
- `"error opening source file"`
- `"error reading source file"`
- `"<path> is a directory"`

**Triggers:** The compiler cannot open or read the specified source file, or the path points to a directory.

**Fix:** Verify the file path is correct, the file exists, and it has a `.compact` extension. Do not pass a directory path where a file is expected.

---

## Frontend Pass Errors

These errors occur during early semantic analysis: include resolution, control flow checks, and basic structural validation.

### Failed to locate included file

**Message:** `"failed to locate file <path>"`

**Triggers:** An `include` directive references a file the compiler cannot find. If the path suggests a standard library file, you may be using `include` where `import` is required.

**Fix:** Check the include path. To use the standard library, write:

```compact
import CompactStandardLibrary;
```

Do not use `include` for standard library modules.

**`std`-specific variant.** When the missing file is named `std`:

```text
failed to locate file "std": possibly replace include with import CompactStandardLibrary
```

The lookup catalogue carries this as a separate entry with its own Fix.

---

### Include cycle

**Message:** `"include cycle involving <path>"`

**Triggers:** Two or more files include each other, directly or transitively.

**Fix:** Remove the circular include dependency. Refactor shared definitions into a common file that neither of the cyclic files includes.

---

### Return inside for loop

**Message:** `"return is not supported within for loops"`

**Triggers:** A `return` statement appears inside a `for` loop body.

**Fix:** Assign the desired value to a variable declared outside the loop, then return that variable after the loop exits.

---

### Unreachable statement

**Message:** `"unreachable statement"`

**Triggers:** A statement appears after a `return` in the same block.

**Fix:** Remove the unreachable code, or reorganize so the `return` comes after all statements that should execute.

---

### Const binding in single-statement context

**Message:** `"const binding found in a single-statement context"`

**Triggers:** A `const` declaration is used where only a single statement is syntactically allowed (e.g., directly as the body of an `if` without braces).

**Fix:** Wrap the body in a block:

```compact
if condition {
  const x = …;
  …
}
```

---

### Duplicate binding in the same block

**Message:** `"found multiple bindings for <name> in the same block"`

**Triggers:** Two `const` declarations use the same name within the same block scope.

**Fix:** Rename one of the duplicate bindings.

---

### Duplicate declaration

**Message:** `"duplicate <kind> <name>"`

**Triggers:** A field, parameter, or other named element is declared more than once in the same declaration context.

**Fix:** Remove or rename the duplicate declaration.

---

## Name Resolution Errors

These errors occur when the compiler resolves identifiers to their definitions.

### Unbound identifier (very common)

**Message:** `"unbound identifier <name>"`

**Triggers:** A name is used that the compiler cannot find in any enclosing scope or imported module.

**Fix:**
- Check spelling
- Ensure the name is defined before it is used
- Verify that `import CompactStandardLibrary;` is present if using standard library names
- Check that the relevant module is imported

---

### Shadowing conflict

**Message:** `"another binding found for <name> in the same scope at <location>"`

**Triggers:** A new binding shadows an existing one in the same scope in a way the compiler flags.

**Fix:** Rename one of the bindings to avoid the conflict.

---

### Circular type alias

**Message:** `"cycle involving <types>"`

**Triggers:** Type aliases form a cycle (e.g., `type A = B; type B = A;`).

**Fix:** Break the cycle by restructuring the type definitions.

---

### Invalid context for name

**Message:** `"invalid context for reference to <kind> name <name>"`

**Triggers:** A type name is used where a value is expected, or a value name is used where a type is expected.

**Fix:** Ensure you are using the name in the correct context (type position vs. value position).

---

### No such export

**Message:** `"no export named <name> in module <module>"`

**Triggers:** An import or qualified reference names an export that does not exist in the module.

**Fix:** Check the module's actual exports. Look for a typo in the name.

---

### Wrong number of generic parameters

**Message:** `"mismatch between actual number <n> and declared number <m> of generic parameters"`

**Triggers:** A generic type or function is applied with the wrong number of type arguments.

**Fix:** Supply exactly the number of type parameters the declaration requires.

---

### Generic function cannot be top-level export

**Message:** `"cannot export type-parameterized function (<name>) from the top level"`

**Triggers:** Attempting to export a generic (type-parameterized) function directly from the module's top level.

**Fix:** Specialize the function for the concrete type(s) you need, and export the specialized version.

---

### Possibly uninitialized variable

**Message:** `"identifier <name> might be referenced before it is assigned"`

**Triggers:** The compiler's data-flow analysis determines that a variable may be used before it is definitively assigned on all paths.

**Fix:** Reorder bindings or add an initialization so the variable is always assigned before use.

---

## Type Checking Errors

These errors occur during type inference and type checking. They are among the most frequently encountered errors.

### No compatible function in scope (very common)

**Message:** `"no compatible function named <name> is in scope at this call"`

> Up to three optional context decorations may be appended (e.g. `; consider importing X`, `; defined as private`). The lookup catalogue stores the bare phrase as `code` and matches by substring.

**Triggers:** A function call cannot be resolved because no overload in scope matches the argument types provided.

**Fix:**
- Check that the argument types match the expected function signature
- Check for implicit conversions that may be needed
- Verify the function is imported
- Look at overloaded variants to see which signatures are available

---

### Ambiguous overload

**Message:** `"call site ambiguity (multiple compatible functions) in call to <name>"`

**Triggers:** More than one overloaded function is compatible with the call site's argument types.

**Fix:** Add explicit type annotations to the arguments or result to guide overload resolution to the intended function.

---

### Mismatched branch types

**Message:** `"mismatch between type <A> and type <B> of condition branches"`

Fires for both `if` expressions and `select` expressions.

**Triggers:** The `then` and `else` branches of an `if` expression (or the arms of a `select` expression) return different types.

**Fix:** Both branches must have the same type. Add explicit casts, or restructure so both branches produce the same type.

---

### Condition is not Boolean

**Message:** `"expected test to have type Boolean, received <type>"`

For `select` expressions:

```text
expected select test to have type Boolean, received <type>
```

**Triggers:** The condition of an `if`, `while`, `select`, or other conditional is not a `Boolean` expression.

**Fix:** Add an explicit comparison. For example, instead of `if x`, write `if x != 0`.

---

### Return type mismatch

**Message:** `"mismatch between actual return type <A> and declared return type <B>"`

**Triggers:** The type inferred for the function body does not match the return type annotation.

**Fix:** Either fix the return expression to produce the declared type, or update the return type annotation to match the actual type.

---

### Assignment type mismatch

**Message:** `"expected right-hand side of = to have type <A> but received <B>"`

**Triggers:** The right-hand side of an assignment or binding has a different type than the left-hand side.

**Fix:** Cast the value or restructure the expression so both sides have the same type.

---

### No such field

**Message:** `"structure <S> has no field named <F>"`

**Triggers:** Field access on a struct type uses a name that does not exist in that struct's definition.

**Fix:** Check the struct definition for the correct field name. Look for typos.

> The same section also covers the family of struct creation-syntax diagnostics — `"positional initializer found after spread or named initializer in struct creation syntax"`, `"spread initializer found after positional or named initializers in struct creation syntax"`, `"more positional initializers (~d) supplied than the number of fields (~d) of ~a"`, `"value of field ~s is already given at ~a"` / `"…is already specified positionally at ~a"`, `"value for element ~s is missing in creation syntax for ~a"`, and `"value for unrecognized field named ~a appears in creation syntax for ~a"`. All originate from the struct initializer pass and are typically fixed by aligning the initializer order/shape with the struct declaration.

---

### Invalid cast

**Message:** `"cannot cast from type <A> to type <B>"`

**Triggers:** An explicit cast between two types that the compiler does not support.

**Fix:** Not all type casts are valid in Compact. Consult the Compact language reference for which casts are permitted between the types involved.

---

### Uint width out of range

**Compiler emits:**

```text
Uint width <N> is not between 1 and the maximum Uint width <M> (inclusive)
```

> `<M>` is computed as `field-bytes * 8` and is currently 248 in `compactc-v0.31.0`. It will change if `field-bytes` changes upstream.

**Triggers:** A `Uint<N>` type is declared with `N` outside the valid range.

**Fix:** Choose a width `N` satisfying `1 ≤ N ≤ 248`.

---

### Vector or Bytes length too large

**Compiler emits:**

```text
<kind> length
  <N>
  exceeds the maximum supported length <M>
```

> `<kind>` is `vector type` or `bytes type` (not `Vector`/`Bytes`); `<M>` is currently `16777216` in `compactc-v0.31.0`.

**Triggers:** A `Vector` or `Bytes` type is declared with a length greater than 2^24 (16,777,216).

**Fix:** Use a smaller length. Redesign the data layout if you need to handle more elements.

> Two related families share this section:
>
> - **Tuple/Vector index out-of-bounds** — `"index ~d is out-of-bounds for a ~a of length ~d"` (and the slice variant `"slice index ~d plus length ~d is out-of-bounds for a ~a of length ~d"`), plus the upstream guards `"index ~d exceeds maximum allowed index ~d for a tuple or vector reference"` and `"index ~d exceeds maximum index allowed ~d for a slice"`. Fix: keep the constant index strictly less than the static length, or restructure to use a non-constant index against a vector type.
> - **Spread construction size** — `"the size of tuple/vector construction expression with vector-typed spread\n    ~d\n  exceeds the maximum vector size allowed\n    ~d"`, the parallel `…tuple-typed spread…exceeds the maximum tuple size allowed…`, and `"Bytes construction length\n    ~d exceeds the maximum bytes length allowed\n    ~d"`. Fix: shrink the input(s) to the spread/concatenation so the resulting size stays within `2^24`.

---

## Witness and Disclosure Errors

These errors enforce Compact's privacy model around witness values.

### Undeclared witness disclosure (critical)

**Compiler emits:**

```text
potential witness-value disclosure must be declared but is not:
    witness value potentially disclosed:
      <expr><tail>
```

> Emitted via `pending-errorf` (batched). Multiple disclosure errors in the same
> compile may be reported together at end-of-pass rather than at first occurrence.

**Triggers:** A witness value flows to the ledger or a public output without being wrapped in `disclose()`. This is Compact's core privacy enforcement mechanism.

**Fix:** Wrap the witness value access in `disclose()` before it reaches any ledger state or public output:

```compact
disclose(witnessValue)
```

This makes the disclosure of private data explicit and auditable in the contract source.

---

### Witness returns contract-typed value

**Message:** `"invalid type <T> for witness <W> return value: witness return values cannot include contract values"`

**Triggers:** A witness function is declared to return a type that includes a contract-typed value.

**Fix:** Witnesses must return primitive types only. Remove contract-typed values from the witness return type; pass any needed information as primitive fields.

---

### Duplicate witness declaration

**Messages (templates):**
- `"duplicate generic parameter name <sym>"`
- `"duplicate parameter name <sym>"`

**Triggers:** A `witness` declaration repeats the same generic-parameter name or parameter name within a single declaration.

**Fix:** Rename the duplicate parameter so each name is unique inside the witness signature. Witness signatures, like circuit signatures, must have distinct names for every type parameter and every argument.

---

## Purity and Sealed Field Errors

These errors enforce restrictions on circuit purity and access to sealed ledger state.

### Exported circuit modifies sealed field

**Message:** `"exported circuits cannot modify sealed ledger fields but <circuit> at <location>"`

**Triggers:** An exported circuit attempts to write to a ledger field that is marked `sealed`.

**Fix:** Move the sealed-field modification into an internal (non-exported) circuit, and call that from the exported circuit if needed.

**Indirect-call variant:**

```text
exported circuits cannot modify sealed ledger fields but <circuit> calls (directly or indirectly) <other>, which <reason> at <loc>
```

---

### Constructor calls external contract

**Message:** `"constructor cannot call external contracts"`

**Triggers:** The contract constructor contains a call to an external contract.

**Fix:** Move external contract calls into a circuit. The constructor may only set up initial ledger state.

**Indirect-call variant:**

```text
constructor cannot call external contracts but calls (directly or indirectly) <other>, which <reason> at <loc>
```

---

### Pure circuit is actually impure

**Message:** `"circuit <name> is marked pure but is actually impure"`

**Triggers:** A circuit annotated as `pure` contains an operation that is impure: writing to the ledger, calling an external contract, etc.

**Fix:** Either remove the `pure` annotation, or eliminate the impure operations from the circuit body.

**Indirect-call variant.** When the impurity is via a transitive call:

```text
circuit <name> is marked pure but is actually impure because it calls (directly or indirectly) impure circuit <other> at <loc>
```

---

### Runtime-only method invoked in-circuit

**Message (template):** `"<receiver> <method> is a runtime-only method, but was invoked in-circuit"`

**Triggers:** A circuit body invokes a method that is only legal in the runtime/JS-side execution path. These methods are unavailable inside the constraint system: they have no ZKIR encoding.

**Fix:** Move the call out of the circuit (into the surrounding TypeScript or witness code), or substitute the corresponding circuit-safe API. Common offenders include methods that mutate JS-side state or that rely on host I/O.

---

### Impure export name collision (case-insensitive filesystems)

**Message (template):**

```text
the exported impure circuit name <a> is identical to the exported circuit name <b> at <loc> modulo case;
please rename to avoid zkir and prover-key filename clashes on case-insensitive filesystems
```

**Triggers:** Two exported circuits resolve to the same name modulo case (one impure, one pure or another impure). The compiler writes per-circuit `.zkir` and prover-key files keyed by name, and case-only differences would clash on macOS/Windows filesystems.

**Fix:** Rename one of the circuits so the names differ by more than case. The compiler enforces this even on case-sensitive Linux filesystems to keep generated artifacts portable.

---

## ZKIR Generation Errors

These errors occur when the compiler generates the ZK Intermediate Representation from the type-checked AST.

### Cross-contract calls not yet supported

**Message:** `"cross-contract calls are not yet supported"`

**Triggers:** The contract attempts a cross-contract call, which has not yet been implemented in the ZKIR output stage.

**Fix:** This is a current compiler limitation. Restructure to avoid cross-contract calls until the feature is available.

---

### Unrecognized native circuit

**Message (template):** `"unrecognized native circuit <name>"`

**Triggers:** During ZKIR lowering the compiler encountered a reference to a built-in (native) circuit name that is not registered in this compiler version. This usually means the language version pragma in the source asks for a primitive that the installed compiler does not implement, or a user-defined name shadows a future-built-in primitive.

**Fix:**

- Confirm the language-version pragma matches the installed compiler.
- Update the compiler to a version that supports the named primitive.
- If the call resolves to user-defined code, verify it is not shadowing a future-built-in name (e.g. by renaming it).

---

### ZKIR non-zero exit status

**Message:** `"zkir returned a non-zero exit status <N>"`

**Triggers:** The external ZKIR compilation tool exited with an error.

**Fix:** Review the output for details on the unsupported operation. Check for operations in circuits that the ZKIR backend does not yet support.

---

## Runtime Errors

Runtime errors thrown by `@midnight-ntwrk/compact-runtime` (`CompactError`, `failed assert`, `type error`, `Version mismatch`, `Maximum field mismatch`, and the type-validation / cast / state-dependency errors) live in their own reference: see [`runtime-errors.md`](runtime-errors.md).

The compiler is the *origin* of some of these errors (it generates the runtime code that throws them), but the *surface* — the package whose stack frame appears in user errors — is `@midnight-ntwrk/compact-runtime`. Look up these errors there.

---

## Recently Added Diagnostics (compiler 0.26+ → 0.31)

The following diagnostics were added (or refined) in recent compiler releases. They are not exhaustive — see `LFDT-Minokawa/compact` for the complete list — but cover the highest-impact additions since the original compiler-errors reference was written.

### Merkle tree depth out of bounds (added in compiler 0.26.105)

**Message (template):** `"<kind> depth <D> does not fall in <min> <= depth <= <max>"`

**Triggers:** A `MerkleTree` or `HistoricMerkleTree` is declared with a depth outside the protocol-defined bounds (typically 1..=32).

**Fix:** Choose a depth within the allowed range. For most application scenarios, 32 is the right default.

---

### Opaque-JS persistentHash / persistentCommit (added in compiler 0.29.113)

**Triggers:** Calling `persistentHash` or `persistentCommit` on `Opaque<'string'>` or `Opaque<'Uint8Array'>` JS values, or indirectly via `merkleTreePathRoot` and `MerkleTree` insertion of opaque-JS values.

**Fix:** Hash these in TypeScript before they enter Compact, or restructure to use ledger-native types. This is a hard error, not a warning — the previous behavior allowed unsound hashing across JS-side opacity.

---

### `event` and `log` reserved keywords (added in compiler 0.31.101)

**Triggers:** Using `event` or `log` as an identifier (variable, function, type name).

**Fix:** Rename the identifier. These are reserved for future language features.

---

### Multiple top-level exports for the same name

**Message:** `"multiple top-level exports for ~s"`

**Triggers:** The same identifier is exported more than once at the top level of a Compact program.

**Fix:** Remove the duplicate export. Each name can be exported at most once.

---

### Indirect-call sealed/pure/constructor variants

**Triggers:** A circuit calls (directly or indirectly) another circuit that violates a contract:

- **Pure circuit transitively calls impure code:** `"circuit ~a is marked pure but is actually impure because it calls (directly or indirectly) impure circuit ~a at ~a"`
- **Exported circuit transitively modifies sealed field:** `"exported circuits cannot modify sealed ledger fields but ~a calls (directly or indirectly) ~a, which ~a at ~a"`
- **Constructor transitively calls external contract:** `"constructor cannot call external contracts but ~a calls (directly or indirectly) ~a, which ~a at ~a"`

**Fix:** Trace the call chain from the offending circuit. Either remove the contract violation in the inner circuit, or remove the call from the constraining outer one.

> The plugin previously documented only the **direct** form of each error. Indirect (transitive) variants are a separate diagnostic with a longer message that includes the call chain.

---

### Module name mismatch in imported file

**Message (template):** `"<pathname> defines module <actual> rather than expected module <expected>"`

**Triggers:** A Compact source file is imported under a module name, but the file's top-level `module` declaration uses a different name.

**Fix:** Either rename the file's `module` declaration to match the import, or change the import to refer to the actual module name in the file.

---

### Contract-info file mismatch family

When a `.compact` file declares an external contract that no longer matches its `contract-info` JSON file, the compiler emits one of the following templates. They split into three groups:

**Malformed file** (raised via `external-errorf` — fatal, exits with the external-error code):

- `"malformed contract-info file <path> for <name>: <reason>; try recompiling <path>"`

**Stale file** (the source `.compact` is newer than the cached `contract-info`):

- `"<source> has been modified more recently than <contract-info>; try recompiling <source>"`

**Declaration mismatch** (the calling `.compact` and the upstream contract definition disagree):

- `"contract <C> has no circuit declaration named <name>"`
- `"contract <C> has no circuit declaration named <name>"` (transposed forms)
- `"contract declaration claims circuit <name> is pure, but it is not in the actual contract definition"`
- `"contract declaration claims circuit <name> has <n> argument(s), but in the actual contract definition it has <m>"`
- `"contract declaration claims the type of circuit <name> argument <i> is <T>, but in the actual contract definition it is <U>"`
- `"contract declaration claims the return type of circuit <name> is <T>, but in the actual contract definition it is <U>"`
- `"contract declaration has a circuit named <name>, but it is not present in the actual contract definition"`
- Other historical templates: `"declared circuit ~s not present in contract-info file ~a"`, `"pure-flag mismatch for circuit ~s in ~a: declared ~a, actual ~a"`, `"mismatch between actual number ~s and declared number ~s of generic parameters for ~s"`.

**Fix:** Recompile the upstream contract so the `contract-info` JSON matches its source, or update the calling contract's external declarations (argument count, types, return type, purity, generic-parameter count) to match the actual definition. If the file is malformed (corrupted, hand-edited, version mismatch), delete and regenerate it via a fresh compile.

---

### Uint range bounds

**Messages:**
- `"range start for Uint type is ~d but must be 0"`
- `"range end for Uint type is ~d but must be …"`
- `"constant ~d is larger than the largest representable Uint; use…"`

**Triggers:** Declaring a `Uint` with an out-of-range start, end, or literal value.

**Fix:** Use `0` as the start (Uint is always nonnegative), and choose an end ≤ the maximum the bit width supports.

---

### For-loop range bound errors

**Messages:**
- `"start bound ~d is greater than the maximum unsigned integer"`
- `"end bound ~d is less than start bound"`
- `"the difference … exceeds the maximum vector size"`

**Triggers:** A `for` loop over an explicit range with start/end values that produce an unrepresentable iteration set.

**Fix:** Adjust the bounds so the loop's iteration count fits within `2^24` (the maximum vector size).

---

### Witness-disclosure (pending-errorf nature)

**Message (multi-line, verbatim):**
```
potential witness-value disclosure must be declared but is not:
    witness value potentially disclosed:
      <name>{<context>}
```

**Triggers:** A witness value flows into a position visible from the public transcript without an explicit `disclose(...)` call.

**Fix:** Either wrap the disclosing expression in `disclose(...)` to make the disclosure explicit, or restructure the circuit so the witness value does not reach a public position.

> This is one of the few `pending-errorf` diagnostics — the compiler defers and batches these so multiple disclosure issues report together rather than aborting on the first one. Severity is still fatal.

---

### Reserved-word used as identifier

**Message (template):** `"~s is a reserved word and may not be used as an identifier"`

**Triggers:** Using a reserved Compact keyword (including newly-reserved `event` and `log` from compiler 0.31.101) as an identifier name.

**Fix:** Rename the identifier.

---

### "expected select test" — Boolean condition variant

**Message:** `"expected select test to have type Boolean, received ~a"`

**Triggers:** A `select` expression's test position has a non-Boolean type.

**Fix:** Wrap the test in a comparison or boolean operation. Same root cause as the existing "Condition is not Boolean" entry, but the message wording differs for `select` vs `if`.

---

## Type-Checker Diagnostic Families

These entries group large numbers of related type-checker templates that all share a single root cause and a single fix. The compiler emits many phrasing variants depending on which builtin or position triggered the check, but the user's correction is the same in every variant.

### Builtin-call type mismatch

**Templates (variants):** Many templates of the form `"expected <T1> for <builtin> call, received <T2>"`, `"expected <T1>, got <T2> for <builtin>"`, or `"mismatch between Bytes lengths <N> and <M> for <builtin>"`. Builtins observed: `bytes->vector`, `bytes->field`, `cast-from-bytes`, `cast-from-enum`, `cast-to-enum`, `downcast-unsigned`, `upcast`, `vector->bytes`, `bytes-ref`, `vector-ref`, `field->bytes`, `slice`.

**Triggers:** A builtin conversion or accessor was called with an argument of the wrong type or wrong length.

**Fix:** Inspect the call site and the declared type of the argument. Adjust the surrounding code so the value reaching the builtin has exactly the type the builtin expects. For length mismatches, change the source `Bytes<N>` declaration or use a different builtin that accepts the actual length.

---

### Aggregate (tuple/Vector/Bytes) expected

**Templates:** Many `"expected <kind>, received ~a"` variants — including spread-context, slice-context, vector-ref, struct-spread, and the various non-empty-aggregate forms.

**Triggers:** A position that requires a tuple, `Vector<…>`, or `Bytes<…>` value received a non-aggregate (or empty-aggregate) type.

**Fix:** Construct or coerce the value to the expected aggregate shape. For non-empty requirements, ensure length is `>= 1`. For spreads and slices, confirm the source is a tuple, vector, or `Bytes` value rather than a struct or scalar.

---

### Generic "expected type X, received Y" (non-builtin)

**Templates:** `"expected enum type, received ~a"`, `"expected structure type, received ~a"`, `"expected primitive type tcontract for contract call, received ~a"`, `"expected ADT-type for ledger declaration after expand-modules-and-types, received ~a"`, `"expected ~a type to be an ordinary Compact type but received ADT type ~a"`, `"expected index to have an unsigned type, received ~a"`, `"~a requires its ~a operand to be a Field or Uint; the actual type is ~a"`.

**Triggers:** The position required a specific kind of type and got a different one.

**Fix:** Use the required kind in the failing position. For "ordinary type vs ADT type" complaints, drop the ADT wrapper or move the access through an ADT operator such as `.read()` or `.member(...)`.

---

### Declared/actual type or count mismatch

**Templates:** `"mismatch between actual type ~a and declared type ~a [of …|for field …]"`, `"mismatch between actual type ~a and expected type ~a for ~a"`, `"expected ~a but received ~a for generic parameter ~s declared at ~a"`.

**Triggers:** A declared type or generic-parameter signature does not match the value or argument supplied.

**Fix:** Make the declared type match the actual value, or adjust the value to fit the declared type. For generic parameters, check the declaration site quoted in the message.

---

### Incompatible types for binary, relational, or equality operator

**Templates:** `"incompatible combination of types ~a and ~a for [binary arithmetic operator|relational operator|<op>]"`, `"incompatible types ~a and ~a for [equality|relational] operator"`, `"non-equivalent types ~a and ~a for equality operator"`, `"resulting value might exceed largest representable Uint value (for Field semantics, cast either operand to Field)"`.

**Triggers:** Two operands of an arithmetic, relational, or equality operator have types that do not combine. The "might exceed" form indicates Uint result overflow.

**Fix:** Cast one or both operands to a common type. For "might exceed" warnings on Uint arithmetic, cast either operand to `Field` to use Field semantics.

---

### ADT misuse (assignment, default, ledger access)

**Templates:** `"ADT nesting is permitted only within Map ADTs"`, `"cannot nest ~s ADTs within another ADT"`, `"expected left-hand side of [+=|-=|=|~a] to have an ADT type, received ~a"`, `"operation ~a undefined for ledger field type ~a"`, `"default is not defined for ADT type Kernel"`, `"default is not defined for contract types"`, `"expected a ledger field name at base of ledger access"`, `"incomplete chain of ledger indirects: final result must be a regular type, but received ADT type ~a"`, `"incomplete reference to nested ADT"`.

**Triggers:** An ADT-typed (ledger ADT) value was used outside the operations it supports — assigned with `=`, given a `default(...)`, or referenced through a partial chain.

**Fix:** Use the ADT's published operators (`.read`, `.write`, `.insert`, `.remove`, etc.). If you need a primitive value, complete the indirect chain so the final result is a regular Compact type. ADT nesting outside `Map<K, V>` is unsupported — flatten the structure.

---

### Contract-typed values in disallowed positions

**Templates:** `"invalid type ~a for circuit ~a argument ~d:\n  exported circuit arguments cannot include contract values"`, `"invalid type ~a for circuit ~a return value:\n  exported circuit return values cannot include contract values"`, `"contract types are not yet implemented"`, `"opaque type ~a is not supported"`.

**Triggers:** A contract handle (the `contract<...>` type) appears as an exported circuit argument or return, or in a TypeScript-output position the compiler does not yet handle.

**Fix:** Pass primitive values (Field, Bytes, Uint) across the export boundary and reconstruct contract handles inside the circuit. The "contract types are not yet implemented" form is a planned-future-feature placeholder; the diagnostic disappears as the relevant TypeScript lowering pass lands.

---

### Compile-time-constant index required

**Templates:** `"Bytes index did not reduce to a constant nonnegative value at compile time"`, `"slice index did not reduce to a constant nonnegative value at compile time"`, `"vector index did not reduce to a constant nonnegative value at compile time"`, `"invalid cast from field to Bytes<0>"`.

**Triggers:** Indexing into `Bytes`, `Vector`, or a slice with a value the constant-folder could not resolve to a non-negative integer at compile time.

**Fix:** Replace the dynamic index with a literal integer or a `const`-bound identifier whose value the compiler can fold. If the index genuinely needs to be runtime-computed, re-design to use ADT operators (e.g., `Map`) instead of bare `Bytes`/`Vector` indexing.

---

### Function body can return without supplying a value

**Template:** `"~a is declared to return a value of type ~a, but its body can return without supplying a value"`

**Triggers:** A circuit, witness, or function declared with a non-`[]` return type has at least one path that hits the end of the body (or an early `return;`) without producing a value.

**Fix:** Add an explicit `return <expr>;` on every reachable path, or change the declared return type to `[]`.

---

### `fold` first-argument / return-type mismatch

**Template:** `"fold requires the return type and first-argument type to be the same"` (with inferred-vs-declared annotations).

**Triggers:** The accumulator type returned by the folding circuit does not match the type of `fold`'s first argument (the seed).

**Fix:** Make the seed type match the return type of the folding circuit. The annotated `[inferred]` notation in the message indicates which side the compiler inferred vs. read from a declaration.

---

### Spread-construction structure mismatch

**Template:** `"the type of the spread structure: <T1> does match the declared type of the structure to be created: <T2>"` (sic — the `does match` wording is an upstream typo; in practice this fires for the *non-matching* case).

**Triggers:** A struct-spread expression's source structure has a type incompatible with the declared structure shape.

**Fix:** Spread a value whose type matches the destination structure, or build the structure explicitly without a spread.

---

### Wrong number of arguments

**Templates:** `"~a ~a requires ~a argument(s) but received ~a"`, `"~a.~a requires ~a argument(s) but received ~a"`.

**Triggers:** A circuit, witness, ADT method, or builtin was called with the wrong number of arguments.

**Fix:** Inspect the declaration of the called name and supply the correct argument count.

---

### Pad-string target shorter than UTF-8 length

**Template:** `"cannot pad ~s to length ~s since its utf8-equivalent already exceeds that length"`

**Triggers:** `pad(string, length)` was given a length smaller than the UTF-8 byte-length of the input string.

**Fix:** Increase the target length, or pre-truncate the input before padding.

---

## Name-Resolution Diagnostic Families

### Disallowed top-level export

**Templates:** `"attempt to export ~a name ~s"`, `"cannot export ~a (~s) from the top level"`, `"cannot export alias for ADT types from the top level"`, `"cannot export type-parameterized function (~s) from the top level"`, `"multiple top-level exports for ~s"`.

**Triggers:** An export targets a kind of name the language does not allow exporting (or exports the same name twice).

**Fix:** Remove the offending `export`. For type-parameterized circuits, export a non-generic wrapper instead. For duplicate exports, remove the redundant one.

---

### Misplaced or duplicate top-level constructor

**Templates:** `"misplaced constructor: should appear only at the top level of a program"`, `"found other ledger constructors in program: …"`.

**Triggers:** A `constructor { ... }` block appears nested (not at the top level), or the program contains more than one ledger `constructor`.

**Fix:** Move the constructor to the top level of the program. A program may contain at most one ledger constructor — merge bodies if you have several.

---

### File missing a single module definition

**Template:** `"~a does not contain a (single) module defintion"` (sic — the upstream typo `defintion` is preserved in the message).

**Triggers:** An imported `.compact` source file does not contain exactly one top-level `module` declaration (zero, or more than one).

**Fix:** Add a single `module Name { ... }` wrapper to the file, or split files so each imported file declares one module.

---

### Recursion involving identifiers

**Template:** `"recursion involving~?"` (the trailing `~?` is a Scheme format-recursive directive that gets filled in with the offending identifier list).

**Triggers:** Compact does not allow general circuit recursion; this fires when a static-analysis pass detects a recursive reference cycle among circuit definitions.

**Fix:** Restructure the program to remove the cycle. Use iteration (`for`), `fold`, or refactor recursive helpers into a flat sequence.

---

## Compiler Warnings (non-fatal)

These diagnostics are emitted via `source-warningf` (or its deferred-warning sibling). They do not fail compilation, but they flag situations where the user's intent may not match what the compiler is doing.

### Warning: Old standard-library / ledger operator name

**Template:** `"apparent use of an old standard-library / ledger operator name <old>: the new name is <new>"`

**Triggers:** The program references an identifier whose name was renamed in a recent standard-library or ledger version. The compiler suggests the new name and continues.

**Fix:** Rename the reference to the new name shown in the message. The warning will disappear at the next compile.

---

### Warning: Uint range end may be left unchanged after generic-size update

**Message (template):** `"Uint range end expressed as a reference to generic size <name> is left unchanged and must be updated manually"`

**Triggers:** A `Uint` range end is expressed as a reference to a generic size symbol. When that generic size is later resolved to a concrete value, the compiler cannot rewrite the range end automatically — the range may then be too narrow or too wide for the resolved size.

**Fix:** After the generic size is bound to a concrete value, audit any `Uint` range ends that referenced the generic and update them to match. The warning is informational; the compile still succeeds.

---

### Warning: Renaming reference not applied (binding-aware rewrite skipped)

**Messages (templates):**
- `"not renaming reference of <old> to <new> because <old> has other bindings in scope"`
- `"not renaming reference of <old> to <new> because this would cause the reference to be captured by an existing local binding for <new>"`

**Triggers:** The compiler attempted a deprecation-driven rename (typically the old standard-library / ledger operator name to its new form) but skipped it because applying the rename would either shadow an existing in-scope binding or cause variable capture. Common after upgrading the standard library to a version that renames operators.

**Fix:** Rename the conflicting local binding first, then re-run the compile so the rename can apply, or update the call site manually to the new name. This is a warning, not an error — the compile succeeds, but the reference points at the old (possibly removed) name.
