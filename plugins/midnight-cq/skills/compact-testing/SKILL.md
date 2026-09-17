---
name: midnight-cq:compact-testing
description: >-
  This skill should be used when the user asks to write Compact contract tests,
  test a contract with the simulator, set up createSimulator, mock contract
  patterns, override witnesses in tests, write unit tests for Compact circuits,
  set up Vitest for a Compact project, test access control or error cases,
  use describe.each or it.each for parameterized tests, check invariants with
  afterEach, property-based testing with fast-check, or ZK commitment testing.
version: 0.1.0
---

# Compact Contract Testing

> **Last verified:** 2026-09-17 — simulator package corrected to `@openzeppelin/compact-simulator@0.3.1` (verified on npm to export `createSimulator`, depends on `compact-runtime` 0.16.0).

> "For mission critical Compact code, the quality of the tests is just as
> important (if not more so) than the code itself."
> — Moloch Testing Guide

Flaky tests are categorically unacceptable. Every test must be deterministic,
isolated, and precise. A test that sometimes passes is worse than no test: it
builds false confidence. If a test is not always green on a clean run, fix it
before merging.

This skill covers unit testing Compact contracts using the OpenZeppelin
simulator framework (`@openzeppelin/compact-simulator`). That
framework eliminates manual context threading by wrapping `createSimulator()`
around the contract, exposing a clean class-based API for callers, witnesses,
and private state.

## 4-Layer Test Structure

Every Compact test project follows this layout:

```
src/
  MyContract.compact          # Compact source
  witnesses/
    MyContractWitnesses.ts    # Witness implementations + PrivateState type
  test/
    mocks/
      MockMyContract.compact  # Thin wrapper: imports module, forwards circuits
    simulators/
      MyContractSimulator.ts  # createSimulator() config + user-friendly methods
    MyContract.test.ts        # Vitest test file
```

| Layer | Purpose |
|-------|---------|
| `.compact` source | Production contract logic |
| `witnesses/` | TypeScript witness implementations; defines `PrivateState` |
| `test/mocks/` | Thin Compact wrappers that import the module under test and forward circuits; adds `isInit: Boolean` constructor param to toggle initialized vs. uninitialized state |
| `test/simulators/` | `createSimulator()` config with `contractFactory`, `defaultPrivateState`, `contractArgs`, `ledgerExtractor`, `witnessesFactory`; extends the returned class with user-friendly methods |
| `test/*.test.ts` | Vitest test files; use the simulator exclusively — never touch raw contract APIs |

Mock contracts re-export key types (`ZswapCoinPublicKey`, `ContractAddress`,
`Either`, `Maybe`) so test files have a single import point.

## Quick-Reference: Good vs Bad Tests

### Access Control

```typescript
// GOOD: test both authorized and unauthorized callers
describe('transferOwnership', () => {
  it('should transfer when called by owner', () => {
    ownable.as(OWNER).transferOwnership(Z_NEW_OWNER);
    expect(ownable.owner()).toEqual(Z_NEW_OWNER);
  });

  it('should fail when called by unauthorized', () => {
    expect(() => {
      ownable.as(UNAUTHORIZED).transferOwnership(Z_NEW_OWNER);
    }).toThrow('Ownable: caller is not the owner');
  });
});

// BAD: only testing the happy path
it('should transfer ownership', () => {
  ownable.as(OWNER).transferOwnership(Z_NEW_OWNER);
  // No test that unauthorized callers are rejected
});
```

### Error Assertions

```typescript
// GOOD: assert the exact error message
expect(() => {
  token.as(OWNER).transfer(utils.ZERO_KEY, AMOUNT);
}).toThrow('FungibleToken: invalid receiver');

// BAD: only catching that "something threw"
expect(() => {
  token.as(OWNER).transfer(utils.ZERO_KEY, AMOUNT);
}).toThrow(); // passes for any error, masks wrong-message bugs
```

### Boundary Conditions

```typescript
// GOOD: test zero values and overflow boundaries explicitly
it('should catch mint overflow', () => {
  token._mint(Z_RECIPIENT, MAX_UINT128);
  expect(() => {
    token._mint(Z_RECIPIENT, 1n);
  }).toThrow('FungibleToken: arithmetic overflow');
});

it('should allow transfer of 0 tokens', () => {
  const txSuccess = token.as(OWNER).transfer(Z_RECIPIENT, 0n);
  expect(txSuccess).toBe(true);
});

// BAD: only testing "normal" amounts
it('should transfer tokens', () => {
  token.as(OWNER).transfer(Z_RECIPIENT, 100n);
  expect(token.balanceOf(Z_RECIPIENT)).toEqual(100n);
});
```

Full annotated examples (Ownable, FungibleToken, ZOwnablePK) are in
`references/test-examples.md`.

## Common Test Patterns

### `.as(caller)` — Caller Identity

`simulator.as(hexPubKey)` sets the caller for the next circuit call only.
The key is a raw hex public key string (not a `ZswapCoinPublicKey`).

```typescript
// Generate paired (raw, encoded) keys for testing
const [OWNER, Z_OWNER] = utils.generateEitherPubKeyPair('OWNER');
const [UNAUTHORIZED, _] = utils.generateEitherPubKeyPair('UNAUTHORIZED');

ownable.as(OWNER).assertOnlyOwner();           // passes
ownable.as(UNAUTHORIZED).assertOnlyOwner();    // throws
```

### `describe.each` — Type Combinations

Use `describe.each` when the same test suite must run for multiple input types
(e.g., pubkey owner vs contract address owner):

```typescript
const ownerTypes = [
  ['contract', Z_OWNER_CONTRACT],
  ['pubkey', Z_OWNER],
] as const;

describe.each(ownerTypes)('when the owner is a %s', (_, owner) => {
  it('should return balance', () => {
    token._unsafeMint(owner, AMOUNT);
    expect(token.balanceOf(owner)).toEqual(AMOUNT);
  });
});
```

### `it.each` — Parameterized Cases

Use `it.each` for a single test run across many parameter combinations:

```typescript
const circuitsToFail: [method: keyof OwnableSimulator, args: unknown[]][] = [
  ['owner', []],
  ['transferOwnership', [Z_OWNER]],
  ['renounceOwnership', []],
];

it.each(circuitsToFail)(
  'should fail when calling circuit "%s" before init',
  (circuitName, args) => {
    ownable = new OwnableSimulator(Z_OWNER, isBadInit);
    expect(() => {
      (ownable[circuitName] as (...args: unknown[]) => unknown)(...args);
    }).toThrow('Initializable: contract not initialized');
  },
);
```

### `afterEach` — Invariant Checks

Place invariant assertions in `afterEach` to verify them after every test in a
`describe` block without duplicating them:

```typescript
describe('transfer', () => {
  beforeEach(() => {
    token._mint(Z_OWNER, AMOUNT);
  });

  // Runs after every test in this describe — totalSupply must never change
  afterEach(() => {
    expect(token.totalSupply()).toEqual(AMOUNT);
  });

  it('should transfer partial', () => {
    token.as(OWNER).transfer(Z_RECIPIENT, AMOUNT - 1n);
    expect(token.balanceOf(Z_OWNER)).toEqual(1n);
  });

  it('should fail with insufficient balance', () => {
    expect(() => {
      token.as(OWNER).transfer(Z_RECIPIENT, AMOUNT + 1n);
    }).toThrow('FungibleToken: insufficient balance');
  });
});
```

### `beforeEach` — Fresh Simulator Per Test

Always create a fresh simulator in `beforeEach`. Never share simulator
instances across tests — shared state causes order-dependent failures.

```typescript
let ownable: OwnableSimulator;

describe('when initialized', () => {
  beforeEach(() => {
    ownable = new OwnableSimulator(Z_OWNER, isInit);
  });

  it('should return owner', () => {
    expect(ownable.owner()).toEqual(Z_OWNER);
  });

  it('should transfer ownership', () => {
    ownable.as(OWNER).transferOwnership(Z_NEW_OWNER);
    expect(ownable.owner()).toEqual(Z_NEW_OWNER);
  });
});
```

## Witness Overrides

Override a single witness for one test without rebuilding the simulator:

```typescript
simulator.overrideWitness('local_nonce', () => [privateState, BAD_NONCE]);
```

Replace all witnesses at once:

```typescript
simulator.witnesses = {
  local_nonce: () => [privateState, secretNonce],
  local_salt:  () => [privateState, instanceSalt],
};
```

Witness overrides are useful for testing ZK commitment verification: compute
the expected commitment locally with the same `persistentHash` logic the
contract uses, then assert the circuit output matches.

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Fix |
|---|---|---|
| Shared simulator across tests | State bleeds between tests; order-dependent failures | Use `beforeEach` to create fresh instance |
| `.toThrow()` with no message | Passes for wrong errors; masks regressions | Always assert the exact error string |
| Testing only the happy path | Misses all rejection logic | For every `assert` in the contract, write a failing test |
| Ignoring `afterEach` invariants | Supply invariants can silently break | Add `afterEach` for any property that must hold across all operations |
| Hard-coding hex keys inline | Brittle and unreadable | Use `utils.generateEitherPubKeyPair('LABEL')` for named keys |
| Skipping uninitialized-state tests | Real deployments can fail before init | Test every circuit in uninitialized state with `isBadInit = false` |
| Testing type variants once | Pubkey vs contract address behave differently | Use `describe.each` over `ownerTypes` / `recipientTypes` |
| Asserting only return value | Ledger state may be wrong despite correct return | Assert ledger state and balances after every mutation |

## Reference Files

| Topic | Reference |
|-------|-----------|
| Full annotated test examples (Ownable, FungibleToken, ZOwnablePK) — good vs bad pairs | `references/test-examples.md` |
| `createSimulator()` config, circuit proxies, caller simulation, state access | `references/simulator-api.md` |
| Mock contract structure, `isInit` pattern, re-exported types and ledger fields | `references/mock-patterns.md` |
| Witness file structure, `WitnessContext`, overrides, private state injection | `references/witness-testing.md` |
