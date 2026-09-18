# State and Balances

## FacadeState

`FacadeState` is the top-level state object emitted by a `WalletFacade`. It composes the state of all three wallet types plus pending transaction tracking:

```typescript
class FacadeState {
  public readonly shielded: ShieldedWalletState;
  public readonly unshielded: UnshieldedWalletState;
  public readonly dust: DustWalletState;
  public readonly pending: PendingTransactions<FinalizedTransaction>;

  public get isSynced(): boolean;
}
```

The `isSynced` getter returns `true` only when **all three** sub-wallets report strictly complete sync progress:

```typescript
public get isSynced(): boolean {
  return (
    this.shielded.state.progress.isStrictlyComplete() &&
    this.dust.state.progress.isStrictlyComplete() &&
    this.unshielded.progress.isStrictlyComplete()
  );
}
```

> **Warning:** Do not read balances before `isSynced` returns `true`. Until all wallets have finished their initial sync, balance values are incomplete and will undercount holdings.

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

For a one-shot wait until the wallet is fully synced, use `waitForSyncedState()`:

```typescript
import * as ledger from '@midnight-ntwrk/ledger-v8';

const state: FacadeState = await wallet.waitForSyncedState();
// state.isSynced is guaranteed true
console.log('Shielded NIGHT:', state.shielded.balances[ledger.nativeToken().raw]);
```

Each individual wallet also exposes `waitForSyncedState(allowedGap?)` which accepts an optional `allowedGap` parameter (defaults to `0n`, meaning strictly complete).

## Balance Shapes

### Unshielded

`UnshieldedWalletState` provides:

| Getter | Type | Description |
|--------|------|-------------|
| `balances` | `Record<RawTokenType, bigint>` | Available balances per token type |
| `totalCoins` | `readonly UtxoWithMeta[]` | All coins (available + pending) |
| `availableCoins` | `readonly UtxoWithMeta[]` | Coins available for spending |
| `pendingCoins` | `readonly UtxoWithMeta[]` | Coins in pending transactions |
| `address` | `UnshieldedAddress` | The wallet's unshielded address |
| `progress` | `SyncProgress` | Current sync status |

The `balances` record is keyed by `RawTokenType`. The native NIGHT token is keyed by its raw bytes — a 64-zero hex string — accessible via `ledger.nativeToken().raw`. The empty string `""` is **NOT** the native token key; `balances[""]` returns `undefined`. All amounts are `bigint` values in the smallest denomination: **6 decimal places**, so `1_000_000n` equals 1 NIGHT.

```typescript
import * as ledger from '@midnight-ntwrk/ledger-v8';

const nightBalance = state.unshielded.balances[ledger.nativeToken().raw];
const nightAsDecimal = Number(nightBalance) / 1_000_000;
console.log(`Unshielded NIGHT: ${nightAsDecimal}`);
```

### Shielded

`ShieldedWalletState` follows the same pattern as unshielded, plus cryptographic key getters:

| Getter | Type | Description |
|--------|------|-------------|
| `balances` | `Record<RawTokenType, bigint>` | Available balances per token type |
| `totalCoins` | `readonly (AvailableCoin \| PendingCoin)[]` | All coins |
| `availableCoins` | `readonly AvailableCoin[]` | Spendable coins |
| `pendingCoins` | `readonly PendingCoin[]` | Coins in pending transactions |
| `coinPublicKey` | `ShieldedCoinPublicKey` | Public key for receiving shielded coins |
| `encryptionPublicKey` | `ShieldedEncryptionPublicKey` | Encryption public key |
| `address` | `ShieldedAddress` | The wallet's shielded address |
| `progress` | `SyncProgress` | Current sync status |

The same `ledger.nativeToken().raw` key and `bigint` denomination rules apply. Shielded balances are privacy-preserving: they are only visible to the wallet holder. On-chain observers cannot see shielded coin values or link them to an address.

### Dust

`DustWalletState` has a different shape because DUST tokens are **time-dependent** (they expire). Instead of a simple `balances` getter, it provides methods that require a `Date` parameter:

| Getter / Method | Type | Description |
|-----------------|------|-------------|
| `totalCoins` | `readonly Dust[]` | All dust coins |
| `availableCoins` | `readonly Dust[]` | Available dust coins |
| `pendingCoins` | `readonly Dust[]` | Pending dust coins |
| `publicKey` | `DustPublicKey` | The dust wallet's public key |
| `address` | `DustAddress` | The dust wallet's address |
| `progress` | `SyncProgress` | Current sync status |
| `balance(time: Date)` | `Balance` | Balance at the given time (expired DUST excluded) |
| `availableCoinsWithFullInfo(time: Date)` | `readonly DustFullInfo[]` | Available coins with full metadata at the given time |
| `estimateDustGeneration(nightUtxos, currentTime)` | `readonly UtxoWithFullDustDetails[]` | Estimate DUST yield from NIGHT UTXOs |

The time parameter is required because DUST tokens have an expiry. Calling `balance(new Date())` gives you the current valid balance, excluding any expired DUST.

### Clock injection

The wallet accepts an optional `Clock` (`{ readonly now: () => Date }`)
during construction so that `state.dust.balance(time)` and other
time-sensitive operations can use a deterministic time source. This is
useful for tests where you want to control "now". The `Clock` is set
on `WalletFacade.init`'s configuration (see `wallet-construction.md`).
The default clock is `systemClock` (exported from `@midnightntwrk/wallet-sdk-facade`),
which delegates to `new Date()`.

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
const state = await wallet.waitForSyncedState();

// Individual sub-wallets accept an optional allowedGap parameter:
// await wallet.shielded.waitForSyncedState(10n);  // allow up to 10 blocks of lag
```

## UTXO Metadata

The facade exposes UTXO metadata through the `UtxoWithMeta` type:

```typescript
type UtxoWithMeta = {
  utxo: Utxo;
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
