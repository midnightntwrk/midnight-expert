# Provider Setup Reference

Covers the provider bundle, factory functions, network configuration, and how `walletProvider` and `midnightProvider` relate.

---

## The Provider Bundle

Midnight contract operations take six providers plus a `config` block. The template types the bundle with `ContractProviders<AppContract>` from `@midnight-ntwrk/midnight-js-contracts`, which ties the ZK config provider's circuit IDs to the contract's circuits:

```typescript
import type { ContractProviders } from "@midnight-ntwrk/midnight-js-contracts";

export type Providers = ContractProviders<AppContract>;
```

| Field | Package | Purpose |
|-------|---------|---------|
| `privateStateProvider` | `midnight-js-level-private-state-provider` | LevelDB-backed storage for contract private state |
| `publicDataProvider` | `midnight-js-indexer-public-data-provider` | GraphQL client for indexer queries and subscriptions |
| `zkConfigProvider` | `midnight-js-node-zk-config-provider` | Locates compiled ZK circuit files on disk |
| `proofProvider` | `midnight-js-http-client-proof-provider` | HTTP client for the proof server |
| `walletProvider` | Built from `WalletFacade` | `balanceTx`, `getCoinPublicKey`, `getEncryptionPublicKey` |
| `midnightProvider` | Same object as `walletProvider` | `submitTx` (transaction submission) |
| `config` | Plain object | `networkId` and `ttlSeconds`, applied to every transaction |

---

## `createProviders()` Factory

```typescript
export async function createProviders(
  facade: WalletFacade,
  keystore: UnshieldedKeystore,
  privateStateStoreName: string,
): Promise<Providers> {
  const walletProvider = await createWalletProvider(facade, keystore);
  const zkConfigProvider = new NodeZkConfigProvider<ProvableCircuitId<AppContract>>(ZK_CONFIG_PATH);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      privateStoragePasswordProvider: () => LOCAL_PRIVATE_STATE_PASSWORD,
      accountId: keystore.getBech32Address().toString(),
    }),
    publicDataProvider: indexerPublicDataProvider(DEVNET_CONFIG.indexer, DEVNET_CONFIG.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(DEVNET_CONFIG.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
    config: { networkId: DEVNET_CONFIG.networkId, ttlSeconds: TX_TTL_SECONDS },
  };
}
```

Usage in a command:

```typescript
const ctx = await buildFacade(walletData.seed);
const providers = await createProviders(ctx.facade, ctx.keystore, `${CONTRACT_NAME}-private-state`);
```

---

## `createWalletProvider()`

Midnight.js 5 and the wallet SDK each load their own copy of the ledger, so a transaction crosses between them as bytes. Midnight.js hands the wallet provider a ledger 9 transaction handle; the wallet decodes its bytes with its own ledger copy, seals them with `WalletTransaction.adopt` at the chain's protocol version, balances and signs, and hands bytes back.

`createLedger9WalletProvider` and `createLedger9MidnightProvider` from `@midnight-ntwrk/midnight-js-types` wrap a ledger 9 only implementation. The local devnet starts on ledger 9, so the template serves ledger 9 only; a ledger 8 transaction is refused with `ProviderEraUnsupportedError`. To serve both eras, use `createWalletProviderFromHandlers` with a `v8` and a `v9` handler.

```typescript
import { createLedger9MidnightProvider, createLedger9WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import { WalletTransaction } from "@midnightntwrk/wallet-sdk";
import * as WalletLedger from "@midnightntwrk/wallet-sdk/ledger/v9";

async function adopt<S extends "Unbound" | "Finalized">(facade: WalletFacade, stage: S, bytes: Uint8Array) {
  const binding = stage === "Unbound" ? "pre-binding" : "binding";
  const tx = WalletLedger.Transaction.deserialize("signature", "proof", binding, bytes);
  const state = await waitForSettled(facade);
  return WalletTransaction.adopt(stage, tx, state.activeProtocolVersion);
}

const toBytes = (handle: WalletTransaction) => Buffer.from(WalletTransaction.toWire(handle).transaction, "hex");

const walletProvider = createLedger9WalletProvider({
  getCoinPublicKey: () => shielded.coinPublicKey.toHexString(),
  getEncryptionPublicKey: () => shielded.encryptionPublicKey.toHexString(),
  async balanceTx(tx, ttl) {
    const recipe = await facade.balanceUnboundTransaction(await adopt(facade, "Unbound", tx.serialize()), {
      ttl: ttl ?? new Date(Date.now() + TX_TTL_SECONDS * 1000),
    });
    const signed = await facade.signRecipe(recipe, keystore.signDataAsync);
    return toBytes(await facade.finalizeRecipe(signed));
  },
});
const midnightProvider = createLedger9MidnightProvider(async (tx) =>
  facade.submitTransaction(await adopt(facade, "Finalized", tx.serialize())),
);
```

`createWalletProvider()` returns one object that merges the two, with `supportedEras` taken from the wallet provider. Balancing in wallet SDK 2 takes only the transaction and a TTL: the facade already holds the shielded and DUST keys from `start(seeds)`. Unshielded inputs still need a signature, which `signRecipe` adds with the keystore.

---

## Network Configuration

All endpoints are hardcoded to the local devnet via `DEVNET_CONFIG`:

```typescript
export const DEVNET_CONFIG: NetworkConfig = {
  indexer: "http://127.0.0.1:8088/api/v4/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
  node: "http://127.0.0.1:9944",
  nodeWS: "ws://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
  networkId: "undeployed",
};
```

Midnight.js 5 has no global network ID: `setNetworkId` and the `@midnight-ntwrk/midnight-js-network-id` package are gone. The ID goes where it's used: the wallet configuration, `createKeystore`, address decoding, and the providers' `config.networkId`. The `"undeployed"` network ID is the local devnet and must match the network the wallet was created on.

---

## `walletProvider` and `midnightProvider`

Both fields point to the **same object**. The SDK needs a `WalletProvider` (for `balanceTx`, `getCoinPublicKey`, `getEncryptionPublicKey`) and a `MidnightProvider` (for `submitTx`). Both carry `supportedEras`, which Midnight.js reads before each operation to check that the providers serve the network's ledger era. In this CLI template, one object satisfies both interfaces:

```typescript
return {
  // ...
  walletProvider,
  midnightProvider: walletProvider, // Same object
};
```

This is the standard pattern for Node.js CLIs where one wallet handles both balancing and submission.
