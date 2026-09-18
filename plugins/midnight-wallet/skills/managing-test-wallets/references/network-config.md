# Network configuration

`DefaultConfiguration` is the configuration object passed to
`WalletFacade.init`. The shape is the same across networks; only the
URLs and the `networkId` change.

## Per-network endpoints

### `undeployed` (local devnet)

```typescript
import { InMemoryTransactionHistoryStorage } from '@midnightntwrk/wallet-sdk-abstractions';
import { WalletEntrySchema, type DefaultConfiguration } from '@midnightntwrk/wallet-sdk-facade';

const configuration: DefaultConfiguration = {
  networkId: 'undeployed',
  // additionalFeeOverhead keeps the fee non-zero on an idle devnet for transfers
  // and contract calls (else error 117). DUST registration is self-funding and
  // doesn't need it. Full explanation in wallet-sdk/references/wallet-construction.md.
  costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 1_000_000n },
  relayURL: new URL('ws://localhost:9944'),
  provingServerUrl: new URL('http://localhost:6300'),
  indexerClientConnection: {
    indexerHttpUrl: 'http://localhost:8088/api/v3/graphql',
    indexerWsUrl: 'ws://localhost:8088/api/v3/graphql/ws',
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
};
```

### `preprod`

```typescript
const configuration: DefaultConfiguration = {
  networkId: 'preprod',
  costParameters: { feeBlocksMargin: 5 },
  relayURL: new URL('wss://rpc.preprod.midnight.network'),
  provingServerUrl: new URL('http://localhost:6300'),  // proof server runs locally
  indexerClientConnection: {
    indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
};
```

### `preview`

```typescript
const configuration: DefaultConfiguration = {
  networkId: 'preview',
  costParameters: { feeBlocksMargin: 5 },
  relayURL: new URL('wss://rpc.preview.midnight.network'),
  provingServerUrl: new URL('http://localhost:6300'),
  indexerClientConnection: {
    indexerHttpUrl: 'https://indexer.preview.midnight.network/api/v3/graphql',
    indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
};
```

## `costParameters.additionalFeeOverhead`

The `preprod`/`preview` examples above omit `additionalFeeOverhead` because public
networks have a real, non-zero fee rate. It is the **local devnet** that needs it:
there the per-block fee rate is ~0, so without an overhead a transfer's or contract
call's fee is 0 and the node rejects it as `NotNormalized` (error 117). DUST
registration is the one operation that does not need it on any network — it is
self-funding (paid by the DUST the registered NIGHT UTXOs generate), so it works
even at a 0 DUST balance. See
[wallet-sdk/references/wallet-construction.md](../../wallet-sdk/references/wallet-construction.md)
for the full mechanism.

## Node WebSocket polyfill

Node 20 lacks a global `WebSocket`; the SDK requires one for indexer
subscriptions. Add the polyfill at the top of any Node script:

```typescript
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;
```

This is unnecessary in browsers.

## ESM project requirement

The `@midnightntwrk/wallet-sdk-*` packages are published as ESM. Your
`package.json` must include `"type": "module"`. CommonJS consumers fail
with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

## Network ID setter (DApp SDK)

If your project also uses `@midnight-ntwrk/midnight-js-network-id`, call
`setNetworkId(networkId)` once at startup so the DApp SDK's helpers know
which network they are operating against.
