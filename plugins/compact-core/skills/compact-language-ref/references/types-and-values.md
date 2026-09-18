# Types and Values

> **Last verified:** 2026-09-18 — concrete syntax (single-quote string literals, `pad`, `Uint<0..N>`, `Maybe`/`Either` + `some`/`none`/`left`/`right`, enum `as Field`, positional/mixed/spread struct construction, generic structs, `default<T>` incl. `default<Counter>`) compile-verified against Compact compiler `0.31.1` / language `0.23` / runtime `0.16.0`.

Compact is statically and strongly typed. Every expression has a type known at compile time. The compiler rejects programs that do not type check. When type annotations are omitted, the compiler infers them.

## Primitive Types

### Field

Element of the scalar prime field of the zero-knowledge proving system. Unbounded within the field -- use for hashes, commitments, and general computation where range checks are not needed.

```compact
export ledger total: Field;

export circuit accumulate(x: Field): [] {
  total = total + disclose(x);
}
```

All `Uint` types are subtypes of `Field`, so unsigned integers widen to `Field` implicitly.

### Boolean

The type of `true` and `false`. Only two values exist.

```compact
export ledger isActive: Boolean;

export circuit deactivate(): [] {
  isActive = false;
}
```

### Bytes\<N>

Fixed-size byte array where N is the byte count. Used for addresses, hashes, and public keys.

```compact
export ledger owner: Bytes<32>;
export ledger label: Bytes<64>;
```

String literals produce `Bytes<N>` where N is the UTF-8 encoded length. Use `pad` to create a fixed-size value from a shorter string:

```compact
const tag: Bytes<8> = 'abcdefgh';
const padded: Bytes<32> = pad(32, "hello");
```

### Uint\<N> -- Sized Unsigned Integer

Unsigned integer with an N-bit binary representation. Values range from 0 to 2^N - 1.

```compact
export ledger balance: Uint<64>;
export ledger small: Uint<8>;
```

### Uint\<0..MAX> -- Bounded Unsigned Integer

Unsigned integer with values between 0 and MAX inclusive. The lower bound must be 0.

```compact
export ledger score: Uint<0..100>;
export ledger percentage: Uint<0..10000>;
```

### Uint Equivalence

`Uint<N>` and `Uint<0..MAX>` are the same type family. A sized integer is exactly equivalent to the corresponding bounded integer:

- `Uint<8>` = `Uint<0..255>` (2^8 - 1)
- `Uint<16>` = `Uint<0..65535>` (2^16 - 1)
- `Uint<32>` = `Uint<0..4294967295>` (2^32 - 1)
- `Uint<64>` = `Uint<0..18446744073709551615>` (2^64 - 1)

Any Compact program using sized integer types can be rewritten using only bounded integer types. They are interchangeable.

### Numeric Literal Typing

A numeric literal `n` has the type `Uint<0..n>`. This is the tightest bounded type for that value:

```compact
const x = 42;        // type is Uint<0..42>
const y = 255;       // type is Uint<0..255>, same as Uint<8>
const z = 0;         // type is Uint<0..0>
```

Because `Uint<0..n>` is a subtype of `Uint<0..m>` when n < m, a literal can be used wherever a wider unsigned integer is expected without an explicit cast.

### Subtyping

Compact defines subtyping rules for numeric types:

- `Uint<0..n>` is a subtype of `Uint<0..m>` when n < m (narrower fits in wider)
- `Uint<0..n>` is a subtype of `Field` for all n
- Tuple types are covariant: `[T, ...]` is a subtype of `[S, ...]` when each T is a subtype of the corresponding S

Subtyping allows implicit widening. No cast is needed when passing a value to a parameter with a supertype.

## Opaque Types

Only two opaque type tags are allowed: `"string"` and `"Uint8Array"`.

```compact
export ledger playerName: Opaque<"string">;
export ledger rawData: Opaque<"Uint8Array">;
```

Opaque values behave differently depending on context:

| Context | Behavior |
|---------|----------|
| Circuits | Represented as their hash -- content cannot be inspected |
| Witnesses | Freely manipulable as their underlying type |
| TypeScript | `string` or `Uint8Array` respectively |
| On-chain | Stored as bytes / UTF-8 (not encrypted) |

```compact
witness get_player_name(): Opaque<"string">;

export circuit register(): [] {
  // The witness returns the full string.
  // Inside the circuit the value is opaque (hash only).
  playerName = disclose(get_player_name());
}
```

No other opaque tags are supported. Attempting `Opaque<"number">` or any other tag is a compile error.

## Collection Types

### Vector\<N, T>

Fixed-size array of N elements of type T. `Vector<N, T>` is shorthand for the tuple type `[T, T, ..., T]` with N occurrences -- they are exactly the same type.

```compact
const pair: Vector<2, Field> = [10, 20];
const triple: Vector<3, Bytes<32>> = [
  pad(32, "a"),
  pad(32, "b"),
  pad(32, "c")
];
```

Access elements by numeric literal index (zero-based):

```compact
const first = pair[0];    // 10
const second = pair[1];   // 20
```

The index must be a numeric literal, not a variable.

### Maybe\<T>

Optional value -- either contains a value or is empty.

```compact
const present: Maybe<Field> = some<Field>(42);
const absent: Maybe<Field> = none<Field>();
```

Inspect with `.is_some` and access the inner value with `.value`:

```compact
witness find_user(id: Bytes<32>): Maybe<Bytes<32>>;

export circuit lookup(id: Bytes<32>): Bytes<32> {
  const result = find_user(id);
  assert(disclose(result.is_some), "User not found");
  return disclose(result.value);
}
```

### Either\<L, R>

Sum type -- holds either a left value or a right value.

```compact
const success: Either<Field, Bytes<32>> = left<Field, Bytes<32>>(42);
const failure: Either<Field, Bytes<32>> = right<Field, Bytes<32>>(
  pad(32, "error")
);
```

Inspect with `.is_left` and access the appropriate side:

```compact
witness try_operation(): Either<Uint<64>, Bytes<32>>;

export circuit attempt(): Uint<64> {
  const result = try_operation();
  assert(disclose(result.is_left), "Operation failed");
  return disclose(result.left);
}
```

Access `.right` when `.is_left` is `false`:

```compact
if (result.is_left) {
  const value = result.left;
} else {
  const err = result.right;
}
```

## Custom Types

### Enumerations

Define a type with a fixed set of named values. Export the enum to make it accessible from TypeScript:

```compact
export enum GameState { waiting, playing, finished }
export enum Choice { rock, paper, scissors }
```

Access variants with dot notation (not Rust-style `::` syntax):

```compact
export ledger state: GameState;

export circuit start(): [] {
  assert(state == GameState.waiting, "Game already started");
  state = GameState.playing;
}
```

Cast an enum value to `Field` to get its variant index:

```compact
const index: Field = Choice.rock as Field;   // 0
```

### Structures

Define compound types with named fields. Field separators can be commas or semicolons (but not mixed):

```compact
export struct Player {
  addr: Bytes<32>,
  score: Uint<64>,
  active: Boolean,
}

struct Pair<T> {
  first: T;
  second: T
}
```

#### Named-field construction

Provide field values by name in any order:

```compact
const p = Player { score: 100, addr: pad(32, "alice"), active: true };
```

#### Positional construction

Provide values in declaration order:

```compact
const p = Player { pad(32, "alice"), 100, true };
```

Positional and named values can be mixed, but all positional values must come first:

```compact
const p = Player { pad(32, "alice"), score: 100, active: true };
```

#### Spread syntax

Copy fields from an existing struct and override specific ones:

```compact
const p2 = Player { ...p, score: 200 };
// p2 has p.addr and p.active, but score is 200
```

When using spread, it must be the first specifier and all other specifiers must be named.

#### Field access

Read struct fields with dot notation:

```compact
const s = p.score;
const a = p.active;
```

### Tuples

Create tuple values with bracket syntax. Tuples are heterogeneous -- elements can have different types:

```compact
const pair: [Field, Boolean] = [42, true];
const triple = [10, 20, 30];    // type: [Uint<0..10>, Uint<0..20>, Uint<0..30>]
const empty: [] = [];
```

Access elements by numeric literal index:

```compact
const first = pair[0];     // 42 : Field
const second = pair[1];    // true : Boolean
```

The empty tuple `[]` is Compact's unit type, used as the return type for circuits that return nothing.

## Default Values

Every Compact type has a default value, obtained with the `default<T>` expression:

```compact
const d1 = default<Boolean>;       // false
const d2 = default<Uint<64>>;      // 0
const d3 = default<Field>;         // 0
const d4 = default<Bytes<32>>;     // all-zero byte array
```

Default values by type:

| Type | Default Value |
|------|---------------|
| `Boolean` | `false` |
| `Uint<N>` / `Uint<0..n>` | `0` |
| `Field` | `0` |
| `Bytes<N>` | All-zero byte array of length N |
| `Opaque<"string">` | Empty string `""` |
| `Opaque<"Uint8Array">` | Zero-length `Uint8Array` |
| `[T, ...]` (tuples/vectors) | Tuple of default values of each element type |
| Struct types | All fields set to their default values |
| Enum types | The first variant in the declaration |

```compact
export enum Status { pending, approved, rejected }

const s = default<Status>;         // Status.pending (first variant)

export struct Config {
  limit: Uint<64>,
  enabled: Boolean,
}

const c = default<Config>;         // Config { limit: 0, enabled: false }
```

Default values are also used when initializing ledger state. The `default<T>` expression works with ledger state types as well:

```compact
const d = default<Counter>;        // Counter at 0
```

## TypeScript Representations

When types cross the boundary between Compact and TypeScript, they are mapped as follows:

| Compact Type | TypeScript Type |
|-------------|-----------------|
| `Boolean` | `boolean` |
| `Field` | `bigint` (with runtime bounds checks) |
| `Uint<N>` / `Uint<0..n>` | `bigint` (with runtime bounds checks) |
| `Bytes<N>` | `Uint8Array` (with runtime length checks) |
| `Opaque<"string">` | `string` |
| `Opaque<"Uint8Array">` | `Uint8Array` |
| `[T, ...]` tuples | TypeScript tuple or array with runtime length checks |
| Enum instances | `number` (with runtime membership checks) |
| Struct instances | Object with corresponding field types |
