# Mock Patterns Reference

## Why Mocks?

Compact modules are **imported, not inherited**. A module like `Ownable` has no constructor of its own -- it exposes `initialize()` and a set of circuits, but it cannot be deployed standalone. To test a module, you write a thin mock contract that imports the module, wires up a constructor, and re-exports the circuits you need. Mocks are intentionally minimal: they exist only to give the module a deployable wrapper.

## Standard Mock Pattern

A standard mock imports one module with a prefix, defines a constructor that calls the module's `initialize()`, and re-exports each circuit as a single-line forwarder:

```compact
// SPDX-License-Identifier: MIT

pragma language_version 0.23;

import CompactStandardLibrary;

import "../../Ownable" prefix Ownable_;

export { ZswapCoinPublicKey, ContractAddress, Either, Maybe };

constructor(initialOwner: Either<ZswapCoinPublicKey, ContractAddress>, isInit: Boolean) {
  if (disclose(isInit)) {
    Ownable_initialize(initialOwner);
  }
}

export circuit owner(): Either<ZswapCoinPublicKey, ContractAddress> {
  return Ownable_owner();
}

export circuit transferOwnership(newOwner: Either<ZswapCoinPublicKey, ContractAddress>): [] {
  return Ownable_transferOwnership(newOwner);
}

export circuit renounceOwnership(): [] {
  return Ownable_renounceOwnership();
}

export circuit assertOnlyOwner(): [] {
  return Ownable_assertOnlyOwner();
}
```

Key conventions:

- The prefix (e.g. `Ownable_`) is prepended to all imported identifiers. `Ownable_initialize` refers to the module's `initialize` circuit.
- `CompactStandardLibrary` provides `ZswapCoinPublicKey`, `ContractAddress`, `Either`, `Maybe`, `Boolean`, and other core types.
- Every re-exported circuit is a **single-line forwarder** that delegates directly to the prefixed module circuit.

## The `isInit: Boolean` Pattern

Mocks accept an `isInit` parameter that controls whether the constructor actually calls `initialize()`. This lets you test the "uninitialized" state -- verifying that every circuit fails with `'Initializable: contract not initialized'` before initialization:

```compact
constructor(initialOwner: Either<ZswapCoinPublicKey, ContractAddress>, isInit: Boolean) {
  if (disclose(isInit)) {
    Ownable_initialize(initialOwner);
  }
}
```

In tests:

```typescript
const isInit = true;
const isBadInit = false;

// Initialized -- circuits work
const ownable = new OwnableSimulator(Z_OWNER, isInit);
expect(ownable.owner()).toEqual(Z_OWNER);

// Not initialized -- circuits fail
const badOwnable = new OwnableSimulator(Z_OWNER, isBadInit);
expect(() => badOwnable.owner()).toThrow('Initializable: contract not initialized');
```

The `disclose()` wrapper is required because `Boolean` in Compact is a private type by default. `disclose()` makes the value available for branching in the constructor.

## The `Maybe<T>` Constructor Pattern

For contracts where the constructor parameters are more complex, use `Maybe<T>` to express optional initialization. The `MultiToken` mock demonstrates this:

```compact
constructor(
  _uri: Maybe<Opaque<"string">>
) {
  if (disclose(_uri.is_some)) {
    MultiToken_initialize(_uri.value);
  }
}
```

This is equivalent to `isInit` but carries the actual init value inside the `Maybe`. When `is_some` is false, the constructor skips initialization entirely.

## Re-exporting Types

Mocks must re-export any types that tests or simulators need from the compiled artifacts. Without these exports, the generated TypeScript types won't include them:

```compact
export { ZswapCoinPublicKey, ContractAddress, Either, Maybe };
```

Always export `ZswapCoinPublicKey`, `ContractAddress`, `Either`, and `Maybe` as they are used universally in test code for address handling.

## Re-exporting Ledger Fields

When tests need to inspect specific ledger fields (e.g., for ZK commitment counters or token balances), the mock must export the prefixed ledger field names:

```compact
export { ZOwnablePK__ownerCommitment, ZOwnablePK__counter };
```

```compact
export { MultiToken__balances, MultiToken__operatorApprovals, MultiToken__uri };
```

These exports make the fields available through the `ledger()` function in the generated TypeScript artifacts, which the simulator's `ledgerExtractor` uses.

## Thin Forwarding Circuits

Every circuit in a mock should be a **single-line forwarder** -- no additional logic:

```compact
export circuit owner(): Either<ZswapCoinPublicKey, ContractAddress> {
  return Ownable_owner();
}

export circuit transferOwnership(newOwner: Either<ZswapCoinPublicKey, ContractAddress>): [] {
  return Ownable_transferOwnership(newOwner);
}
```

For pure circuits, add the `pure` keyword:

```compact
export pure circuit _computeOwnerId(pk: Either<ZswapCoinPublicKey, ContractAddress>, nonce: Bytes<32>): Bytes<32> {
  return ZOwnablePK__computeOwnerId(pk, nonce);
}
```

Do not add validation, state changes, or branching in mock circuits. The module under test should contain all the logic. If a mock adds behavior, you are testing the mock, not the module.

## When NOT to Mock

Do not create a mock if the contract already has its own constructor and can be deployed directly. Mocks exist to give modules a deployable shell. If a standalone contract already provides constructors and circuits, test it directly.

Similarly, if a module has its own complete constructor (accepting all needed parameters and calling its own `initialize`), you may not need a mock at all -- you can import the module into a real contract and test that integration.

## `archive/` Exclusion and Build Rules

Mock contracts follow these exclusion rules:

- Files named `Mock*.compact` are excluded from the production build. They live in `test/mocks/` directories and are only compiled for testing.
- The `archive/` directory is excluded from all builds and all compilation. Do not place active mocks or tests there.
- Mock simulators live alongside tests in `test/simulators/` and import from the mock's generated artifacts path (e.g., `../../../../artifacts/MockOwnable/contract/index.js`).
