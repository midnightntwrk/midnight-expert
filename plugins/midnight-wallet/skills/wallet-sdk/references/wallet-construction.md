# Wallet Construction

## Overview

Constructing a Midnight wallet (wallet SDK 2.0.1, ledger 9) has four phases:

1. **Derive seeds** -- one master seed gives the three per-wallet seeds
2. **Build config** -- assemble a `DefaultConfiguration` with network URLs and storage
3. **Init facade** -- call `WalletFacade.init()` with factory functions for each wallet sub-system
4. **Start and settle** -- `wallet.start(seeds)`, then wait until the wallet is synced and settled

## Seeds and the Unshielded Keystore

The shielded and dust wallets start straight from their seeds. Only the unshielded wallet needs a keystore, because it signs:

| Wallet | Started from | Package |
|---|---|---|
| Shielded | `seeds.shielded` via `startWithSeed()` | `@midnightntwrk/wallet-sdk-shielded` |
| Unshielded | `PublicKey.fromKeyStore(createKeystore(...))` via `startWithPublicKey()` | `@midnightntwrk/wallet-sdk-unshielded-wallet` |
| Dust | `seeds.dust` via `startWithSeed()` | `@midnightntwrk/wallet-sdk-dust-wallet` |

> **CRITICAL:** `createKeystore()` is exported from `@midnightntwrk/wallet-sdk-unshielded-wallet`, **not** from `@midnightntwrk/wallet-sdk-address-format` or any other package. In 2.0.0 it takes `{ kind, secret }`, not bare bytes.

```typescript
import { WalletSeeds } from '@midnightntwrk/wallet-sdk-hd';
import { createKeystore, PublicKey } from '@midnightntwrk/wallet-sdk-unshielded-wallet';

const seeds = WalletSeeds.fromMasterSeed(masterSeed);
const unshieldedKeystore = createKeystore(
  { kind: 'schnorr', secret: seeds.unshielded },
  configuration.networkId,
);
```

`"schnorr"` is the scheme that works on both sides of the ledger 9 boundary. See [key-derivation.md](key-derivation.md) for `WalletSeeds` options and the lower-level `HDWallet` API.

## Configuration

`DefaultConfiguration` combines the wallets' and services' configuration types, with the fork schedule optional:

```typescript
type WalletsConfiguration =
  DefaultUnshieldedConfiguration &
  DefaultShieldedConfiguration &
  DefaultDustConfiguration &
  DefaultSubmissionConfiguration &
  DefaultTransactionLifecycleServiceConfiguration &
  DefaultProvingConfiguration;

type DefaultConfiguration = Omit<WalletsConfiguration, 'forks'> & {
  forks?: ProtocolVersion.ForkSchedule; // defaults to DefaultForkSchedule
};
```

Leave `forks` unset unless you run a chain with a different ledger 9 fork version; the facade fills in `DefaultForkSchedule`.

A typical configuration object:

```typescript
import { InMemoryTransactionHistoryStorage } from '@midnightntwrk/wallet-sdk-abstractions';
import {
  type DefaultConfiguration,
  WalletEntrySchema,
  mergeWalletEntries,
} from '@midnightntwrk/wallet-sdk-facade';

const configuration: DefaultConfiguration = {
  networkId: 'undeployed',
  costParameters: {
    feeBlocksMargin: 5,
    // Forces a non-zero DUST fee. See "costParameters and additionalFeeOverhead"
    // below — needed for transfers/contract calls on an idle devnet (error 117).
    additionalFeeOverhead: 1_000_000n,
  },
  relayURL: new URL('ws://localhost:9944'),
  provingServerUrl: new URL('http://localhost:6300'),
  indexerClientConnection: {
    indexerHttpUrl: 'http://localhost:8088/api/v4/graphql',
    indexerWsUrl: 'ws://localhost:8088/api/v4/graphql/ws',
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
};
```

See [infrastructure-clients.md](infrastructure-clients.md) for details on each URL endpoint and how to configure them for testnet/mainnet.

### `costParameters` and `additionalFeeOverhead`

`costParameters` controls how the wallet computes transaction fees (paid in
**DUST**, never NIGHT):

- `feeBlocksMargin` — how many blocks of fee headroom to add (5 is a safe default).
- `additionalFeeOverhead` — a flat DUST amount added on top of the computed fee.

On a freshly-started **local devnet** the per-block fee rate is effectively zero,
so `feesWithMargin` evaluates to `0`. With no `additionalFeeOverhead` the fee is
`0`, which makes the wallet build an empty DUST spend set — and the node rejects
that as **NotNormalized (error 117)**. This bites the **first contract call** in
particular (a `ContractDeploy` is accepted, the next call fails). Setting a small
positive `additionalFeeOverhead` forces a real DUST fee so the transaction
normalizes. Any positive amount the wallet can cover in DUST works; the
compact-cli-dev template uses `300_000_000_000_000n`. (compact-core's basic-start builds its wallets with testkit's `FluentWalletBuilder`, whose default overhead is `0n`.)

> **DUST registration does not need `additionalFeeOverhead`.** Registration is
> self-funding — its fee is paid by the DUST the NIGHT UTXOs being registered
> have generated, not from the wallet's existing DUST balance — so it works from
> a `0` DUST balance. In 2.0.0 a first registration has to wait until those UTXOs
> have generated the fee, or it throws `InsufficientDustForFeeError` with an
> estimate of how long to wait before retrying (see
> [transactions.md](transactions.md#dust-registration)). Set
> `additionalFeeOverhead` on the wallets that submit **transfers or contract
> calls**. See
> [managing-test-wallets references/dust-registration.md](../../managing-test-wallets/references/dust-registration.md)
> and `/midnight-status-codes:lookup 117` / `138`.

## WalletFacade Initialization

`WalletFacade.init()` accepts an `InitParams` object with the configuration and factory functions for each wallet sub-system:

```typescript
import { ShieldedWallet } from '@midnightntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, PublicKey } from '@midnightntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnightntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnightntwrk/wallet-sdk-facade';

const wallet: WalletFacade = await WalletFacade.init({
  configuration,
  shielded: (config) => ShieldedWallet(config).startWithSeed(seeds.shielded),
  unshielded: (config) =>
    UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
  dust: (config) => DustWallet(config).startWithSeed(seeds.dust),
});
```

`DustWallet(config).startWithSeed(seed, dustParameters?)` takes the generation rates as an optional second argument; leave it off to use the defaults. The 1.x `startWithSecretKey(key, LedgerParameters.initialParameters().dust)` form is gone from the default wallet. If you hold key objects rather than seeds, use `startWithKeys` with **both** ledger versions' keys (`{ v8, v9 }`) — key objects can't cross the boundary on their own.

### Optional Service Overrides

`InitParams` also accepts optional factory functions for services that otherwise use built-in defaults:

| Parameter | Type | Default |
|---|---|---|
| `submissionService` | `(config) => SubmissionService` | Built-in relay submission |
| `transactionLifecycleService` | `(config, { clock }) => TransactionLifecycleService` | Built-in indexer-backed lifecycle tracking (replaces 1.x `pendingTransactionsService`) |
| `provingService` | `(config) => VersionedProvingService` | Remote proving via `provingServerUrl` (or `provers`) |
| `fetchBlockData` / `validationService` | factories | Built-in, for pre-submission validation |
| `clock` | `(config) => Clock` | `Clock.systemClock` |

Each factory receives the resolved configuration (your configuration plus `forks`) and may return the service or a Promise of it.

## Starting the Wallet

After initialization, start the wallet with the **seeds** (not key objects):

```typescript
await wallet.start(seeds);
```

Then wait until it is synced **and settled** before building any transaction:

```typescript
import { firstValueFrom, filter } from 'rxjs';

const syncedState = await firstValueFrom(
  wallet.state().pipe(filter((s) => s.isSynced && s.protocol._tag === 'Settled')),
);
```

`wallet.waitForSyncedState()` still exists, but it only waits for `isSynced`. Around the ledger 9 fork the three sub-wallets cross the boundary at slightly different moments; until the last one does, `state.protocol` is `{ _tag: 'Crossing', from, to, behind }`, and a transaction built then can fail with `ProtocolVersionMismatchError`. `Settled` means all three agree. See [state-and-balances.md](state-and-balances.md#protocol-phase).

## Transaction History Storage

The `TransactionHistoryStorage` interface defines how wallet transaction history is persisted:

```typescript
// reader
getAll(): Promise<readonly T[]>;
get(hash: TransactionHash): Promise<T | undefined>;
serialize(): Promise<SerializedTransactionHistory>;
// writer: one call per lifecycle event
gotPending(entry: PendingEntryInput<T>): Promise<void>;
gotFinalized(entry: FinalizedEntryInput<T>): Promise<void>;
gotRejected(entry: RejectedEntryInput<T>): Promise<void>;
```

> **Note:** 1.x's single `upsert()` is gone. The wallets report each transaction as pending, finalized or rejected, and the storage merges what the three wallets write under the same hash.

The SDK provides `InMemoryTransactionHistoryStorage` from `@midnightntwrk/wallet-sdk-abstractions` as a ready-made in-memory implementation. Its constructor is `(schema, merge?)`: pass `WalletEntrySchema` and `mergeWalletEntries` (both from `@midnightntwrk/wallet-sdk-facade`). The merge function is what combines the shielded, unshielded and dust sections of one transaction into one entry. `InMemoryTransactionHistoryStorage.restore(serialized, schema, merge?)` rebuilds one from `serialize()` output.

## Lifecycle

| Phase | Method | Description |
|---|---|---|
| **Init** | `WalletFacade.init(initParams)` | Creates facade, wires up sub-wallets and services |
| **Start** | `wallet.start(seeds)` | Begins syncing with the network |
| **Stop** | `wallet.stop()` | Gracefully shuts down all sub-wallets and services |

Always call `stop()` when the wallet is no longer needed to release WebSocket connections and other resources.

## WebSocket Polyfill

In Node.js environments, the wallet SDK requires a WebSocket implementation. Install the `ws` package and register it as a global before initializing the wallet:

```typescript
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;
```

This is not needed in browser environments where `WebSocket` is available natively.

---

**See also:**
- [examples/basic-wallet-setup.ts](../examples/basic-wallet-setup.ts) -- complete working example
- [references/state-and-balances.md](state-and-balances.md) -- querying balances after wallet start
- [references/key-derivation.md](key-derivation.md) -- deriving the wallet seeds
