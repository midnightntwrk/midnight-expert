# Modules and Imports

Compact organizes code through pragmas, include files, modules, imports, and top-level exports. These mechanisms control language version compatibility, code reuse, namespace isolation, and the public API surface of a contract.

## Pragma

Every Compact source file should begin with a pragma declaring the language version it targets. The pragma must be the first statement in the file (after any comments).

```compact
pragma language_version 0.23;
```

> **Tip:** Run `compact compile --language-version` to find the language version supported by your installed compiler. Use that version in your pragma declaration.

Pin the specific language version you verified against (e.g. `0.23`). An open-ended lower bound like `>= 0.22` silently accepts future compiler versions the contract was never tested against.

Common mistakes:

| Wrong | Correct |
|-------|---------|
| `pragma language_version >= 0.22;` | `pragma language_version 0.23;` |

## Include Files

The `include` statement inserts the contents of another file verbatim at the point where it appears. It can be used at the top level of a source file or within a module body.

```compact
include "path/to/file";
```

When the compiler encounters an include, it searches for `path/to/file.compact` first in the current directory, then relative to each directory listed in the `:`-separated environment variable `COMPACT_PATH`. The file must be found or compilation fails. The `.compact` extension is appended automatically -- do not include it in the path.

Because the content is inserted verbatim, there is no namespace isolation. All identifiers from the included file enter the current scope directly. This makes `include` suitable for splitting a single contract across multiple files, but not for building reusable libraries where name collisions are a concern.

```compact
// In a module body
module Helpers {
  include './helper_circuits';
}
```

## Modules

A module groups definitions into a namespace. Identifiers defined inside a module are private by default -- they are visible only within the module unless explicitly exported.

```compact
module Auth {
  export circuit verify_owner(sk: Bytes<32>, owner: Bytes<32>): Boolean {
    const pk = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:pk:"), sk]);
    return pk == owner;
  }

  // not exported -- internal helper only
  circuit hash_key(sk: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:pk:"), sk]);
  }
}
```

### Generic Modules

Modules can accept generic type parameters. These are specialized when the module is imported.

```compact
module Identity<T> {
  export circuit id(x: T): T {
    return x;
  }
}
```

### Exporting from Modules

There are two ways to export identifiers from a module:

**Prefix the definition with `export`:**

```compact
module M {
  export struct Point { x: Field, y: Field }
  export circuit origin(): Point {
    return Point { x: 0, y: 0 };
  }
}
```

**Use a separate `export` declaration listing names:**

```compact
module M {
  struct Point { x: Field, y: Field }
  circuit origin(): Point {
    return Point { x: 0, y: 0 };
  }
  export { Point, origin };
}
```

Both forms can be combined in the same module. Only identifiers defined at or imported into the top level of the module can be exported.

## Imports

Importing a module brings its exported identifiers into the current scope. Compact supports several import forms.

### Standard Library Import

```compact
import CompactStandardLibrary;
```

This brings all standard library types and circuits into scope, including `Counter`, `Map`, `Set`, `MerkleTree`, `Maybe`, `Either`, `ShieldedCoinInfo`, `QualifiedShieldedCoinInfo`, and standard utility circuits.

### Module Import

Import a module defined in the same file:

```compact
module Runner {
  export circuit run(): [] {}
}

import Runner;
// run is now in scope
```

### Prefixed Import

Add a prefix to all imported names to avoid collisions:

```compact
import Runner prefix Run_;
// Run_run is now in scope
```

The prefix is prepended directly to each exported name. Choose prefixes that produce readable combined identifiers.

### Selective Import

Import specific identifiers from a module, optionally renaming them:

```compact
module Test {
  export circuit test(v: Field): Field {
    return v;
  }
}

import { test as t } from Test;
// t is now in scope, referring to Test's test circuit
```

Selective imports can also be combined with a prefix:

```compact
import { test as t } from Test prefix T$;
// T$t is now in scope
```

### Generic Module Import

Specialize a generic module by providing type arguments:

```compact
module Identity<T> {
  export circuit id(x: T): T {
    return x;
  }
}

import Identity<Field>;
// id is now in scope, specialized for Field
```

Generic imports with a prefix:

```compact
import M<5, Opaque<"string">> prefix M$;
// M$slicer and other exports are available with the M$ prefix
```

### Path-Based Import

Import a module defined in a separate file by providing a string path. The compiler searches for the file in the current directory first, then in `COMPACT_PATH` directories:

```compact
import "utils/Auth";
// looks for utils/Auth.compact containing a single module definition
```

Path imports also support prefixes:

```compact
import "A/M" prefix A_;
// A_F and other exports are available with the A_ prefix
```

When a module is defined in a separate file, that file must contain only a single top-level module definition. If the file contains additional top-level definitions outside the module, the compiler raises a static error.

### Import with Path vs. Module Name

When both a local module definition and a file-based module exist with the same name, `import ModName;` uses the local definition. To force loading from the file system, use the string path form `import "ModName";`:

```compact
module M {
  export circuit G(): [] {}
}

import "M" prefix $;
// $F comes from M.compact on disk, not the local module M above
```

## Top-Level Exports

Identifiers exported at the top level of the main contract file define the public API of the contract. These become accessible from TypeScript DApp code.

### Exporting Circuits

Top-level exported circuits are the entry points callable from outside the contract. They may not take generic arguments, and it is a static error if more than one circuit with the same name is exported from the top level.

```compact
export circuit increment(): [] {
  counter.increment(1);
}

export circuit getCount(): Uint<64> {
  return counter.read();
}
```

### Exporting Types

User-defined types exported from the top level can describe argument and return types of witnesses and exported circuits. These are translated to TypeScript types in the generated code.

```compact
export enum GameState { waiting, playing, finished }
export struct Player { addr: Bytes<32>, score: Uint<64> }
```

### Exporting Ledger Fields

Exported ledger fields are visible for direct inspection via the generated TypeScript `ledger()` function:

```compact
export ledger counter: Counter;
export ledger owner: Bytes<32>;
```

### Re-Exporting Imported Names

Names imported from modules or the standard library can be re-exported so they are available in the TypeScript API:

```compact
export { Maybe, Either, ShieldedCoinInfo };
```

## File Organization Patterns

### Single File

For small contracts, keep everything in one file. This is the simplest approach:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger counter: Counter;
export circuit increment(): [] { counter.increment(1); }
```

### Include for Large Contracts

Use `include` to split a large contract across multiple files while keeping a flat namespace. This works well when there is no risk of name collisions:

```
project/
  main.compact          -- pragma, imports, includes
  types.compact         -- struct and enum definitions
  witnesses.compact     -- witness declarations
  circuits.compact      -- circuit implementations
```

```compact
// main.compact
pragma language_version 0.23;
import CompactStandardLibrary;

include "types";
include "witnesses";

export ledger counter: Counter;

include "circuits";
```

### Modules for Reusable Libraries

Use modules when building reusable library code that needs namespace isolation. Each module file contains a single module definition and can be imported by multiple contracts:

```compact
// Auth.compact
module Auth {
  export circuit verify(sk: Bytes<32>, expected: Bytes<32>): Boolean {
    const pk = persistentHash<Vector<2, Bytes<32>>>([pad(32, "myapp:pk:"), sk]);
    return pk == expected;
  }
}
```

```compact
// main.compact
pragma language_version 0.23;
import CompactStandardLibrary;
import "Auth" prefix Auth_;

export ledger owner: Bytes<32>;

witness local_secret_key(): Bytes<32>;

export circuit protected_action(): [] {
  const sk = local_secret_key();
  assert(disclose(Auth_verify(sk, owner)), "Not authorized");
}
```

Modules provide true namespace isolation, making them the preferred mechanism for shared code where name collisions must be avoided.
