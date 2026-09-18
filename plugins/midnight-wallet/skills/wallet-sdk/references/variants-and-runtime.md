# Variants and Runtime

## Overview

The variant system is the mechanism by which the Midnight Wallet SDK handles protocol upgrades. Each wallet type (shielded, unshielded, dust) is versioned: a `v1` implementation is registered against a specific `ProtocolVersion`, and if the network hard-forks the runtime automatically migrates state to the next registered variant. Most application code never touches this layer directly — `WalletFacade` handles dispatch internally.

Source of truth: `/tmp/midnight-wallet/packages/runtime/src/`

---

## The Variant Pattern

Each concrete wallet package exposes a variant builder for its current protocol version. The pattern is:

- `@midnightntwrk/wallet-sdk-shielded` — `V1Builder` (produces a `V1Variant` tagged with `V1Tag`)
- `@midnightntwrk/wallet-sdk-unshielded-wallet` — analogous `V1Builder`
- `@midnightntwrk/wallet-sdk-dust-wallet` — analogous `V1Builder`

Variants carry a unique symbol tag (`V1Tag: unique symbol = Symbol('V1')`) that the runtime uses for type-safe dispatch. A "versioned variant" pairs the variant object with the `ProtocolVersion` it handles:

```typescript
type VersionedVariant<T extends AnyVariant> = Readonly<{
  sinceVersion: ProtocolVersion.ProtocolVersion;
  variant: T;
}>;
```

---

## `WalletBuilder<TBuilders>`

**Package:** `@midnightntwrk/wallet-sdk-runtime`  
**Export:** named class `WalletBuilder`

```typescript
class WalletBuilder<TBuilders extends VariantBuilder.AnyVersionedVariantBuilder[]>
```

Builds a wallet class from an ordered list of versioned variant builders. The builder is immutable — each method returns a new instance.

| Method | Signature | Description |
|--------|-----------|-------------|
| `WalletBuilder.init()` | `() => WalletBuilder<[]>` | Static factory; starts with an empty variant list |
| `.withVariant(sinceVersion, variantBuilder)` | `(ProtocolVersion, VariantBuilder) => WalletBuilder<...>` | Registers a variant for the given protocol version; versions must be strictly ascending |
| `.build(...config)` | `(config?) => BaseWalletClass<Variants, Config>` | Produces the wallet class; throws `WalletRuntimeError` if no variants are registered |

The returned class (`BaseWalletClass`) has static methods `startEmpty`, `startFirst`, and `start` for instantiating the wallet from saved state or from scratch.

---

## `Runtime.Runtime<Variants>` Interface

**Package:** `@midnightntwrk/wallet-sdk-runtime`  
**Export:** `export * as Runtime from './Runtime.js'` — accessed as `Runtime.Runtime<Variants>`

```typescript
export interface Runtime<Variants extends Variant.AnyVersionedVariantArray> {
  readonly stateChanges: Stream.Stream<
    ProtocolState.ProtocolState<Variant.StateOf<HList.Each<Variants>>>,
    WalletRuntimeError
  >;

  readonly progress: Effect.Effect<Progress>;

  readonly currentVariant: Effect.Effect<EachRunningVariant<Variants>>;

  dispatch<TResult, E = never>(
    impl: Poly.PolyFunction<Variant.RunningVariantOf<HList.Each<Variants>>, Effect.Effect<TResult, E>>,
  ): Effect.Effect<TResult, WalletRuntimeError | E>;
}
```

| Member | Type | Description |
|--------|------|-------------|
| `stateChanges` | `Stream<ProtocolState<State>, WalletRuntimeError>` | Continuous stream of wallet state snapshots |
| `progress` | `Effect<{ sourceGap: bigint; applyGap: bigint }>` | Sync progress gaps; both `0n` means fully synced |
| `currentVariant` | `Effect<EachRunningVariant<Variants>>` | The currently active running variant |
| `dispatch<T, E>(fn)` | `(PolyFunction) => Effect<T, WalletRuntimeError \| E>` | Routes a polymorphic function call to the active variant |

---

## `Runtime.dispatch` — Visitor-Style Dispatch

The `dispatch` method accepts a `PolyFunction` — a visitor object where each key is a variant tag and the value is a function from the running variant to an `Effect`. This pattern allows the runtime to route the call to whichever variant is currently active without the caller needing to know which variant that is.

```typescript
runtime.dispatch({
  [V1Tag]: (runningVariant) => runningVariant.sendTransaction(tx),
})
```

When a hard-fork migration occurs mid-session, `dispatch` automatically routes subsequent calls to the new variant. Application code (and `WalletFacade`) uses this instead of holding a direct reference to a variant.

---

## `./abstractions` Sub-Export

**Package export path:** `@midnightntwrk/wallet-sdk-runtime/abstractions`

This sub-export contains the contracts that variant builders and variants must implement. It is intended for authors of custom variants, not for typical application consumers.

| Exported namespace | Contents |
|-------------------|----------|
| `Variant` | `Variant<TTag, TState, TPreviousState, TRunning>`, `RunningVariant<TTag, TState>`, `VersionedVariant<T>`, utility types (`StateOf`, `PreviousStateOf`, `RunningVariantOf`, `VariantRecord`) |
| `VariantBuilder` | `VariantBuilder<TVariant, TConfig>`, `VersionedVariantBuilder<TBuilder>`, utility types |
| `WalletLike` | `WalletLike<TVariants>` (instance interface), `BaseWalletClass<TVariants, TConfig>` (static interface) |
| `StateChange` | `StateChange<TState>` tagged enum — variants: `State`, `ProgressUpdate`, `VersionChange` |
| `VersionChangeType` | `VersionChangeType` tagged enum — variants: `Version` (specific protocol version), `Next` (next registered variant, used in testing) |
| `WalletRuntimeError` | `class WalletRuntimeError extends Data.TaggedError('WalletRuntimeError')` — cross-cutting runtime error |

### `Variant<TTag, TState, TPreviousState, TRunning>` contract

```typescript
type Variant<TTag, TState, TPreviousState, TRunning extends RunningVariant<TTag, TState>> =
  Poly.WithTag<TTag> & {
    start(context: VariantContext<TState>): Effect<TRunning, WalletRuntimeError, Scope.Scope>;
    migrateState(previousState: TPreviousState): Effect<TState>;
  };
```

- `start` — called when the runtime activates this variant; receives a `SubscriptionRef` for the wallet state.
- `migrateState` — called when migrating from the previous variant's state; `previousState` is `null` for the first variant.

### `RunningVariant<TTag, TState>` contract

```typescript
type RunningVariant<TTag, TState> = Poly.WithTag<TTag> & {
  state: Stream<StateChange.StateChange<TState>, WalletRuntimeError>;
};
```

The `state` stream must emit `StateChange` values. The runtime reads this stream to drive state updates and migration triggers.

---

## When to Touch This Directly

**Almost never.** The facade (`WalletFacade.init()`) creates the runtime internally and dispatches all wallet calls through it. The variant system is transparent to normal dapp development.

You may need to interact with this layer if:

1. **Writing a custom variant** — implementing `Variant` and `VariantBuilder` to handle a hard-fork or experimental protocol version before it is officially released.
2. **Advanced state serialisation** — if you need to inspect which variant produced a given state snapshot, `currentVariant` gives you the running variant with its tag.
3. **Testing protocol migrations** — `VersionChangeType.Next` lets tests trigger a variant migration without specifying a concrete protocol version.

For everything else, work through the facade API or the per-wallet wallet classes (`ShieldedWallet`, `UnshieldedWallet`, `DustWallet`).

---

## Import Verification

The following imports resolve against `@midnightntwrk/wallet-sdk-runtime@1.0.4` (verified with `tsc --noEmit` in the verify harness):

```typescript
import { WalletBuilder, Runtime } from "@midnightntwrk/wallet-sdk-runtime";
import type {
  Variant,
  VariantBuilder,
  WalletLike,
  StateChange,
  VersionChangeType,
} from "@midnightntwrk/wallet-sdk-runtime/abstractions";
```

`WalletRuntimeError` is re-exported from the `./abstractions` sub-export (via `export * from './WalletRuntimeError.js'`) and is also available via the named `WalletRuntimeError` export from the abstractions namespace.
