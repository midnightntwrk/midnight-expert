# Building MidnightProviders from DApp Connector in Browser

Reference for assembling the full `MidnightProviders` object in a browser-based DApp using the Lace wallet's DApp Connector API. For the DApp Connector type reference, see `references/connector-api-types.md`. For the Node.js provider pattern using WalletFacade, see `midnight-dapp-dev:midnight-sdk`.

## Browser vs Node.js Provider Differences

| Provider | Node.js (CLI) | Browser (DApp Connector) |
|----------|---------------|--------------------------|
| `walletProvider` | Built from `WalletFacade` | Built from `ConnectedAPI` methods |
| `midnightProvider` | Built from `WalletFacade` | Built from `ConnectedAPI.submitTransaction` |
| `zkConfigProvider` | `NodeZkConfigProvider` (filesystem) | `FetchZkConfigProvider` (HTTP fetch) |
| `privateStateProvider` | `levelPrivateStateProvider` (LevelDB) | In-memory, or `levelPrivateStateProvider` on IndexedDB |
| `publicDataProvider` | Same (`indexerPublicDataProvider`) | Same, but pass the browser `WebSocket` as the third argument |
| `proofProvider` | Same (`httpClientProofProvider`) | Wallet proving (`dappConnectorProofProvider`) or a local proof server (`httpClientProofProvider`) |
| `config` | `{ networkId, ttlSeconds }` | Same, with `networkId` from `api.getConfiguration()` |

Midnight.js 5 has no global network ID: `setNetworkId` and the `@midnight-ntwrk/midnight-js-network-id` package are gone. The network ID goes in the providers' `config` field instead.

## Complete Browser Provider Assembly

This matches `createProviders` in the API template (`core/templates/api/src/index.ts`):

```typescript
import type { ConnectedAPI } from "@midnightntwrk/dapp-connector-api";
import {
  dappConnectorProofProvider,
  dappConnectorWalletProviders,
} from "@midnight-ntwrk/midnight-js-dapp-connector-proof-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import {
  indexerPublicDataProvider,
  type IndexerProviderConfig,
} from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { CostModel } from "@midnight-ntwrk/midnight-js-protocol/v9";
import type {
  MidnightProviders,
  PrivateStateProvider,
  ProofProvider,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex } from "@midnight-ntwrk/midnight-js-utils";

/**
 * "wallet": the connected wallet proves; witness data never leaves it.
 * "local": a proof server you run yourself
 *   (`docker run -p 6300:6300 midnightntwrk/proof-server:9.0.2`).
 */
export type ProvingOptions =
  | { mode: "wallet" }
  | { mode: "local"; proofServerUrl: string };

const TX_TTL_SECONDS = 3600;

export async function createBrowserProviders<PCK extends string, PSI extends string, PS>(
  api: ConnectedAPI,
  privateStateProvider: PrivateStateProvider<PSI, PS>,
  proving: ProvingOptions = { mode: "wallet" },
  zkAssetsUrl: string = window.location.origin,
): Promise<MidnightProviders<PCK, PSI, PS> & { dispose(): Promise<void> }> {
  // 1. The wallet decides the network: endpoints and network ID come from it.
  const config = await api.getConfiguration();

  // 2. Public data provider. Pass the browser WebSocket explicitly: the default
  //    comes from isomorphic-ws, whose browser build has no named export, so it
  //    is undefined once bundled. The positional form is deprecated in 5.0.1.
  const publicDataProvider = indexerPublicDataProvider({
    queryURL: config.indexerUri,
    subscriptionURL: config.indexerWsUri,
    webSocket: globalThis.WebSocket as unknown as IndexerProviderConfig["webSocket"],
  });

  // 3. ZK config provider: fetches keys/, zkir/ and compiler/ over HTTP.
  const zkConfigProvider = new FetchZkConfigProvider<PCK>(zkAssetsUrl, {
    fetchFunc: fetch.bind(globalThis),
  });

  // 4. Proof provider: the wallet, or a proof server you run.
  const proofProvider: ProofProvider =
    proving.mode === "local"
      ? httpClientProofProvider(proving.proofServerUrl, zkConfigProvider)
      : await dappConnectorProofProvider(api, zkConfigProvider, CostModel.initialCostModel());

  // 5. Wallet and midnight providers. Midnight.js builds both from the
  //    connector: balanceTx sends the transaction's bytes to
  //    balanceUnsealedTransaction (the wallet adds DUST fee inputs, signs and
  //    binds it, and picks the TTL, since the connector takes none), and
  //    submitTx reads the transaction ID before handing the bytes to
  //    submitTransaction. Both serve ledger 8 and ledger 9.
  const connector = await dappConnectorWalletProviders(api);

  // The connector reports Bech32m keys; the ledger works with hex.
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await api.getShieldedAddresses();
  const coinPublicKey = parseCoinPublicKeyToHex(shieldedCoinPublicKey, config.networkId);
  const encryptionPublicKey = parseEncPublicKeyToHex(shieldedEncryptionPublicKey, config.networkId);
  const walletProvider: WalletProvider = {
    supportedEras: connector.walletProvider.supportedEras,
    balanceTx: (tx, ttl) => connector.walletProvider.balanceTx(tx, ttl),
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
  };

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider: connector.midnightProvider,
    // 6. Network and TTL for every transaction Midnight.js builds.
    config: { networkId: config.networkId, ttlSeconds: TX_TTL_SECONDS },
    // 7. Close the indexer connection when the wallet disconnects or the
    //    providers are rebuilt.
    dispose: () => publicDataProvider.dispose(),
  };
}
```

## FetchZkConfigProvider

In the browser, ZK artifacts are loaded over HTTP instead of from the filesystem. The second argument is an options object:

```typescript
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";

const zkConfigProvider = new FetchZkConfigProvider<MyCircuits>(
  window.location.origin,                // Base URL the assets are served from
  { fetchFunc: fetch.bind(globalThis) }, // Bound fetch function
);
```

For each circuit it fetches `keys/<circuit>.prover`, `keys/<circuit>.verifier` and `zkir/<circuit>.bzkir`, and checks them against `compiler/contract-manifest.json`. So the UI must serve the `keys/`, `zkir/` and `compiler/` directories from the contract's managed output, directly under the base URL. With the base URL at the page's origin, copy them into `public/` (the UI template's `copy-contract-keys` script does this):

```
public/
  keys/          # ZK proving/verifying keys
  zkir/          # ZK intermediate representation
  compiler/      # contract-manifest.json
```

To serve them from a subfolder, pass that URL as the base (for example `${window.location.origin}/managed/mycontract`).

## In-Memory Private State Provider

In Midnight.js 5 the `PrivateStateProvider` is scoped per contract. The framework calls `forContract(address)` and reads and writes through what it returns: `{ contractAddress, get, set, remove, clear, exportPrivateStates, importPrivateStates }`. The top level has `forContract`, `clearAll` and the signing-key methods (`setSigningKey`, `getSigningKey`, `removeSigningKey`, `clearSigningKeys`, `exportSigningKeys`, `importSigningKeys`). There is no `setContractAddress` any more.

The API template's in-memory provider keeps both in `Map`s for the life of the page; the export/import methods reject because an ephemeral store has nothing to export:

```typescript
import type {
  ContractPrivateStates,
  PrivateStateProvider,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  ContractAddress,
  SigningKey,
} from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";

export function inMemoryPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<ContractAddress, Map<PSI, PS>>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  const unsupported = (method: string) => async (): Promise<never> => {
    throw new Error(`inMemoryPrivateStateProvider does not support ${method}`);
  };

  const forContract = (address: ContractAddress): ContractPrivateStates<PSI, PS> => {
    assertIsContractAddress(address);
    const contractAddress = address.toLowerCase();
    const scoped = (): Map<PSI, PS> => {
      let m = states.get(contractAddress);
      if (m === undefined) states.set(contractAddress, (m = new Map()));
      return m;
    };
    return {
      contractAddress,
      set: async (id, state) => { scoped().set(id, state); },
      get: async (id) => states.get(contractAddress)?.get(id) ?? null,
      remove: async (id) => { states.get(contractAddress)?.delete(id); },
      clear: async () => { states.delete(contractAddress); },
      exportPrivateStates: unsupported("exportPrivateStates"),
      importPrivateStates: unsupported("importPrivateStates"),
    };
  };

  return {
    forContract,
    clearAll: async () => { states.clear(); },
    setSigningKey: async (address, key) => { signingKeys.set(address, key); },
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => { signingKeys.delete(address); },
    clearSigningKeys: async () => { signingKeys.clear(); },
    exportSigningKeys: unsupported("exportSigningKeys"),
    importSigningKeys: unsupported("importSigningKeys"),
  };
}
```

For private state that survives a reload (a secret key that is the user's on-chain identity, say), use Midnight.js's own `levelPrivateStateProvider`. It runs on IndexedDB in the browser and encrypts under a password:

```typescript
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";

const privateStateProvider = levelPrivateStateProvider<PSI, PS>({
  cryptoBackend: "webcrypto",
  // For a new store, the wallet's coin public key as is. Keep the value an
  // existing store was created with, or it opens a different, empty store.
  accountId: coinPublicKey,
  // Must pass validatePassword (16+ characters, 3 of the 4 character classes,
  // no long repeats or runs like "1234"), or it throws PasswordValidationError.
  privateStoragePasswordProvider: () => getUserPassphrase(),
});
```

## Wallet-Delegated Proving

Instead of running a proof server, the wallet can generate proofs. The `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider` package wraps this into a ready-to-use `ProofProvider`. It returns a Promise, so await it:

```typescript
import { dappConnectorProofProvider } from "@midnight-ntwrk/midnight-js-dapp-connector-proof-provider";
import { CostModel } from "@midnight-ntwrk/midnight-js-protocol/v9";

// httpClientProofProvider uses CostModel.initialCostModel() internally, so
// give the wallet the same one.
const proofProvider = await dappConnectorProofProvider(
  api,
  zkConfigProvider,
  CostModel.initialCostModel(),
);
// Use this in place of httpClientProofProvider when assembling
// MidnightProviders. Witness data never leaves the wallet.
```

Under the hood this calls the DApp Connector's `getProvingProvider(keyMaterialProvider)` to obtain the wallet's proving provider once, then reuses it for every `proveTx`. If you need lower-level access, you can still call `api.getProvingProvider(...)` directly:

```typescript
const provingProvider = await api.getProvingProvider({
  getZKIR: async (loc) => new Uint8Array(await (await fetch(loc)).arrayBuffer()),
  getProverKey: async (loc) => new Uint8Array(await (await fetch(loc)).arrayBuffer()),
  getVerifierKey: async (loc) => new Uint8Array(await (await fetch(loc)).arrayBuffer()),
});
```

## Full Integration Example

Combining the DApp Connector with contract deployment in a React 19.x component:

```typescript
"use client";

import { useCallback } from "react";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-js";
import { Contract } from "../managed/mycontract/contract/index.js";
import { witnesses } from "../witnesses.js";
import type { ConnectedAPI } from "@midnightntwrk/dapp-connector-api";
import { createBrowserProviders, inMemoryPrivateStateProvider } from "../providers.js";

// withCompiledFileAssets is required by the type. In the browser, Midnight.js
// reads the keys and ZKIR through providers.zkConfigProvider, not from this path.
const compiledContract = CompiledContract.make("mycontract", Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets("managed/mycontract"),
);

function useContractDeployment(api: ConnectedAPI) {
  const deploy = useCallback(async (initialSecret: Uint8Array) => {
    const privateStateProvider = inMemoryPrivateStateProvider();
    const providers = await createBrowserProviders(api, privateStateProvider);

    return deployContract(providers, {
      compiledContract,
      privateStateId: "myContractState",
      initialPrivateState: { secretKey: initialSecret },
    });
  }, [api]);

  return { deploy };
}
```

To join an existing contract, call `findDeployedContract(providers, { contractAddress, compiledContract, privateStateId })`. If the options object has an `initialPrivateState` key (even `undefined`), it is stored under `privateStateId` and replaces what is there. Leave the key out to reuse the private state this browser already holds for the contract.

## Proof Server Considerations

Recommend wallet proving or a proof server the user runs. A proof server sees the proof inputs, including witness data, so do not send them to one someone else runs.

| Scenario | Proving | Notes |
|----------|---------|-------|
| Default | Wallet (`dappConnectorProofProvider`) | Nothing else to run; witness data stays in the wallet |
| Local development or privacy-sensitive | `http://127.0.0.1:6300` | `docker run -p 6300:6300 midnightntwrk/proof-server:9.0.2` |
| Hosted or public proof server | Avoid | Whoever runs it sees your proof inputs |

`Configuration.proverServerUri` is deprecated in the connector API in favor of `getProvingProvider`. For a local proof server, pass its URL explicitly (the template's `DEFAULT_PROOF_SERVER_URL` is `http://127.0.0.1:6300`) rather than deriving it from the node URI.
