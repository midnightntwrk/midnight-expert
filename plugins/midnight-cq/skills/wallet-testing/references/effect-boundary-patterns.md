# Effect Boundary Patterns for Wallet SDK Tests

How to unwrap and assert on Effect/Either results from the wallet SDK in
Vitest tests.

## Effect Happy Path

Use `Effect.runPromise` to unwrap an Effect that should succeed:

```typescript
import { Effect } from 'effect';

it('should return wallet state', async () => {
  const state = await Effect.runPromise(walletService.getState());
  expect(state.version).toBe(expectedVersion);
});
```

## Effect Failure Path

Use `Effect.runPromiseExit` + `Exit.isFailure` to test expected failures:

```typescript
import { Effect, Exit } from 'effect';

it('should fail with WalletError for invalid input', async () => {
  const exit = await Effect.runPromiseExit(walletService.init(badInput));
  expect(Exit.isFailure(exit)).toBe(true);
});
```

To assert on the specific error:

```typescript
import { Effect, Exit, Cause } from 'effect';

it('should fail with InsufficientFundsError', async () => {
  const exit = await Effect.runPromiseExit(
    capability.selectCoins(emptyState, largeAmount)
  );
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const error = Cause.failureOption(exit.cause);
    expect(error._tag).toBe('Some');
    expect(error.value._tag).toBe('InsufficientFunds');
  }
});
```

## Effect Synchronous

Use `Effect.runSync` when the Effect has no async dependencies:

```typescript
import { Effect } from 'effect';

it('should compute balance synchronously', () => {
  const balance = Effect.runSync(pureCapability.computeBalance(state));
  expect(balance).toBe(expectedBalance);
});
```

## Either (Pure Capabilities)

Capabilities return `Either<A, E>` for pure synchronous operations:

```typescript
import { Either } from 'effect';

it('should balance transaction successfully', () => {
  const result = capability.balanceTransaction(state, tx);
  expect(Either.isRight(result)).toBe(true);
  if (Either.isRight(result)) {
    const [balancingResult, newState] = result.right;
    expect(balancingResult.inputs.length).toBeGreaterThan(0);
  }
});

it('should fail for insufficient funds', () => {
  const result = capability.balanceTransaction(emptyState, largeTx);
  expect(Either.isLeft(result)).toBe(true);
  if (Either.isLeft(result)) {
    expect(result.left._tag).toBe('InsufficientFunds');
  }
});
```

## Mock Services via Layer

When testing code that depends on SDK services, provide test doubles via
`Layer.succeed`:

```typescript
import { Effect, Layer } from 'effect';
import { ProvingService } from '@midnightntwrk/wallet-sdk-capabilities';

const MockProvingService = Layer.succeed(ProvingService, {
  proveTransaction: (tx) => Effect.succeed(mockProvenTx),
});

it('should use mock proving service', async () => {
  const result = await Effect.runPromise(
    myWorkflow.pipe(Effect.provide(MockProvingService))
  );
  expect(result).toBeDefined();
});
```

## Testing Effect Streams

Collect emissions from an Effect Stream:

```typescript
import { Effect, Stream } from 'effect';

it('should emit sync updates', async () => {
  const updates = await Effect.runPromise(
    syncService.updates(state).pipe(
      Stream.take(3),
      Stream.runCollect
    )
  );
  expect(updates.length).toBe(3);
});
```
