# Wallet Management Reference

> For comprehensive Wallet SDK API reference, see `midnight-wallet:wallet-sdk`. This document covers wallet construction patterns specific to the CLI context.

Covers HD key derivation, the three sub-wallets, seed format, WalletFacade construction, persistence, and key utility functions.

---

## HD Derivation Flow

The Midnight wallet uses hierarchical deterministic (HD) key derivation from a hex seed:

```
Seed (64 hex chars = 32 bytes)
  └─ HDWallet.fromSeed(buffer)
       └─ selectAccount(0)
            └─ selectRoles([Zswap, NightExternal, Dust])
                 └─ deriveKeysAt(0)
                      ├─ keys[Roles.Zswap]          → ShieldedWallet
                      ├─ keys[Roles.NightExternal]   → UnshieldedWallet (keystore)
                      └─ keys[Roles.Dust]            → DustWallet
```

Implementation from `wallet.ts`:

```typescript
import { HDWallet, Roles, generateRandomSeed } from "@midnightntwrk/wallet-sdk-hd";

export function deriveKeys(seed: string): {
  zswap: Uint8Array;
  nightExternal: Uint8Array;
  dust: Uint8Array;
} {
  if (seed.length !== SEED_LENGTH) {
    throw new Error(`Invalid seed length: expected ${String(SEED_LENGTH)} hex chars`);
  }
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk") {
    throw new Error("Invalid seed: HD wallet derivation failed");
  }
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== "keysDerived") {
    throw new Error("Key derivation failed");
  }
  hdWallet.hdWallet.clear();
  return {
    zswap: result.keys[Roles.Zswap],
    nightExternal: result.keys[Roles.NightExternal],
    dust: result.keys[Roles.Dust],
  };
}
```

---

## Three Sub-Wallets

Each derived key produces a specialized wallet:

| Sub-wallet | Role | Purpose |
|------------|------|---------|
| `ShieldedWallet` | `Roles.Zswap` | Privacy-preserving transactions (ZK proofs) |
| `UnshieldedWallet` | `Roles.NightExternal` | Public NIGHT transfers, keystore for signing |
| `DustWallet` | `Roles.Dust` | DUST fee token management |

All three are combined into a single `WalletFacade`:

```typescript
const facade = await WalletFacade.init({
  configuration: walletConfig,
  shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (cfg) =>
    UnshieldedWallet({
      ...cfg,
      txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    }).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
  dust: (cfg) =>
    DustWallet(cfg).startWithSecretKey(
      dustSecretKey,
      ledger.LedgerParameters.initialParameters().dust,
    ),
});
```

---

## Seed Format

- **Length:** 64 hex characters (32 bytes)
- **Generation:** `generateRandomSeed()` from `@midnightntwrk/wallet-sdk-hd`
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

The `buildFacade()` function returns a `WalletContext` bundling everything needed for provider construction:

```typescript
export interface WalletContext {
  facade: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  keystore: UnshieldedKeystore;
}
```

Usage in commands:

```typescript
const walletData = getWallet(flags.wallet);
const ctx = await buildFacade(walletData.seed);
try {
  // Use ctx.facade, ctx.shieldedSecretKeys, ctx.dustSecretKey, ctx.keystore
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
| `deriveKeys(seed)` | `(string) => { zswap, nightExternal, dust }` | HD-derive role keys from seed |
| `buildFacade(seed)` | `(string) => Promise<WalletContext>` | Full wallet construction from seed |
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
