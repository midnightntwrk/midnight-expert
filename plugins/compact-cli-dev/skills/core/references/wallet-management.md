# Wallet Management Reference

> For comprehensive Wallet SDK API reference, see `midnight-wallet:wallet-sdk`. This document covers wallet construction patterns specific to the CLI context.

Covers seed derivation, the three sub-wallets, seed format, WalletFacade construction, persistence, and key utility functions. The template uses wallet SDK 2.0.1 through the single `@midnightntwrk/wallet-sdk` package.

---

## Seed Derivation

The wallet derives one seed per sub-wallet from a 32-byte master seed:

```
Master seed (64 hex chars = 32 bytes)
  └─ WalletSeeds.fromMasterSeed(buffer)
       ├─ seeds.shielded    → ShieldedWallet
       ├─ seeds.unshielded  → UnshieldedWallet (keystore)
       └─ seeds.dust        → DustWallet
```

`WalletSeeds.fromMasterSeed` walks the same HD path wallet SDK 1.x used (account 0, roles Zswap / NightExternal / Dust, index 0), so a seed saved by an older version of the CLI restores the same wallet and addresses.

Implementation from `wallet.ts`:

```typescript
import { WalletSeeds, createKeystore } from "@midnightntwrk/wallet-sdk";

export function deriveSeeds(seed: string): WalletSeeds {
  if (seed.length !== SEED_LENGTH) {
    throw new Error(`Invalid seed length: expected ${String(SEED_LENGTH)} hex chars, got ${String(seed.length)}`);
  }
  return WalletSeeds.fromMasterSeed(Buffer.from(seed, "hex"));
}

export function createWalletKeystore(seeds: WalletSeeds): UnshieldedKeystore {
  return createKeystore({ kind: "schnorr", secret: seeds.unshielded }, DEVNET_CONFIG.networkId);
}
```

---

## Three Sub-Wallets

| Sub-wallet | Seed | Purpose |
|------------|------|---------|
| `ShieldedWallet` | `seeds.shielded` | Privacy-preserving transactions (ZK proofs) |
| `UnshieldedWallet` | `seeds.unshielded` | Public NIGHT transfers, keystore for signing |
| `DustWallet` | `seeds.dust` | DUST fee token management |

All three are combined into a single `WalletFacade`, then started with the seeds:

```typescript
const facade = await WalletFacade.init({
  configuration: {
    networkId: DEVNET_CONFIG.networkId,
    indexerClientConnection: { indexerHttpUrl: DEVNET_CONFIG.indexer, indexerWsUrl: DEVNET_CONFIG.indexerWS },
    relayURL: new URL(DEVNET_CONFIG.nodeWS),
    provingServerUrl: new URL(DEVNET_CONFIG.proofServer),
    costParameters: { additionalFeeOverhead: ADDITIONAL_FEE_OVERHEAD, feeBlocksMargin: FEE_BLOCKS_MARGIN },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
  },
  shielded: (cfg) => ShieldedWallet(cfg).startWithSeed(seeds.shielded),
  unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
  dust: (cfg) => DustWallet(cfg).startWithSeed(seeds.dust),
});
await facade.start(seeds);
```

`start()` takes the seeds rather than key objects, because seeds are the only key material that works on both sides of the ledger 8 / ledger 9 boundary.

### Wait for "Settled", not just synced

Before building a transaction, wait until the wallet is synced **and** all three sub-wallets agree on the protocol version. Until a wallet has caught up past the ledger 9 fork it reports protocol `Crossing`, and a transaction built then can fail with `ProtocolVersionMismatchError`:

```typescript
export function waitForSettled(facade: WalletFacade): Promise<FacadeState> {
  return Rx.firstValueFrom(
    facade.state().pipe(
      Rx.filter((s) => s.isSynced && s.protocol._tag === "Settled"),
      Rx.timeout(WALLET_SYNC_TIMEOUT),
    ),
  );
}
```

---

## Seed Format

- **Length:** 64 hex characters (32 bytes)
- **Generation:** `generateRandomSeed()` from `@midnightntwrk/wallet-sdk`
- **Genesis seed:** `000...001` (64 chars, pre-funded on local devnet)

```typescript
export const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
export const SEED_LENGTH = 64;

export function newSeed(): string {
  return Buffer.from(generateRandomSeed()).toString("hex");
}
```

---

## WalletContext Type

`buildFacade()` returns a started `WalletFacade` and the unshielded keystore that signs for it. The facade holds the shielded and DUST keys itself, so nothing else is needed to build providers:

```typescript
export interface WalletContext {
  facade: WalletFacade;
  keystore: UnshieldedKeystore;
}
```

Usage in commands:

```typescript
const walletData = getWallet(flags.wallet);
const ctx = await buildFacade(walletData.seed);
try {
  const providers = await createProviders(ctx.facade, ctx.keystore, `${CONTRACT_NAME}-private-state`);
  // ...
} finally {
  await ctx.facade.stop();
}
```

Always call `ctx.facade.stop()` in a `finally` block to clean up WebSocket connections.

---

## Persistence

Wallets are stored in `.dapp-state/wallets.json` relative to the project working directory.

```json
{
  "default": {
    "seed": "a1b2c3...64hexchars",
    "address": "mn_addr_undeployed1...",
    "createdAt": "2026-03-31T12:00:00.000Z"
  }
}
```

**File permissions:** `0o600` (owner read/write only). The file contains raw seeds in plaintext and should never be committed.

---

## Key Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `newSeed()` | `() => string` | Generate a random 64-char hex seed |
| `deriveSeeds(seed)` | `(string) => WalletSeeds` | Derive the three sub-wallet seeds from a master seed |
| `createWalletKeystore(seeds)` | `(WalletSeeds) => UnshieldedKeystore` | Build the unshielded signing keystore |
| `buildFacade(seed)` | `(string) => Promise<WalletContext>` | Build and start the wallet from a seed |
| `waitForSettled(facade)` | `(WalletFacade) => Promise<FacadeState>` | Wait until synced and on one protocol version |
| `loadWallets()` | `() => WalletStore` | Read all wallets from disk |
| `saveWallet(name, wallet)` | `(string, StoredWallet) => void` | Persist a single wallet |
| `saveWallets(store)` | `(WalletStore) => void` | Write entire wallet store to disk |
| `getWallet(name)` | `(string) => StoredWallet` | Load one wallet or throw if missing |

---

## WebSocket Polyfill

The wallet SDK uses GraphQL subscriptions over WebSocket. In Node.js, you must install the polyfill before any SDK imports:

```typescript
import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;
```

This is done at the top of `wallet.ts` so that all downstream imports (WalletFacade, providers) have access to the WebSocket global.
