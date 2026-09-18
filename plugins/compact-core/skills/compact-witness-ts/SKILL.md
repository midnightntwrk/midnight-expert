---
name: compact-core:compact-witness-ts
description: This skill should be used when the user asks about implementing Compact witness functions in TypeScript, the WitnessContext pattern, private state management, Compact-to-TypeScript type mappings (Field to bigint, Bytes to Uint8Array, Uint to bigint), compiler-generated .d.ts files (Witnesses interface, Circuits type, Contract class), the Compact JavaScript runtime, how contract.circuits works, pure circuits in TypeScript, reading ledger state from TypeScript, the witness return tuple pattern [PrivateState, ReturnValue], or how to connect a Compact contract to its TypeScript implementation.
version: 0.1.0
---

# TypeScript Witness Implementation & Contract Runtime

> **Last verified:** 2026-09-18 — Compact→TypeScript type mappings verified by compiling with `0.31.1` / language `0.23` / runtime `0.16.0` and inspecting the generated `index.d.ts` (struct, generic-`#n`-dropped, and `Maybe` shapes confirmed; **enum representation corrected** — the compiler emits a TS `enum`, not a `const … as const` object).

This skill covers the TypeScript half of every Compact contract: implementing witnesses, understanding compiler-generated types, and using the Contract runtime. For Compact witness declarations and disclosure rules, see `compact-structure`. For privacy patterns using witnesses, see `compact-privacy-disclosure`. For standard library functions referenced in witnesses, see `compact-standard-library`.

## Compiler Output

Running `compact compile src/mycontract.compact src/managed/mycontract` produces a `managed/` directory containing the generated TypeScript API:

```
src/managed/mycontract/
├── contract/
│   ├── index.js        # Runtime implementation
│   ├── index.js.map    # Source map
│   └── index.d.ts      # Type declarations
├── compiler/           # Compiler metadata
├── keys/               # ZK proving/verifying keys
└── zkir/               # ZK intermediate representation (.bzkir files)
```

Key exports from `contract/index.js`:

```typescript
import { Ledger, Witnesses, ImpureCircuits, Circuits, Contract, pureCircuits } from "./managed/mycontract/contract/index.js";
```

- **`Ledger`** — TypeScript type matching the contract's ledger declarations
- **`Witnesses`** — Interface defining required witness implementations
- **`ImpureCircuits`** — Type describing circuit functions that require witnesses (parameterized by private state `PS`)
- **`Circuits`** — Type describing available circuit functions
- **`Contract`** — Class that binds witnesses to circuits
- **`pureCircuits`** — Module-level const export for local-only pure circuit calls (no proof generated)
- **`ledger()`** — Function to parse on-chain state into typed objects

## Type Mapping Quick Reference

| Compact Type | TypeScript Type | Notes |
|---|---|---|
| `Field` | `bigint` | Runtime bounds checked (max field value) |
| `Uint<N>` / `Uint<0..N>` | `bigint` | Runtime bounds checked |
| `Boolean` | `boolean` | |
| `Bytes<N>` | `Uint8Array` | Runtime length checked (N bytes) |
| `Opaque<"string">` | `string` | Pass-through |
| `Opaque<"Uint8Array">` | `Uint8Array` | Pass-through |
| `enum` variants | `number` | Runtime membership checked |
| `struct { a: A, b: B }` | `{ a: A, b: B }` | Plain object |
| `Vector<N, T>` / tuples | `T[]` | Runtime length checked |
| `Maybe<T>` | `{ is_some: boolean; value: T }` | Must export from Compact to use type |
| `Either<L, R>` | `{ is_left: boolean; left: L; right: R }` | Flat object with discriminator |
| `Counter` | `bigint` | Via `ledger()` |
| `Map<K, V>` | Custom accessor object | Via `ledger()`; has `member()`, `size()`, `isEmpty()`, `Symbol.iterator` |
| `Set<T>` | Custom accessor object | Via `ledger()`; has `member()`, `size()`, `isEmpty()`, `Symbol.iterator` |
| `MerkleTreePath<value_type>` | Nested structure | Array of sibling hashes + directions |

For complete type mapping details, runtime validation, and casting rules, see `references/type-mappings.md`.

## Witness Implementation Pattern

Every witness function follows the same pattern:

```typescript
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { Ledger } from "./managed/mycontract/contract/index.js";

// 1. Define private state type
type MyPrivateState = {
  readonly secretKey: Uint8Array;
};

// 2. Create factory function
const createMyPrivateState = (secretKey: Uint8Array): MyPrivateState => ({
  secretKey,
});

// 3. Implement witnesses object — keys must match Compact witness names exactly
export const witnesses = {
  local_secret_key: ({
    privateState,
  }: WitnessContext<Ledger, MyPrivateState>): [MyPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
};
```

**Key rules:**
- First parameter is always `WitnessContext<Ledger, PrivateState>`
- Return type is always `[PrivateState, ReturnValue]` — a tuple of updated private state and the declared return value
- Object keys in `witnesses` must match Compact witness function names exactly
- Additional parameters (after WitnessContext) match the Compact witness declaration parameters

For WitnessContext API details, common patterns, and state management, see `references/witness-implementation.md`.

## Private State Design

Private state holds off-chain data that witnesses access. It persists across circuit calls within a session:

```typescript
// Simple: single secret key
type SimpleState = { readonly secretKey: Uint8Array };

// Complex: multiple values, per-contract scoping
type ComplexState = {
  readonly secretKey: Uint8Array;
  readonly localData: Map<string, string[]>;
};
```

To mutate private state, return a new object in the witness tuple:

```typescript
store_data: (
  { privateState, contractAddress }: WitnessContext<Ledger, ComplexState>,
  data: bigint[],
): [ComplexState, Uint8Array] => {
  const updatedData = new Map(privateState.localData);
  updatedData.set(contractAddress, data.map(String));
  return [
    { ...privateState, localData: updatedData },
    someComputedValue,
  ];
},
```

## Contract Class Usage

The compiler-generated `Contract` class binds witnesses to circuits:

```typescript
import { Contract, pureCircuits, ledger } from "./managed/mycontract/contract/index.js";

// Local testing only — instantiate Contract directly with witnesses
const contractInstance = new Contract(witnesses);

// Production — use CompiledContract.make() from @midnight-ntwrk/compact-js.
// make() takes a tag and the Contract CLASS (not an instance); attach witnesses
// and ZK assets via .pipe(). It is synchronous — do NOT `await` it.
import { CompiledContract } from "@midnight-ntwrk/compact-js";
const compiledContract = CompiledContract.make("mycontract", Contract).pipe(
  // Attach witness implementations (or CompiledContract.withVacantWitnesses if the
  // contract declares no witnesses — note: it is a value used bare in .pipe(...), NOT called as withVacantWitnesses())
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

// Pure circuits — module-level export, local computation, no proof, no transaction
const hash = pureCircuits.computeHash(inputData);

// Read ledger state from on-chain data
const ledgerState = ledger(contractStateData);
const currentValue = ledgerState.myField;
```

For Contract class details, circuits vs impureCircuits, and the ledger function, see `references/contract-runtime.md`.

## Reference Files

| Topic | Reference File |
|-------|---------------|
| Complete type mapping table, CompactType\<T\>, runtime validation, casting rules | `references/type-mappings.md` |
| WitnessContext API, return tuples, common patterns, state transitions | `references/witness-implementation.md` |
| Contract class, circuits vs impureCircuits, pureCircuits, ledger() | `references/contract-runtime.md` |

## Verification

Witness implementations can be mechanically verified against their contract declarations:

```bash
/midnight-verify:verify <contract.compact> <witnesses.ts>
```

This verifies:
- **Type correctness** — the witness TypeScript type-checks against the compiled contract's generated `Witnesses` type
- **Structural patterns** — name matching (exact casing), return tuple shape (`[PrivateState, ReturnValue]`), WitnessContext first parameter, private state immutability, no side effects
- **Behavioral correctness** — the contract executes successfully with the witness implementation

Strongly recommend running `/midnight-verify:verify` after writing or modifying any witness implementation. Do not consider a witness implementation complete until verification passes.
