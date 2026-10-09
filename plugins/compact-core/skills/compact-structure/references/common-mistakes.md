# Common Compact Mistakes

Comprehensive list of syntax and semantic mistakes when writing Compact contracts, with explanations and correct alternatives.

## Syntax Errors

### Deprecated Ledger Block Syntax

```compact
// Wrong - parse error: found "{" looking for an identifier
ledger {
  counter: Counter;
  owner: Bytes<32>;
}

// Correct - individual declarations
export ledger counter: Counter;
export ledger owner: Bytes<32>;
```

### Void Return Type

```compact
// Wrong - unbound identifier Void
export circuit doSomething(): Void {
  counter.increment(1);
}

// Correct - empty tuple []
export circuit doSomething(): [] {
  counter.increment(1);
}
```

### Pragma Format

```compact
// Wrong - parse error: found ">=" looking for an identifier
pragma >= 0.22;

// Correct - include the language_version keyword
pragma language_version >= 0.22;
```

A lower bound (`>= 0.22`), a patch version (`>= 0.22.0`), and an exact version (`0.23`) all compile. Pinning an exact version guards against future language changes, but it is a choice, not a compiler requirement.

> **Tip:** Run `compact compile --language-version` to check your compiler's supported version.

### Enum Variant Access (Rust-style)

```compact
// Wrong - parse error: found ":" looking for ")", … (";", … in a statement)
if (choice == Choice::rock) { ... }
state = GameState::waiting;

// Correct - dot notation
if (choice == Choice.rock) { ... }
state = GameState.waiting;
```

### Witness With Body

```compact
// Wrong - parse error: found "{" looking for ";"
witness get_caller(): Bytes<32> {
  return public_key(local_secret_key());
}

// Correct - declaration only, no body
witness get_caller(): Bytes<32>;
// Implementation goes in TypeScript prover
```

### Pure Function Keyword

```compact
// Wrong - parse error: found keyword "function" (which is reserved for future use) looking for "circuit"
pure function helper(x: Field): Field {
  return x + 1;
}

// Correct - use "pure circuit"
pure circuit helper(x: Field): Field {
  return x + 1;
}
```

### Deprecated Cell<T> Wrapper

```compact
// Wrong - unbound identifier Cell (Cell<T> is implicit and cannot be written explicitly)
export ledger myField: Cell<Field>;

// Correct - use the type directly
export ledger myField: Field;
```

## Semantic Errors

### Missing Disclosure

```compact
// Wrong - potential witness-value disclosure must be declared but is not: …
export circuit check(guess: Field): Boolean {
  const secret = get_secret();
  if (guess == secret) {          // the comparison uses a witness value
    return true;
  }
  return false;
}

// Correct - wrap in disclose()
export circuit check(guess: Field): Boolean {
  const secret = get_secret();
  if (disclose(guess == secret)) {
    return true;
  }
  return false;
}
```

### Missing Disclosure on Ledger Write

```compact
// Wrong - potential witness-value disclosure must be declared
export circuit store(param: Bytes<32>): [] {
  ledgerMap.insert(param, value);
}

// Correct - disclose parameters that flow to ledger
export circuit store(param: Bytes<32>): [] {
  const d = disclose(param);
  ledgerMap.insert(d, value);
}
```

### Non-Exported Enum

```compact
// Wrong - enum not accessible from TypeScript
enum State { active, inactive }

// Correct - export to access from TypeScript
export enum State { active, inactive }
```

### Counter.value() Instead of Counter.read()

```compact
// Wrong - operation value undefined for ledger field type Counter
const current = counter.value();

// Correct - use .read()
const current = counter.read();
```

### public_key() as Built-in

```compact
// Wrong - unbound identifier public_key
const pk = public_key(sk);

// Correct - use persistentHash pattern
circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:pk:"), sk
  ]);
}
```

## Type Errors

### Uint to Bytes Cast

```compact
// Both approaches work:
const b: Bytes<32> = amount as Bytes<32>;              // Direct cast is valid
const b2: Bytes<32> = (amount as Field) as Bytes<32>;  // Via Field also works
```

### Boolean to Field Cast

```compact
// Both approaches work:
const f: Field = flag as Field;                        // Direct cast is valid
const f2: Field = (flag as Uint<0..1>) as Field;       // Via Uint also works
```

### Arithmetic Result Without Cast

```compact
// Wrong - expected second argument of insert to have type Uint<64> but received Uint<0..N>
balances.insert(key, a + b);

// Correct - cast arithmetic result (and disclose parameters written to the ledger)
balances.insert(disclose(key), disclose((a + b) as Uint<64>));
```

### Mixing Field and Uint

```compact
// Arithmetic compiles -- the Uint operand widens to Field
const result = myField + myUint;      // result is Field

// Equality: cast explicitly. 0.31.1 accepts myField == myUint, but 0.35.0
// rejects it: incompatible types Field and Uint<64> for equality operator
if (myField == (myUint as Field)) { ... }

// Relational operators are the exception: Field has no ordering
// Wrong - incompatible combination of types Field and Field for relational operator
if (myField < otherField) { ... }

// Correct - cast to Uint first
if ((myField as Uint<64>) < (otherField as Uint<64>)) { ... }
```

## Compiler Error Quick Reference

| Error Message | Likely Cause | Fix |
|---------------|-------------|-----|
| `parse error: found "{" looking for an identifier` | `ledger { }` block syntax | Use individual `export ledger` declarations |
| `unbound identifier Void` | `Void` return type | Use `[]` return type |
| `parse error: found "{" looking for ";"` | Witness declared with a body | End the declaration with `;`; implement it in TypeScript |
| `parse error: found ":" looking for ")", …` | `Enum::variant` syntax | Use `Enum.variant` dot notation |
| `parse error: found ">=" looking for an identifier` | `pragma >= …` without `language_version` | `pragma language_version >= 0.22;` |
| `unbound identifier public_key` | Assuming built-in function | Use `persistentHash` pattern |
| `unbound identifier Cell` | Deprecated wrapper | Remove Cell, use type directly |
| `parse error: found keyword "function" (which is reserved for future use) looking for "circuit"` | `pure function` keyword | Use `pure circuit` |
| `operation value undefined for ledger field type Counter` | Wrong method name | Use `.read()` not `.value()` |
| `potential witness-value disclosure must be declared but is not: …` | Witness value or parameter used in a branch, ledger write, or exported return | `disclose()` at the point of use |
| `incompatible combination of types Field and Field for relational operator` | `<`, `<=`, `>`, `>=` on `Field` | Cast both operands to `Uint<N>` |
| `incompatible types Field and Uint<64> for equality operator` | `Field == Uint` on compiler 0.35.0 (0.31.1 accepts it) | Cast: `f == (u as Field)` |
| `cannot cast from type Uint<64> to type Bytes<32>` | Older compiler without direct Uint->Bytes casts | Cast directly on 0.31.1: `x as Bytes<32>`, or via Field: `(x as Field) as Bytes<32>` |
| `expected second argument of insert to have type Uint<64> but received Uint<0..N>` | Arithmetic result not cast | Cast: `(a + b) as Uint<64>` |
| `cannot prove assertion` | Logic error or bad witness value | Check logic, range checks, witness returns |
| `expected structure type, received <type>` | Accessing field on non-struct | Verify base type is a struct |

> Messages verified 2026-10-09 by compiling each pattern with Compact compiler 0.31.1 (language 0.23.0), and re-checked on 0.35.0.
