# Compact Contract Runtime

Reference for the compiler-generated Contract class, circuit interfaces, and the ledger function. For witness implementation details, see `references/witness-implementation.md`. For type mappings, see `references/type-mappings.md`.

## Compiler-Generated .d.ts Structure

Every compiled Compact contract produces a `.d.ts` file with this structure:

```typescript
import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

// 1. Exported types (enums, structs, Maybe, etc.)
export type Maybe<a> = { is_some: boolean; value: a };

// 2. Witnesses interface
export interface Witnesses<PS> {
  myWitness(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

// 3. Circuits type. Each circuit takes a CircuitContext first and, on the
// ledger 9 runtimes (compiler 0.34+, compact-runtime 0.19+), returns a Promise.
export type Circuits<PS> = {
  myCircuit(context: __compactRuntime.CircuitContext<PS>,
            arg: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  pureCompute(context: __compactRuntime.CircuitContext<PS>,
              x: bigint, y: bigint): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
};

// 4. Contract class
export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): Promise<__compactRuntime.ConstructorResult<PS>>;
}

// 5. Ledger type and function
export type Ledger = {
  readonly myField: bigint;
  readonly owner: Uint8Array;
};

export declare function ledger(state: __compactRuntime.StateValue): Ledger;
```

## The Contract Class

### Instantiation

Create a contract instance by passing your witnesses object:

```typescript
import { MyContract } from "@midnight-ntwrk/mycontract-contract";
import { witnesses } from "./witnesses.js";

const contractInstance = new MyContract.Contract(witnesses);
```

> **Import styles:** Both named imports (`import { Contract } from "..."`) and namespace imports (`import * as MyContract from "..."`) work. Named imports are more common in Midnight examples.

The `Witnesses` interface type-checks your implementations at compile time — if your witness functions have wrong signatures, TypeScript reports the error.

### Constructor Arguments

The generated `Contract` class only takes witnesses. If the Compact contract has a `constructor(arg1: T1, arg2: T2)`, its arguments go to `initialState`, after the context (checked on compiler 0.36.0):

```typescript
// Compact: constructor(value: Uint<64>)
const instance = new MyContract.Contract(witnesses);
const { currentContractState } = await instance.initialState(constructorContext, 42n);

// Compact: constructor() — no args
const result = await instance.initialState(constructorContext);
```

When deploying through midnight-js, pass them as `args` instead (see below).

## Circuits vs ImpureCircuits vs PureCircuits

The Contract class exposes three circuit interfaces:

| Interface | Contains | Proof Generated? | Modifies State? |
|-----------|----------|-------------------|-----------------|
| `circuits` | All circuits | Yes (for impure) | Impure: yes, Pure: no |
| `impureCircuits` | Only circuits that touch state/witnesses | Yes | Yes |
| `pureCircuits` (module-level export) | Only `pure circuit` declarations | **No** | **No** |

### impureCircuits

Circuits that read/write ledger state or call witnesses. These generate ZK proofs and create transactions:

```compact
// Compact
export circuit increment(): [] {
  round.increment(1);
}
```

```typescript
// TypeScript — called through the DApp's transaction layer
// (via deployContract/findDeployedContract, not directly)
const result = await deployedContract.callTx.increment();
```

### pureCircuits

Circuits marked `pure` in Compact run locally without generating proofs. `pureCircuits` is a **module-level const export** from the generated contract package, not a property of the Contract class:

```compact
// Compact
export pure circuit computeHash(data: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "prefix:"), data]);
}
```

```typescript
// TypeScript — module-level import, synchronous, local computation
import { pureCircuits } from "./managed/mycontract/contract/index.js";
const hash: Uint8Array = pureCircuits.computeHash(myData);
```

Pure circuits are useful for:
- Computing values locally that witnesses need to provide
- Hashing data in the same way the contract does (e.g., computing a public key hash)
- Validating inputs before submitting a transaction

## The ledger() Function

The compiler generates a `ledger()` function that parses raw on-chain contract state into typed TypeScript objects:

```typescript
import { MyContract } from "@midnight-ntwrk/mycontract-contract";

// Parse a runtime ContractState (or its StateValue) into a typed ledger object
const state = MyContract.ledger(contractState.data);

// Access typed fields
const round: bigint = state.round;           // Counter -> bigint
const owner: Uint8Array = state.owner;        // Bytes<32> -> Uint8Array
const message = state.message;                // Maybe<Opaque<"string">>
```

Only `export ledger` fields are accessible through the `ledger()` function. Non-exported ledger fields are not visible.

### Querying Ledger State

In a DApp context, you typically query the indexer for contract state, then parse it:

```typescript
// midnight-js 5: the result carries a serialized state tagged with its ledger era
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";

const read = await providers.publicDataProvider.queryContractState(contractAddress);

if (read != null && read.contractState.era === "v9") {
  const ledgerState = MyContract.ledger(read.contractState.deserialize({ v9: ContractState }).data);
  console.log(`Current round: ${ledgerState.round}`);
}
```

## Private State ID

When deploying or joining a contract, you provide a string identifier for the private state store. This lets the runtime persist and retrieve private state across sessions:

```typescript
// Build a CompiledContract with CompiledContract.make + .pipe (midnight-js 5 / compact-js 3)
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-js";
import { MyContract } from "@midnight-ntwrk/mycontract-contract";

const compiledContract = CompiledContract.make('mycontract', MyContract.Contract).pipe(
  // Attach witness implementations (or CompiledContract.withVacantWitnesses if none)
  CompiledContract.withWitnesses(witnesses),
  // Point at the generated ZK assets (the compiler `managed/<name>` output)
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

// Deploying — pass `args` (the constructor's InitializeParameters) when the Compact
// constructor takes parameters, e.g. `args: [42n]`. For a no-argument constructor
// `args` is optional and can be omitted (the option type makes it required only when
// the constructor has parameters).
const deployed = await deployContract(providers, {
  compiledContract: compiledContract,
  privateStateId: 'myContractPrivateState',
  initialPrivateState: createMyPrivateState(secretKey),
});

// Joining an existing deployment
const found = await findDeployedContract(providers, {
  compiledContract: compiledContract,
  contractAddress: address,
  privateStateId: 'myContractPrivateState',
  initialPrivateState: createMyPrivateState(secretKey),
});
```

> `CompiledContract` is a module exposing the factory `make(tag, Contract)` plus pipeable combinators (`withWitnesses` / `withVacantWitnesses`, `withCompiledFileAssets`). It is **not** a constructable class — `new CompiledContract(...)` is not valid.

The `privateStateId` is a string key used by the private state provider to store and retrieve state. Use a descriptive, unique name per contract type.

## Re-Export Pattern

The standard pattern for a contract package is an `index.ts` that re-exports both the generated code and your witness implementations:

```typescript
// contract/src/index.ts
export * from "./managed/mycontract/contract/index.js";
export * from "./witnesses.js";

// Optional: re-export for convenient access
import * as CompiledContract from "./managed/mycontract/contract/index.js";
export { CompiledContract };
```

This provides a single import point for consuming applications:

```typescript
// In your DApp
import { Contract, Ledger, witnesses, createMyPrivateState } from "@midnight-ntwrk/mycontract-contract";
```

## Common Mistakes

| Mistake | Correct | Why |
|---------|---------|-----|
| Calling `impureCircuits` directly | Use `deployedContract.callTx.circuitName()` | Impure circuits need the full transaction pipeline |
| Using `pureCircuits` for state-changing logic | The `pure` modifier signals no side effects; the compiler's `identify-pure-circuits` pass flags ledger access and witness calls in pure circuits | Use impure circuits for state changes |
| Forgetting to export ledger fields in Compact | `export ledger myField: Type;` | Non-exported fields aren't in the `ledger()` output |
| Importing from wrong path | `./managed/<name>/contract/index.js` | Path includes the contract name subdirectory |
| Mixing up `.js` and `.cjs` imports | Check your package `type` field | `"type": "module"` uses `.js`, CommonJS uses `.cjs` |
