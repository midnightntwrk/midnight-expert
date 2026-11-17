# State and Balances

## FacadeState

`FacadeState` is the top-level state object emitted by a `WalletFacade`. In wallet SDK 2.0.0 it composes the three wallet states, the transaction lifecycle records, and protocol-version readings:

```typescript
class FacadeState {
  readonly shielded: ShieldedWalletState;
  readonly unshielded: UnshieldedWalletState;
  readonly dust: DustWalletState;
  readonly lifecycle: readonly LifecycleEntry[];   // replaces 1.x `pending`

  get protocolVersion(): WalletProtocolVersions;     // { shielded, unshielded, dust }
  get activeProtocolVersion(): ProtocolVersion;      // the lowest of the three
  get protocol(): ProtocolPhase;                     // Settled | Crossing
  get isSynced(): boolean;
}
```

`isSynced` is `true` only when **all three** sub-wallets report strictly complete sync progress.

> **Warning:** Do not read balances before `isSynced` returns `true`. Until all wallets have finished their initial sync, balance values are incomplete and will undercount holdings.

### Protocol phase

`state.protocol` says whether the three wallets agree about which side of the ledger 9 boundary the chain is on:

```typescript
type ProtocolPhase =
  | { _tag: 'Settled'; version: ProtocolVersion }
  | { _tag: 'Crossing'; from: ProtocolVersion; to: ProtocolVersion; behind: readonly ('shielded' | 'unshielded' | 'dust')[] };
```

Each sub-wallet notices the fork when its own sync reaches it, so around the fork some have crossed and some have not. While the phase is `Crossing`, the facade stays bound to `from` (that's `activeProtocolVersion`), and a transaction built then can fail with `ProtocolVersionMismatchError`. **Build transactions only from a state where `isSynced && protocol._tag === 'Settled'`.** A wallet synced from genesis on a chain that already forked passes through `Crossing` during its initial sync.

### Lifecycle entries

`state.lifecycle` lists every transaction the wallet is tracking, from balancing until its TTL passes, each with a tagged `status`: `Balanced`, `Finalized`, `Submitted` (still awaiting a result), or `Confirmed`, `PartialSuccess`, `Rejected`, `Orphaned`, `Expired`, `Reverted` (ended). Use `isAwaiting(entry)` (from `@midnightntwrk/wallet-sdk-facade`) to tell the two apart; ended entries stay in the list until their TTL passes, so don't rely on the list being empty:

```typescript
import { isAwaiting } from '@midnightntwrk/wallet-sdk-facade';

const inFlight = state.lifecycle.filter(isAwaiting).length;
```

## Subscribing to State

`wallet.state()` returns an `Observable<FacadeState>`. Subscribe to receive every state update:

```typescript
import { Subscription } from 'rxjs';

const sub: Subscription = wallet.state().subscribe((facadeState) => {
  console.log('Synced:', facadeState.isSynced);
  console.log('Shielded balances:', facadeState.shielded.balances);
  console.log('Unshielded balances:', facadeState.unshielded.balances);
  console.log('Dust available:', facadeState.dust.availableCoins.length);
});

// Clean up when done
sub.unsubscribe();
```

For a one-shot wait until the wallet is synced and settled:

```typescript
import { firstValueFrom, filter } from 'rxjs';
import * as ledger from '@midnightntwrk/ledger-v9';

const state: FacadeState = await firstValueFrom(
  wallet.state().pipe(filter((s) => s.isSynced && s.protocol._tag === 'Settled')),
);
console.log('Unshielded NIGHT:', state.unshielded.balances[ledger.unshieldedToken().raw]);
```

`wallet.waitForSyncedState()` is still there and resolves on `isSynced` alone; that's fine for reading balances but not enough before building a transaction. Each individual wallet also exposes `waitForSyncedState(allowedGap?)` which accepts an optional `allowedGap` parameter (defaults to `0n`, meaning strictly complete).

## Balance Shapes

### Unshielded

`UnshieldedWalletState` provides:

| Getter | Type | Description |
|--------|------|-------------|
| `balances` | `Record<TokenType, bigint>` | Available balances per token type |
| `totalCoins` | `readonly UtxoWithMeta[]` | All coins (available + pending) |
| `availableCoins` | `readonly UtxoWithMeta[]` | Coins available for spending |
| `pendingCoins` | `readonly UtxoWithMeta[]` | Coins in pending transactions |
| `address` | `UnshieldedAddress` | The wallet's unshielded address |
| `verifyingKey` | `SignatureVerifyingKey` | The key the wallet signs with |
| `progress` | `SyncProgress` | Current sync status |
| `protocolVersion` | `ProtocolVersion` | The protocol version this wallet has reached |

The `balances` record is keyed by the raw token type. The native NIGHT token is keyed by its raw bytes — a 64-zero hex string — accessible via `ledger.unshieldedToken().raw` (the same value as `ledger.nativeToken().raw`). The empty string `""` is **NOT** the native token key; `balances[""]` returns `undefined`. All amounts are `bigint` values in the smallest denomination: **6 decimal places**, so `1_000_000n` equals 1 NIGHT.

```typescript
import * as ledger from '@midnightntwrk/ledger-v9';

const nightBalance = state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
const nightAsDecimal = Number(nightBalance) / 1_000_000;
console.log(`Unshielded NIGHT: ${nightAsDecimal}`);
```

### Shielded

`ShieldedWalletState` follows the same pattern as unshielded, plus cryptographic key getters:

| Getter | Type | Description |
|--------|------|-------------|
| `balances` | `Record<TokenType, bigint>` | Available balances per token type |
| `totalCoins` | `readonly (AvailableCoin \| PendingCoin)[]` | All coins |
| `availableCoins` | `readonly AvailableCoin[]` | Spendable coins |
| `pendingCoins` | `readonly PendingCoin[]` | Coins the wallet expects to receive (not yet confirmed) |
| `reservedCoins` | `readonly ReservedCoin[]` | Coins booked for a transaction that has not settled (held, not spendable) |
| `coinPublicKey` | `ShieldedCoinPublicKey` | Public key for receiving shielded coins |
| `encryptionPublicKey` | `ShieldedEncryptionPublicKey` | Encryption public key |
| `address` | `ShieldedAddress` | The wallet's shielded address |
| `progress` | `SyncProgress` | Current sync status |

Shielded balances are keyed the same way; the shielded native token is `ledger.shieldedToken().raw`. Shielded balances are privacy-preserving: they are only visible to the wallet holder. On-chain observers cannot see shielded coin values or link them to an address.

### Dust

`DustWalletState` has a different shape because DUST tokens are **time-dependent** (they expire). Instead of a simple `balances` getter, it provides methods that require a `Date` parameter:

| Getter / Method | Type | Description |
|-----------------|------|-------------|
| `totalCoins` | `readonly DustFullInfo[]` | All dust coins |
| `availableCoins` | `readonly DustFullInfo[]` | Available dust coins, with full metadata |
| `pendingCoins` | `readonly DustFullInfo[]` | Pending dust coins |
| `publicKey` | `bigint` | The dust wallet's public key |
| `address` | `DustAddress` | The dust wallet's address |
| `progress` | `SyncProgress` | Current sync status |
| `balance(time: Date)` | `Balance` | Balance at the given time (expired DUST excluded) |
| `estimateDustGeneration(nightUtxos, currentTime)` | `readonly UtxoWithFullDustDetails[]` | Estimate DUST yield from NIGHT UTXOs |

1.x's `availableCoinsWithFullInfo(time)` is gone; `availableCoins` now carries the full info.

The time parameter is required because DUST tokens have an expiry. Calling `balance(new Date())` gives you the current valid balance, excluding any expired DUST.

### Clock injection

The facade accepts an optional `Clock` (`{ readonly now: () => Date }`)
so that time-sensitive operations can use a deterministic time source. This is
useful for tests where you want to control "now". Pass it as the `clock`
factory in `WalletFacade.init`'s parameters (next to `shielded` / `unshielded` /
`dust`, not inside `configuration`; see `wallet-construction.md`).
The default is `Clock.systemClock` (the `Clock` namespace is exported from
`@midnightntwrk/wallet-sdk-facade`), which delegates to `new Date()`.

```typescript
const dustBalance = state.dust.balance(new Date());
console.log('Current DUST balance:', dustBalance);

// Estimate how much DUST your NIGHT UTXOs will generate
// Use wallet.estimateRegistration() — it handles the internal type conversion
const nightUtxos = state.unshielded.availableCoins;
const { fee, dustGenerationEstimations } = await wallet.estimateRegistration(nightUtxos);
```

See [transactions.md](transactions.md) for how to register NIGHT UTXOs for dust generation.

## SyncProgress

The `SyncProgress` interface tracks how far the wallet has synced relative to the chain head:

```typescript
interface SyncProgress {
  readonly appliedIndex: bigint;
  readonly highestIndex: bigint;
  readonly highestRelevantIndex: bigint;
  readonly highestRelevantWalletIndex: bigint;
  readonly isConnected: boolean;

  isStrictlyComplete(): boolean;
  isCompleteWithin(maxGap?: bigint): boolean;
}
```

| Field | Description |
|-------|-------------|
| `appliedIndex` | The last block index the wallet has processed |
| `highestIndex` | The highest block index known on the chain |
| `highestRelevantIndex` | The highest block index relevant to any wallet |
| `highestRelevantWalletIndex` | The highest block index relevant to this specific wallet |
| `isConnected` | Whether the wallet is currently connected to the indexer |

**Methods:**

- **`isStrictlyComplete()`** -- Returns `true` when the wallet has processed all relevant blocks with zero gap. Equivalent to `isCompleteWithin(0n)`. Use this when you need a precise, fully-synced state (e.g., before reading balances or constructing transactions).

- **`isCompleteWithin(maxGap?: bigint)`** -- Returns `true` when the wallet is connected and the gap between `highestRelevantWalletIndex` and `appliedIndex` is at most `maxGap`. The default `maxGap` is **`50n`** when called via the static `SyncProgress.isCompleteWithin()` helper. Use this when a small lag is acceptable (e.g., for UI display where near-real-time is sufficient).

```typescript
// WalletFacade.waitForSyncedState() takes no parameters — it waits for strict sync
// (but not for the protocol phase to settle; see "Protocol phase" above)
const state = await wallet.waitForSyncedState();

// Individual sub-wallets accept an optional allowedGap parameter:
// await wallet.shielded.waitForSyncedState(10n);  // allow up to 10 blocks of lag
```

## UTXO Metadata

The facade exposes UTXO metadata through the `UtxoWithMeta` type:

```typescript
type UtxoWithMeta = {
  utxo: ledger.Utxo; // ledger-v9
  meta: UtxoMeta;
};
```

Where `UtxoMeta` contains:

| Field | Type | Description |
|-------|------|-------------|
| `ctime` | `Date` | When the UTXO was created (block timestamp) |
| `registeredForDustGeneration` | `boolean` | Whether this UTXO has been registered to generate DUST |

The `registeredForDustGeneration` flag is important for dust generation workflows. See [transactions.md](transactions.md) for details on registering UTXOs.

---

**See also:**
- [examples/state-observation.ts](../examples/state-observation.ts) for complete working examples
- [transactions.md](transactions.md) for transaction construction and dust registration
