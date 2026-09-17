# Simulator API Reference

> **Last verified:** 2026-09-17 — package/import corrected to `@openzeppelin/compact-simulator@0.3.1` (verified on npm to export `createSimulator`). The individual API method signatures documented below were not exhaustively re-tested this pass.

## Overview

The `@openzeppelin/compact-simulator` framework eliminates manual `CircuitContext` threading when testing Compact contracts. Instead of constructing `CircuitContext` objects, passing them into every circuit call, and updating state after each impure call, the simulator handles all of this automatically. You write tests that look like method calls on a contract object.

The framework centers on `createSimulator()`, a factory that produces a base class you extend with your own domain-specific methods.

## `createSimulator()` Configuration

`createSimulator()` accepts a `SimulatorConfig` object with five fields:

```typescript
import { createSimulator } from '@openzeppelin/compact-simulator';

const MySimulatorBase = createSimulator<
  PrivateState,                    // P  - private state type
  ReturnType<typeof ledger>,       // L  - ledger state type
  ReturnType<typeof MyWitnesses>,  // W  - witnesses type
  MyContract<PrivateState>,        // TContract - compiled contract class
  MyArgs                           // TArgs - constructor arg tuple
>({
  contractFactory: (witnesses) => new MyContract<PrivateState>(witnesses),
  defaultPrivateState: () => MyPrivateState,
  contractArgs: (owner, isInit) => [owner, isInit],
  ledgerExtractor: (state) => ledger(state),
  witnessesFactory: () => MyWitnesses(),
});
```

### `contractFactory: (witnesses: W) => TContract`

Factory function that creates a compiled contract instance. Must be a factory (not a pre-built value) because witness swapping recreates the contract instance via `config.contractFactory(this._witnesses)`. Every time witnesses are replaced, the contract is rebuilt so circuit proxies pick up the new witness functions.

### `defaultPrivateState: () => P`

Factory function returning the initial private state. Called when no `privateState` option is provided to the constructor. For contracts with no private state, return an empty object: `() => ({})`. For contracts with secrets (like ZK nonces), return a generated state: `() => ZOwnablePKPrivateState.generate()`.

### `contractArgs: (...args: TArgs) => any[]`

Maps the contract-specific constructor arguments into the raw array that `CircuitContextManager` passes to `contract.initialState()` after the standard parameters (contract, privateState, coinPK, contractAddress).

```typescript
// Contract with owner and salt arguments:
contractArgs: (owner, instanceSalt) => [owner, instanceSalt]

// Contract with no additional arguments:
contractArgs: () => []
```

### `ledgerExtractor: (state: StateValue) => L`

Decodes the raw `StateValue` into a typed ledger object. Always use the generated `ledger()` function from the contract artifacts:

```typescript
ledgerExtractor: (state) => ledger(state)
```

### `witnessesFactory: () => W`

Factory function creating default witness implementations. Called when no `witnesses` option is provided. Must be a factory so each simulator instance gets its own witness object:

```typescript
witnessesFactory: () => ZOwnablePKWitnesses()
```

## Constructor Options (`BaseSimulatorOptions`)

When instantiating a simulator, every field is optional:

```typescript
type BaseSimulatorOptions<P, W> = {
  privateState?: P;           // Initial private state (uses defaultPrivateState() if omitted)
  witnesses?: W;              // Witness functions (uses witnessesFactory() if omitted)
  coinPK?: CoinPublicKey;     // Caller's coin public key (default: '0'.repeat(64))
  contractAddress?: ContractAddress;  // Deployment address (default: dummyContractAddress())
};
```

The generated constructor signature is:

```typescript
constructor(
  contractArgs: TArgs = [] as any,
  options: BaseSimulatorOptions<P, W> = {},
)
```

When extending, you typically reshape this to accept domain-specific arguments:

```typescript
class OwnableSimulator extends OwnableSimulatorBase {
  constructor(
    initialOwner: Either<ZswapCoinPublicKey, ContractAddress>,
    isInit: boolean,
    options: BaseSimulatorOptions<OwnablePrivateState, ReturnType<typeof OwnableWitnesses>> = {},
  ) {
    super([initialOwner, isInit], options);
  }
}
```

## Circuit Access

The simulator exposes circuits through two proxies:

### `simulator.circuits.pure.<name>(args)`

Pure circuits do **not** modify contract state. The proxy injects the current `CircuitContext` automatically, calls the circuit, and returns only the `result`. The context is **not** updated afterward.

### `simulator.circuits.impure.<name>(args)`

Impure circuits **do** modify contract state. The proxy injects a caller-aware context (respecting `.as()` and `setPersistentCaller()`), calls the circuit, extracts the `result`, and **persists the new context** (including updated ledger state and private state) back into the simulator.

Both proxies are created lazily on first access and cached. If witnesses are replaced, the proxies are reset so they pick up the new contract instance.

```typescript
// Pure circuit call -- reads state, no side effects
const ownerId = simulator.circuits.pure._computeOwnerId(pk, nonce);

// Impure circuit call -- mutates state
simulator.circuits.impure.transferOwnership(newOwner);
```

In practice, simulator subclasses expose convenience methods that delegate to these proxies:

```typescript
public owner(): Either<ZswapCoinPublicKey, ContractAddress> {
  return this.circuits.impure.owner();
}

public transferOwnership(newOwner: Either<ZswapCoinPublicKey, ContractAddress>) {
  this.circuits.impure.transferOwnership(newOwner);
}
```

## Caller Simulation

Three methods control which public key the contract sees as the caller:

### `.as(hexPubKey)` -- single-use

Sets the caller for the **next circuit call only**, then auto-resets to `null`. Returns `this` for chaining:

```typescript
simulator.as(OWNER).transferOwnership(newOwner);
// Next call uses default caller again
```

### `setPersistentCaller(hexPubKey)` -- sticky

Sets a persistent caller for **all subsequent calls** until explicitly cleared:

```typescript
simulator.setPersistentCaller(OWNER);
simulator.assertOnlyOwner();  // uses OWNER
simulator.transferOwnership(newOwner);  // still uses OWNER
```

### `resetCaller()` -- clear all

Clears both single-use and persistent caller overrides. Returns `this` for chaining:

```typescript
simulator.resetCaller();
```

### Priority order

When resolving the active caller, the simulator checks in this order:

1. `callerOverride` (single-use, set by `.as()`) -- highest priority
2. `persistentCallerOverride` (set by `setPersistentCaller()`)
3. Default caller context (the `coinPK` from construction)

The effective caller is computed in `getCallerContext()`:

```typescript
const activeCaller = this.callerOverride || this.persistentCallerOverride;
```

If either override is set, `emptyZswapLocalState(activeCaller)` replaces the zswap local state in the context.

## State Access

### `getPublicState(): L`

Returns the current public ledger state, decoded through the `ledgerExtractor`:

```typescript
const state = simulator.getPublicState();
expect(state.ZOwnablePK__counter).toEqual(1n);
```

### `getPrivateState(): P`

Returns the current private state from the circuit context:

```typescript
const ps = simulator.getPrivateState();
expect(ps.secretNonce).toBeDefined();
```

### `getContractState(): StateValue`

Returns the raw `StateValue` without decoding. Useful when you need the unprocessed state.

### `contractAddress: string`

The deployed contract address, either from `dummyContractAddress()` or the value passed in `options.contractAddress`.

## Witness Management

### `overrideWitness(key, fn)` -- replace one witness

Replaces a single witness function while keeping all others unchanged. Triggers a contract rebuild and circuit proxy reset:

```typescript
simulator.overrideWitness('wit_secretNonce', (ctx) => {
  return [ctx.privateState, MALICIOUS_NONCE];
});
```

Under the hood, this spreads the existing witnesses and overwrites the specified key:

```typescript
this.witnesses = {
  ...this._witnesses,
  [key]: fn,
} as W;
```

### `simulator.witnesses = newWitnesses` -- replace all

Replaces the entire witness object, rebuilds the contract, and resets circuit proxies:

```typescript
const maliciousWitnesses = (): IWitnessWitnesses<WitnessPrivateState> => ({
  wit_secretBytes(ctx) { return [ctx.privateState, BYTES_OVERRIDE]; },
  wit_secretFieldPlusArg(ctx) { return [ctx.privateState, FIELD_OVERRIDE]; },
  wit_secretUintPlusArgs(ctx) { return [ctx.privateState, UINT_OVERRIDE]; },
});

simulator.witnesses = maliciousWitnesses();
```

Both approaches trigger `resetCircuitProxies()`, which invalidates the cached pure and impure proxies so the next access rebuilds them with the new contract instance.

### `getWitnessContext(): WitnessContext<L, P>`

Returns the current witness context with the structure expected by witness functions:

```typescript
{
  ledger: L,           // decoded public state
  privateState: P,     // current private state
  contractAddress: string
}
```

## Private State Injection

### `circuitContextManager.updatePrivateState(newState)`

Replaces just the private state inside the existing context without resetting any other state:

```typescript
const currentState = simulator.circuitContextManager.getContext().currentPrivateState;
const updatedState = { ...currentState, secretNonce: newNonce };
simulator.circuitContextManager.updatePrivateState(updatedState);
```

This is used in ZOwnablePK-style simulators to inject a new secret nonce mid-test:

```typescript
public readonly privateState = {
  injectSecretNonce: (newNonce: Buffer): ZOwnablePKPrivateState => {
    const currentState = this.circuitContextManager.getContext().currentPrivateState;
    const updatedState = { ...currentState, secretNonce: newNonce };
    this.circuitContextManager.updatePrivateState(updatedState);
    return updatedState;
  },
  getCurrentSecretNonce: (): Uint8Array => {
    return this.circuitContextManager.getContext().currentPrivateState.secretNonce;
  },
};
```

## Building a Simulator Class

Complete example extending `createSimulator()` output for an `Ownable` contract:

```typescript
import {
  type BaseSimulatorOptions,
  createSimulator,
} from '@openzeppelin/compact-simulator';
import {
  type ContractAddress,
  type Either,
  ledger,
  Contract as MockOwnable,
  type ZswapCoinPublicKey,
} from '../../../../artifacts/MockOwnable/contract/index.js';
import {
  OwnablePrivateState,
  OwnableWitnesses,
} from '../../witnesses/OwnableWitnesses.js';

// 1. Define constructor arg tuple
type OwnableArgs = readonly [
  initialOwner: Either<ZswapCoinPublicKey, ContractAddress>,
  isInit: boolean,
];

// 2. Create base class via factory
const OwnableSimulatorBase = createSimulator<
  OwnablePrivateState,
  ReturnType<typeof ledger>,
  ReturnType<typeof OwnableWitnesses>,
  MockOwnable<OwnablePrivateState>,
  OwnableArgs
>({
  contractFactory: (witnesses) =>
    new MockOwnable<OwnablePrivateState>(witnesses),
  defaultPrivateState: () => OwnablePrivateState,
  contractArgs: (initialOwner, isInit) => [initialOwner, isInit],
  ledgerExtractor: (state) => ledger(state),
  witnessesFactory: () => OwnableWitnesses(),
});

// 3. Extend with domain-specific API
export class OwnableSimulator extends OwnableSimulatorBase {
  constructor(
    initialOwner: Either<ZswapCoinPublicKey, ContractAddress>,
    isInit: boolean,
    options: BaseSimulatorOptions<
      OwnablePrivateState,
      ReturnType<typeof OwnableWitnesses>
    > = {},
  ) {
    super([initialOwner, isInit], options);
  }

  public owner(): Either<ZswapCoinPublicKey, ContractAddress> {
    return this.circuits.impure.owner();
  }

  public transferOwnership(
    newOwner: Either<ZswapCoinPublicKey, ContractAddress>,
  ) {
    this.circuits.impure.transferOwnership(newOwner);
  }

  public renounceOwnership() {
    this.circuits.impure.renounceOwnership();
  }

  public assertOnlyOwner() {
    this.circuits.impure.assertOnlyOwner();
  }
}
```
