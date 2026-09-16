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
// Wrong - parse error: found "{" looking for ";"
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
// Wrong - open-ended lower bound accepts untested future versions
pragma language_version >= 0.22;

// Correct - pin the specific verified language version
pragma language_version 0.23;
```

> **Tip:** Run `compact compile --language-version` to check your compiler's supported version.

### Enum Variant Access (Rust-style)

```compact
// Wrong - parse error: found ":" looking for ")"
if (choice == Choice::rock) { ... }
state = GameState::waiting;

// Correct - dot notation
if (choice == Choice.rock) { ... }
state = GameState.waiting;
```

### Witness With Body

```compact
// Wrong - parse error after witness declaration
witness get_caller(): Bytes<32> {
  return public_key(local_secret_key());
}

// Correct - declaration only, no body
witness get_caller(): Bytes<32>;
// Implementation goes in TypeScript prover
```

### Pure Function Keyword

```compact
// Wrong - "function" keyword does not exist
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
// Wrong - Cell<T> is implicit and cannot be written explicitly
export ledger myField: Cell<Field>;

// Correct - use the type directly
export ledger myField: Field;
```

## Semantic Errors

### Missing Disclosure

```compact
// Wrong - implicit disclosure of witness value
export circuit check(guess: Field): Boolean {
  const secret = get_secret();
  if (guess == secret) {          // Error: implicit disclosure
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
// Wrong - operation "value" undefined for Counter
const current = counter.value();

// Correct - use .read()
const current = counter.read();
```

### public_key() as Built-in

```compact
// Wrong - unbound identifier "public_key"
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
const b: Bytes<32> = (amount as Field) as Bytes<32>;   // Via Field also works
```

### Boolean to Field Cast

```compact
// Both approaches work:
const f: Field = flag as Field;                        // Direct cast is valid
const f: Field = (flag as Uint<0..1>) as Field;        // Via Uint also works
```

### Arithmetic Result Without Cast

```compact
// Wrong - expected Uint<64> but received Uint<0..N>
balances.insert(key, a + b);

// Correct - cast arithmetic result
balances.insert(key, (a + b) as Uint<64>);
```

### Incompatible Type Comparison

```compact
// Wrong - incompatible combination of types Field and Uint
if (myField == myUint) { ... }

// Correct - cast to same type
if (myField == (myUint as Field)) { ... }
```

### Incompatible Type Arithmetic

```compact
// Wrong - Field + Uint not allowed
const result = myField + myUint;

// Correct - cast Uint to Field first
const result = myField + (myUint as Field);
```

## Compiler Error Quick Reference

| Error Message | Likely Cause | Fix |
|---------------|-------------|-----|
| `parse error: found "{" looking for an identifier` | `ledger { }` block syntax | Use individual `export ledger` declarations |
| `parse error: found "{" looking for ";"` | `Void` return type | Use `[]` return type |
| `parse error: found ":" looking for ")"` | `Enum::variant` syntax | Use `Enum.variant` dot notation |
| `unbound identifier "public_key"` | Assuming built-in function | Use `persistentHash` pattern |
| `unbound identifier "Cell"` | Deprecated wrapper | Remove Cell, use type directly |
| `unbound identifier "function"` | `pure function` keyword | Use `pure circuit` |
| `operation "value" undefined for Counter` | Wrong method name | Use `.read()` not `.value()` |
| `implicit disclosure of witness value` | Missing `disclose()` in conditional | Wrap with `disclose()` |
| `potential witness-value disclosure must be declared` | Witness value flowing to ledger | `disclose()` before ledger write |
| `incompatible combination of types Field and Uint` | Type mismatch | Cast with `as` |
| `cannot cast from type Uint<64> to type Bytes<32>` | Direct Uint->Bytes | Cast directly: `x as Bytes<32>` or via Field: `(x as Field) as Bytes<32>` |
| `expected second argument ... Uint<64> but received Uint<0..N>` | Arithmetic result not cast | Cast: `(a + b) as Uint<64>` |
| `cannot prove assertion` | Logic error or bad witness value | Check logic, range checks, witness returns |
| `member access requires struct type` | Accessing field on non-struct | Verify base type is a struct |
