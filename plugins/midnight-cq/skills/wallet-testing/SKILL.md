---
name: midnight-cq:wallet-testing
description: >-
  This skill should be used when the user asks to write wallet tests, test my
  wallet variant, test my capability, test my wallet service, test WalletBuilder,
  write wallet SDK tests, test Effect code, test Observable state, mock wallet
  services, test wallet state management, wallet test fixtures, wallet test setup,
  or Vitest wallet. Also triggered by requests to write tests for custom wallet
  implementations or compose wallets with WalletBuilder.
version: 0.1.0
---

# Wallet SDK Testing

> **Last verified:** 2026-09-18 — wallet SDK npm scope corrected to `@midnightntwrk` (no hyphen; commit 9485a0f). `ProtocolVersion` confirmed exported by `@midnightntwrk/wallet-sdk-abstractions` 2.1.0 as a `Brand.Branded<bigint>` with a brand constructor (matching the `ProtocolVersion(8n)` fixture pattern). Deeper `WalletBuilder`/`WalletFacade`/capability signatures are cross-referenced from `midnight-wallet:wallet-sdk` (its dedicated pass).

Write tests for custom wallet implementations and extensions built on the
Midnight Wallet SDK packages (`@midnightntwrk/wallet-sdk-*`).

## When to Use This Skill

| Question | Skill |
|----------|-------|
| Am I building a custom wallet variant or capability? | **wallet-testing** (this skill) |
| Am I integrating with the wallet via the DApp Connector API? | `midnight-cq:dapp-connector-testing` |
| Am I testing Compact contract logic? | `midnight-cq:compact-testing` |
| Am I testing DApp UI flows? | `midnight-cq:dapp-testing` |
| Do I need the Wallet SDK API reference? | `midnight-wallet:wallet-sdk` |

## What This Skill Covers

You are testing code that uses the wallet SDK packages directly:

- Custom wallet variants for new protocol versions
- Extended capabilities (custom coin selection, custom balancing strategies)
- Custom services (alternative proving backends, custom indexer sync)
- Wallet composition via WalletBuilder
- Code that interacts with the three wallet types (shielded, unshielded, dust) at the SDK level

## What This Skill Does NOT Cover

- Testing DApp code that integrates via the DApp Connector API (use `midnight-cq:dapp-connector-testing`)
- Testing Compact contracts (use `midnight-cq:compact-testing`)
- Testing DApp UI end-to-end (use `midnight-cq:dapp-testing`)
- Enforcing the wallet SDK's internal coding standards — those are the SDK team's concern, not the user's

## The Boundary Problem

Users write their own code in whatever style they choose. But at the interface
boundary, they must interact with SDK types. These boundary interactions are
where testing gets tricky:

### 1. Unwrapping Effect/Either Results

SDK methods return `Effect<A, E>` and `Either<A, E>`. Your test code needs to
unwrap these to make assertions.

```typescript
import { Effect, Exit, Either } from 'effect';

// Happy path — unwrap Effect to get the value
it('should fetch wallet state', async () => {
  const result = await Effect.runPromise(myService.getState());
  expect(result.version).toBe(expectedVersion);
});

// Failure path — check that an Effect fails with the right error
it('should fail for invalid seed', async () => {
  const exit = await Effect.runPromiseExit(myService.init(invalidSeed));
  expect(Exit.isFailure(exit)).toBe(true);
});

// Pure capability — unwrap Either
it('should balance the transaction', () => {
  const result = myCapability.balance(state, tx);
  expect(Either.isRight(result)).toBe(true);
  if (Either.isRight(result)) {
    expect(result.right[0].inputs.length).toBeGreaterThan(0);
  }
});
```

See `references/effect-boundary-patterns.md` for complete patterns.

### 2. Asserting on Observable State

WalletFacade exposes `state(): Observable<FacadeState>`. Tests need to
subscribe, wait for specific conditions, and assert on emitted values.

```typescript
import { firstValueFrom, filter } from 'rxjs';

it('should sync all three wallets', async () => {
  const syncedState = await firstValueFrom(
    wallet.state().pipe(
      filter((s) => s.shielded.progress.isCompleteWithin() &&
                    s.unshielded.progress.isCompleteWithin() &&
                    s.dust.progress.isCompleteWithin())
    )
  );
  expect(syncedState.shielded.availableBalances).toBeDefined();
});
```

See `references/observable-testing.md` for complete patterns.

### 3. Constructing Branded Type Fixtures

ProtocolVersion, WalletSeed, WalletState, and NetworkId are branded types.
Use the SDK's constructors — never cast raw values.

```typescript
import { ProtocolVersion } from '@midnightntwrk/wallet-sdk-abstractions';

const version = ProtocolVersion(8n); // Use the brand constructor
```

See `references/wallet-builder-setup.md` for all fixture patterns.

### 4. Test Doubles for SDK Interfaces

When providing custom capabilities or services to WalletBuilder, your test
double must satisfy the interface. A partial implementation will pass TypeScript
but crash at runtime.

```typescript
// Providing a test double for ProvingService
const testProvingService: ProvingServiceEffect<MyTransaction> = {
  proveTransaction: (tx) => Effect.succeed(provenTx),
};
```

See `references/wallet-builder-setup.md` for interface patterns.

### 5. WalletBuilder Test Setup

Wire up WalletBuilder with test variants and initial state:

```typescript
const TestWallet = WalletBuilder
  .init()
  .withVariant(ProtocolVersion(8n), myV8Builder)
  .build();

let wallet: InstanceType<typeof TestWallet>;

beforeEach(async () => {
  wallet = await TestWallet.startFirst(TestWallet, initialState);
});

afterEach(async () => {
  await wallet.close();
});
```

See `references/wallet-builder-setup.md` for complete setup patterns.

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Fix |
|---|---|---|
| Unwrapping Effect with try/catch | Loses typed error information; can't distinguish Effect failure from thrown exception | Use `Effect.runPromiseExit` + `Exit.isFailure` |
| Asserting on Observable without waiting | Test races the async emission; passes sometimes, fails sometimes | Use `firstValueFrom` with `filter` and a timeout |
| Constructing branded types with `as` casts | Bypasses validation; creates values the SDK would reject | Use the SDK's brand constructors (e.g., `ProtocolVersion(8n)`) |
| Partial interface implementations | Passes tsc but crashes at runtime when unimplemented method is called | Implement every method in the interface, even if some return dummy values |
| Sharing wallet instances across tests | State bleeds between tests; order-dependent failures | Create fresh wallet in `beforeEach`, close in `afterEach` |
| Not cleaning up subscriptions | Observable subscriptions leak; tests hang or interfere with each other | Unsubscribe in `afterEach` or use `firstValueFrom` (auto-completes) |

## Reference Files

| Topic | Reference |
|-------|-----------|
| Unwrapping Effect/Either, mock Layers, testing Streams | `references/effect-boundary-patterns.md` |
| WalletBuilder wiring, initial state, branded type fixtures, test doubles | `references/wallet-builder-setup.md` |
| Observable state testing, subscription cleanup, state transition assertions | `references/observable-testing.md` |
