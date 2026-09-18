# Control Flow

> **Last verified:** 2026-09-18 — all positive examples (const multi-binding, tuple/struct destructuring, `if`/`else`, range & vector `for`, ternary) compile-verified against Compact compiler `0.31.1` / language `0.23` / runtime `0.16.0` (`compact compile --skip-zk`).

Compact circuits have restricted control flow to guarantee that every program compiles to a fixed-size zero-knowledge circuit. There are no unbounded loops, no recursion, and no mutable variables. Every construct described here reflects that constraint.

## Variable Declarations (const)

All local bindings use `const`. There is no `let`, no `var`, and no reassignment. Once a name is bound, its value cannot change.

### Basic binding

```compact
export circuit example(): Field {
  const x = 42;
  const name: Bytes<5> = "hello";
  return x;
}
```

A type annotation is optional. The compiler infers the type when omitted, and rejects the program when the annotation does not match the expression.

### Multiple bindings

A single `const` statement can bind several names, evaluated left to right. Later bindings can reference earlier ones in the same statement:

```compact
circuit multi(): Field {
  const x = 1, y = x + 1, z = y * 2;
  return z;  // returns 4
}
```

A name cannot be referenced before its binding within the same statement:

```compact
circuit bad(): Field {
  // const y = x, x = 1;  // rejected -- x is not yet bound
  const x = 1, y = x;
  return y;
}
```

### Shadowing

A name cannot be reused within the same block. However, a nested block can shadow an outer binding:

```compact
circuit shadowing(): Field {
  const answer = 42;
  // const answer = 12;  // rejected -- duplicate in the same block
  {
    const answer = 12;
    assert(answer != 42, "shadowing didn't work!");
  }
  return answer;  // returns 42
}
```

### Destructuring

Tuple destructuring uses bracket syntax. Unused positions can be skipped with empty slots:

```compact
circuit tupleExample(): Field {
  const pair = [10, 20];
  const [a, b] = pair;
  const [first, ] = [100, 200, 300];  // binds only first
  return a + b + first;
}
```

Structure destructuring uses brace syntax. Fields can be listed in any order, and you only need to bind the fields you want:

```compact
struct Point { x: Field, y: Field }

circuit structExample(): Field {
  const p = Point { x: 3, y: 7 };
  const { x, y } = p;
  return x + y;
}
```

A field can be rebound to a different name with `fieldName: newName` syntax:

```compact
circuit renameExample(): Field {
  const p = Point { x: 3, y: 7 };
  const { x: px, y: py } = p;
  return px + py;
}
```

## if/else

Standard conditional branching. The condition must be `Boolean`.

```compact
export circuit max(a: Uint<64>, b: Uint<64>): Uint<64> {
  if (a > b) {
    return a;
  } else {
    return b;
  }
}
```

An `if` without an `else` is allowed when the circuit returns `[]`:

```compact
export ledger count: Counter;

export circuit maybeIncrement(flag: Boolean): [] {
  if (disclose(flag)) {
    count.increment(1);
  }
}
```

When both branches return a value, their types must be compatible. If one branch returns and the other does not, the missing branch implicitly returns `[]`. This causes a type error when the circuit declares a non-`[]` return type:

```compact
// REJECTED: the else branch implicitly returns [], which
// conflicts with the Boolean return type
export circuit broken(c: Boolean): Boolean {
  if (c) {
    return true;
  }
  // missing else -- implicit return [] != Boolean
}
```

There is no `else if` keyword. Chain conditions with nested if/else blocks:

```compact
circuit classify(n: Uint<8>): Uint<8> {
  if (n == 0) {
    return 0;
  } else {
    if (n < 10) {
      return 1;
    } else {
      return 2;
    }
  }
}
```

## for Loops

Compact provides `for` loops with two iteration forms. Both require iteration bounds known at compile time so the compiler can unroll them into a fixed-size circuit.

### Range iteration

The syntax `lower..upper` iterates from `lower` (inclusive) to `upper` (exclusive):

```compact
export ledger total: Field;

export circuit sumRange(): [] {
  for (const i of 0..5) {
    // i takes values 0, 1, 2, 3, 4
    total = total + i;
  }
}
```

An empty range like `0..0` produces zero iterations.

### Vector/tuple iteration

Iterating over a vector or tuple literal visits each element in order:

```compact
export circuit sumVector(): Field {
  const values = [10, 20, 30];
  const result: Field = 0;
  for (const v of values) {
    // v takes values 10, 20, 30
  }
  return result;
}
```

### Loop body restrictions

Loop bounds must be compile-time constants because the compiler unrolls every loop into a flat sequence of circuit gates. A loop with `N` iterations produces `N` copies of its body in the compiled circuit.

`return` statements inside a `for` loop body are not supported. The compiler explicitly rejects them. Perform computation inside the loop and return after it:

```compact
export circuit sumFirst5(): Field {
  const acc: Field = 0;
  for (const i of 0..5) {
    // return i;  // rejected -- cannot return inside a for loop
  }
  return acc;
}
```

### Nested loops

Loops can be nested. Each level multiplies the total iteration count:

```compact
export circuit nested(): [] {
  for (const i of 0..3) {
    for (const j of 0..4) {
      // executes 12 times total
    }
  }
}
```

## return Statements

Every circuit must explicitly return on all code paths, unless its return type is `[]`.

### Returning a value

```compact
export circuit add(a: Field, b: Field): Field {
  return a + b;
}
```

The type of the returned expression must be a subtype of the declared return type.

### Returning void

Circuits with return type `[]` can use `return;` or omit the return entirely:

```compact
export ledger flag: Boolean;

export circuit setFlag(): [] {
  flag = true;
  return;  // optional -- implicit return [] at end of block
}
```

### Dead code after return

It is a static type error to place a statement after a `return` in the same block:

```compact
// REJECTED: unreachable code after return
circuit bad(): Field {
  return 1;
  const x = 2;  // static error
}
```

## Blocks

Curly braces create nested scopes. Constants declared inside a block are not visible outside it:

```compact
circuit blockExample(): Field {
  const x = 1;
  {
    const x = 99;      // shadows outer x inside this block
    const y = x + 10;  // y is only visible in this block; uses shadowed x (99)
  }
  // y is not accessible here
  return x;  // returns 1, not 99
}
```

A block is itself a statement, so it can appear anywhere a statement is expected -- inside `if` branches, `for` bodies, or at the top level of a circuit body.

## What Compact Does Not Have

Compact intentionally omits several constructs found in general-purpose languages. Each omission exists because zero-knowledge circuits require fixed, bounded computation.

| Omitted construct | Reason |
|-------------------|--------|
| `while` / `do-while` | Iteration count is not known at compile time. Use `for` with a fixed range instead. |
| Recursion | Call depth is not bounded. Use loops or repeated circuit calls with fixed unrolling. |
| `let` / `var` | Mutable state complicates circuit generation. Use `const` and shadowing. |
| `switch` / `match` | Not part of the language. Use nested `if`/`else` or the ternary conditional expression `c ? a : b`. |
| Exceptions / `try-catch` | No exception model. Use `assert(condition, "message")` to abort on invalid states. |
| `break` / `continue` | Loop bodies execute for every iteration. Structure logic with `if` inside the loop. |
