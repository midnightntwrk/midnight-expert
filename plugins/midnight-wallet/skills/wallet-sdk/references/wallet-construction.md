# Wallet Construction

## Overview

Constructing a Midnight wallet has three phases:

1. **Convert keys** -- derive cryptographic keys from an HD wallet seed
2. **Build config** -- assemble a `DefaultConfiguration` with network URLs and storage
3. **Init facade** -- call `WalletFacade.init()` with factory functions for each wallet sub-system

## Key Conversion

Three separate conversions turn raw derived bytes into wallet-ready keys. Each conversion uses a specific package:

| Conversion | Function | Package |
|---|---|---|
| Shielded (Zswap) keys | `ZswapSecretKeys.fromSeed()` | `@midnight-ntwrk/ledger-v8` |
| Unshielded keystore | `createKeystore()` | `@midnightntwrk/wallet-sdk-unshielded-wallet` |
| Dust secret key | `DustSecretKey.fromSeed()` | `@midnight-ntwrk/ledger-v8` |

> **CRITICAL:** `createKeystore()` is exported from `@midnightntwrk/wallet-sdk-unshielded-wallet`, **not** from `@midnight-ntwrk/address-format` or any other package.

```typescript
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { createKeystore, PublicKey as UnshieldedPublicKey } from '@midnightntwrk/wallet-sdk-unshielded-wallet';

// After HD key derivation (see key-derivation.md):
const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], configuration.networkId);
```

See [key-derivation.md](key-derivation.md) for the full HD wallet derivation flow that produces `derivationResult`.

## Configuration

`DefaultConfiguration` is an intersection of six sub-configuration types:

```typescript
type DefaultConfiguration =
  DefaultShieldedConfiguration &
  DefaultUnshieldedConfiguration &
  DefaultDustConfiguration &
  DefaultSubmissionConfiguration &
  DefaultPendingTransactionsServiceConfiguration &
  Partial<DefaultProvingConfiguration>;
```

A typical configuration object:

```typescript
import { InMemoryTransactionHistoryStorage } from '@midnightntwrk/wallet-sdk-abstractions';
import { type DefaultConfiguration, WalletEntrySchema } from '@midnightntwrk/wallet-sdk-facade';

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
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
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
basic-start tutorial and the compact-cli-dev template use `300_000_000_000_000n`.

> **DUST registration does not need `additionalFeeOverhead`.** Registration is
> self-funding — its fee is paid by the DUST the registered NIGHT UTXOs generate,
> not from the wallet's existing DUST balance — so it succeeds even at a `0` DUST
> balance (verified on a local devnet). `examples/register-dust.ts` leaves the
> overhead off for that reason. Set `additionalFeeOverhead` on the wallets that
> submit **transfers or contract calls**. See
> [managing-test-wallets references/dust-registration.md](../../managing-test-wallets/references/dust-registration.md)
> and `/midnight-status-codes:lookup 117` / `138`.

## WalletFacade Initialization

`WalletFacade.init()` accepts an `InitParams` object with the configuration and factory functions for each wallet sub-system:

```typescript
import { ShieldedWallet } from '@midnightntwrk/wallet-sdk-shielded';
import { UnshieldedWallet } from '@midnightntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnightntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnightntwrk/wallet-sdk-facade';

const wallet: WalletFacade = await WalletFacade.init({
  configuration,
  shielded: (config) =>
    ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (config) =>
    UnshieldedWallet(config).startWithPublicKey(
      UnshieldedPublicKey.fromKeyStore(unshieldedKeystore)
    ),
  dust: (config) =>
    DustWallet(config).startWithSecretKey(
      dustSecretKey,
      ledger.LedgerParameters.initialParameters().dust,
    ),
});
```

> **CRITICAL:** `DustWallet` requires `ledger.LedgerParameters.initialParameters().dust` as the second parameter to `startWithSecretKey()`. Omitting it causes a runtime error.

### Optional Service Overrides

`InitParams` also accepts optional factory functions for services that otherwise use built-in defaults:

| Parameter | Type | Default |
|---|---|---|
| `submissionService` | `(config) => SubmissionService` | Built-in relay submission |
| `pendingTransactionsService` | `(config) => PendingTransactionsService` | Built-in indexer-backed service |
| `provingService` | `(config) => ProvingService` | Remote proving via `provingServerUrl` |

## Starting the Wallet

After initialization, start the wallet and wait for state synchronization:

```typescript
await wallet.start(shieldedSecretKeys, dustSecretKey);
```

To block until the wallet has fully synced with the indexer:

```typescript
const syncedState = await wallet.waitForSyncedState();
// syncedState.isSynced is guaranteed true
```

## Transaction History Storage

The `TransactionHistoryStorage` interface defines how wallet transaction history is persisted:

```typescript
interface TransactionHistoryStorage<T extends { hash: TransactionHash }> {
  upsert(entry: T): Promise<void>;
  getAll(): Promise<readonly T[]>;
  get(hash: TransactionHash): Promise<T | undefined>;
  serialize(): Promise<SerializedTransactionHistory>;
}
```

> **Note:** The interface uses `upsert()`, not `put()` or `set()`. This is an insert-or-update semantic keyed by the entry's `hash` property.

The SDK provides `InMemoryTransactionHistoryStorage` from `@midnightntwrk/wallet-sdk-abstractions` as a ready-made in-memory implementation. Pass `WalletEntrySchema` (from `@midnightntwrk/wallet-sdk-facade`) to its constructor to enable serialization.

> **Note:** `InMemoryTransactionHistoryStorage` (from `wallet-sdk-abstractions`) and `WalletEntrySchema` (from `wallet-sdk-facade`) are the canonical imports used in the SDK's own docs-snippets. If these are missing from your installed package versions, update to the latest release or implement `TransactionHistoryStorage` directly.

## Lifecycle

| Phase | Method | Description |
|---|---|---|
| **Init** | `WalletFacade.init(initParams)` | Creates facade, wires up sub-wallets and services |
| **Start** | `wallet.start(shieldedKeys, dustKey)` | Begins syncing with the network |
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
- [references/key-derivation.md](key-derivation.md) -- HD wallet seed derivation
