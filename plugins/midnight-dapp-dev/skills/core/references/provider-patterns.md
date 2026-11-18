# Provider Patterns

Every Midnight browser DApp assembles 6 providers, plus a `config` field,
before it can deploy or interact with a contract. These providers are the
bridge between the browser environment, the wallet extension, the Midnight
indexer, and whatever generates proofs. This document is the authoritative
reference for how they work, how they are configured, and how they differ
between browser and Node.js environments. The code matches the API template
(`core/templates/api/src/index.ts`), which targets Midnight.js 5.0.1 and
ledger 9, the ledger every public network runs.

## The 6 Providers

### 1. publicDataProvider

**Purpose:** Reads on-chain contract state from the Midnight indexer.

**Interface:** `PublicDataProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** Created via `indexerPublicDataProvider()` from
`@midnight-ntwrk/midnight-js-indexer-public-data-provider`. Takes
`indexerUri` (HTTP endpoint for queries), `indexerWsUri` (WebSocket endpoint
for real-time state subscriptions) and, in the browser, the `WebSocket`
constructor.

```typescript
import {
  indexerPublicDataProvider,
  type IndexerProviderConfig,
} from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

const publicDataProvider = indexerPublicDataProvider({
  queryURL: config.indexerUri,
  subscriptionURL: config.indexerWsUri,
  // The default comes from isomorphic-ws, whose browser build has no named
  // WebSocket export, so it is undefined once bundled. Pass the browser's own.
  webSocket: globalThis.WebSocket as unknown as IndexerProviderConfig['webSocket'],
});
```

The positional form `indexerPublicDataProvider(queryURL, subscriptionURL, webSocket)`
still works but is deprecated in 5.0.1. The provider holds a WebSocket open:
call `publicDataProvider.dispose()` when the wallet disconnects or the providers
are rebuilt.

The WebSocket connection enables `contractStateObservable()`, which pushes
state updates whenever a transaction modifies the contract's public ledger.
This is the primary mechanism for keeping the UI in sync with on-chain state.
State comes back still serialized and tagged with the ledger era that wrote
it; see `state-management.md` for decoding it.

### 2. zkConfigProvider

**Purpose:** Loads the zero-knowledge artifacts (prover and verifier keys and
ZKIR) needed to construct and verify proofs.

**Interface:** `ZKConfigProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** Created via `FetchZkConfigProvider` from
`@midnight-ntwrk/midnight-js-fetch-zk-config-provider`. In the browser,
the artifacts are served as static assets, by default from the application's
origin. The second argument is an options object.

```typescript
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';

const zkConfigProvider = new FetchZkConfigProvider<ContractCircuits>(
  window.location.origin,
  { fetchFunc: fetch.bind(globalThis) },
);
```

The generic type parameter corresponds to your contract's circuit identifiers.
For each circuit the provider fetches `keys/<circuit>.prover`,
`keys/<circuit>.verifier` and `zkir/<circuit>.bzkir`, and checks them against
`compiler/contract-manifest.json`. Serve the `keys/`, `zkir/` and `compiler/`
directories from the contract's managed output under the base URL (the UI
template's `copy-contract-keys` script copies them into `public/`).

### 3. proofProvider

**Purpose:** Generates zero-knowledge proofs for transactions.

**Interface:** `ProofProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** Either the connected wallet proves, or a proof
server the user runs does.

```typescript
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { CostModel } from '@midnight-ntwrk/midnight-js-protocol/v9';

// The wallet proves (ConnectedAPI.getProvingProvider). Returns a Promise.
const proofProvider = await dappConnectorProofProvider(
  connectedApi,
  zkConfigProvider,
  CostModel.initialCostModel(),
);

// Or a local proof server:
//   docker run -p 6300:6300 midnightntwrk/proof-server:9.0.2
const localProofProvider = httpClientProofProvider('http://127.0.0.1:6300', zkConfigProvider);
```

Wallet proving needs nothing else running, and witness data never leaves the
wallet. A local proof server is the other good option. Avoid hosted or public
proof servers: whoever runs one sees your proof inputs.

### 4. walletProvider

**Purpose:** Provides the user's public keys and transaction balancing. This
is the provider that bridges the wallet's signing capabilities into the
Midnight SDK's transaction pipeline.

**Interface:** `WalletProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** `dappConnectorWalletProviders(connectedApi)` from
`@midnight-ntwrk/midnight-js-dapp-connector-proof-provider` builds the wallet
provider and the midnight provider (section 5) from the `ConnectedAPI` the
wallet extension returns. Both serve ledger 8 and ledger 9. It returns the
connector's keys as the wallet reports them, in Bech32m, while the ledger works
with hex, so override the two key getters:

```typescript
import { dappConnectorWalletProviders } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import type { WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex } from '@midnight-ntwrk/midnight-js-utils';

const connector = await dappConnectorWalletProviders(connectedApi);

// getShieldedAddresses() returns Bech32m keys; convert them to hex once.
const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
  await connectedApi.getShieldedAddresses();
const coinPublicKey = parseCoinPublicKeyToHex(shieldedCoinPublicKey, config.networkId);
const encryptionPublicKey = parseEncPublicKeyToHex(shieldedEncryptionPublicKey, config.networkId);

const walletProvider: WalletProvider = {
  supportedEras: connector.walletProvider.supportedEras,
  balanceTx: (tx, ttl) => connector.walletProvider.balanceTx(tx, ttl),
  // getCoinPublicKey / getEncryptionPublicKey are synchronous.
  getCoinPublicKey: () => coinPublicKey,
  getEncryptionPublicKey: () => encryptionPublicKey,
};
```

The `balanceTx` method is critical: it takes a proven (unbound) transaction
and sends its bytes, hex-encoded, to the wallet's `balanceUnsealedTransaction`.
The wallet adds DUST fee inputs, signs and binds (finalizes) it. The connector
takes no TTL, so the wallet picks the expiry and the `ttl` argument is not
forwarded. The library checks that the wallet's answer is a finalized
transaction of the right ledger before handing it back.

### 5. midnightProvider

**Purpose:** Submits signed, balanced, proven transactions to the Midnight
network.

**Interface:** `MidnightProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** The `midnightProvider` that
`dappConnectorWalletProviders` returns, used as is:

```typescript
const midnightProvider = connector.midnightProvider;
```

Its `submitTx` reads the transaction ID from the transaction's own
`identifiers()` (the same ID the indexer reports) and refuses a transaction
without one, before anything is broadcast. Then it hands the bytes to the
wallet's `submitTransaction`, which resolves to `void` and handles the network
communication.

### 6. privateStateProvider

**Purpose:** Stores the DApp's private (off-chain) state. This is state that
is known only to the current user and is never published on-chain.

**Interface:** `PrivateStateProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** The template uses an in-memory provider that
lives for the page session. For private state that must survive a reload,
use Midnight.js's `levelPrivateStateProvider`, which runs on IndexedDB in the
browser (see `state-management.md`).

In Midnight.js 5 the provider is scoped per contract. The framework calls
`forContract(address)` and reads and writes through what it returns:
`{ contractAddress, get, set, remove, clear, exportPrivateStates,
importPrivateStates }`. The top level has `forContract`, `clearAll` and the
signing-key methods (`setSigningKey`, `getSigningKey`, `removeSigningKey`,
`clearSigningKeys`, `exportSigningKeys`, `importSigningKeys`). There is no
`setContractAddress`. A minimal in-memory implementation, as in the template's
`private-state.ts`:

```typescript
import type { ContractPrivateStates, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import type {
  ContractAddress,
  SigningKey,
} from '@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js-utils';

function inMemoryPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
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
      exportPrivateStates: unsupported('exportPrivateStates'),
      importPrivateStates: unsupported('importPrivateStates'),
    };
  };

  return {
    forContract,
    clearAll: async () => { states.clear(); },
    setSigningKey: async (address, key) => { signingKeys.set(address, key); },
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => { signingKeys.delete(address); },
    clearSigningKeys: async () => { signingKeys.clear(); },
    exportSigningKeys: unsupported('exportSigningKeys'),
    importSigningKeys: unsupported('importSigningKeys'),
  };
}
```

### The config field

`MidnightProviders` also has a required `config: { networkId, ttlSeconds }`.
Midnight.js 5 has no global network ID (`setNetworkId` and the
`@midnight-ntwrk/midnight-js-network-id` package are gone), so the network ID
goes here, taken from `getConfiguration().networkId`. `ttlSeconds` is how long
a built transaction stays valid; the template uses 3600. The wallet behind the
DApp Connector picks its own TTL for what it adds.

## DApp Connector API Types

Wallet extensions expose the DApp Connector API through `window.midnight`, each
under its own key (Lace also aliases itself at `mnLace`). The API surface is
defined in `@midnightntwrk/dapp-connector-api` 4.1.0, the npm scope
Midnight.js 5 depends on.

### InitialAPI

The entry point for wallet interaction. Available before the user approves
the connection.

| Property     | Type                                      | Description                                  |
| ------------ | ----------------------------------------- | -------------------------------------------- |
| `name`       | `string`                                  | Wallet display name (e.g., "Lace")           |
| `icon`       | `string`                                  | Base64 or data URI of the wallet icon         |
| `apiVersion` | `string`                                  | Version of the `@midnightntwrk/dapp-connector-api` package the wallet implements (e.g., "4.1.0") |
| `rdns`       | `string`                                  | Reverse DNS identifier                       |
| `connect`    | `(networkId: string) => Promise<ConnectedAPI>` | Hints the desired network id, requests user approval, returns the connected API |

The `connect()` method prompts the user to approve the DApp in the wallet
extension popup. The `networkId` parameter hints the desired network:
`"undeployed"` (local devnet), `"preview"`, `"preprod"` or `"mainnet"`. The UI
template reads it from `import.meta.env.VITE_NETWORK_ID` and defaults to
`"undeployed"`.

### ConnectedAPI

The full API surface available after the user approves the connection.

| Method                          | Return Type                                                                          | Description                                          |
| ------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `getConfiguration()`           | `Promise<Configuration>`                                                             | Returns all network endpoints                        |
| `getShieldedAddresses()`       | `Promise<{ shieldedAddress; shieldedCoinPublicKey; shieldedEncryptionPublicKey }>`  | Shielded address plus the coin/encryption public keys (all Bech32m) |
| `getUnshieldedAddress()`       | `Promise<{ unshieldedAddress }>`                                                    | Unshielded (public) address (Bech32m)                |
| `getDustAddress()`             | `Promise<{ dustAddress }>`                                                           | Dust address (Bech32m)                               |
| `getShieldedBalances()`        | `Promise<Record<string, bigint>>`                                                   | Shielded token balances by token type                |
| `getUnshieldedBalances()`      | `Promise<Record<string, bigint>>`                                                   | Unshielded token balances by token type              |
| `getDustBalance()`             | `Promise<{ balance; cap }>`                                                          | Dust balance and max cap                             |
| `balanceUnsealedTransaction()` | `Promise<{ tx: string }>`                                                            | Adds DUST fee inputs, signs and binds; takes/returns serialized hex |
| `submitTransaction()`          | `Promise<void>`                                                                      | Broadcasts to the network (no return value)          |
| `signData()`                   | `Promise<Signature>`                                                                | Signs arbitrary data                                 |
| `getProvingProvider()`         | `Promise<ProvingProvider>`                                                           | Returns the wallet's proving provider (if available) |

### Configuration

Returned by `getConfiguration()`. Contains all network endpoints needed to
assemble the 6 providers.

```typescript
interface Configuration {
  indexerUri: string;       // HTTP endpoint for the indexer (queries)
  indexerWsUri: string;     // WebSocket endpoint for the indexer (subscriptions)
  proverServerUri?: string; // Deprecated: use getProvingProvider instead
  substrateNodeUri: string; // Substrate node RPC endpoint
  networkId: string;        // e.g. "undeployed", "preview", "preprod", "mainnet"
}
```

### APIError

Errors from the DApp Connector API are plain objects, not class instances.
This is a critical distinction for error handling.

```typescript
type ErrorCode =
  | "PermissionRejected"
  | "Disconnected"
  | "InternalError"
  | "InvalidRequest"
  | "Rejected"
  | "InsufficientFunds";

type APIError = Error & {
  type: "DAppConnectorAPIError";
  code: ErrorCode;
  reason: string;
};
```

`ErrorCode` is a union of string literals (exposed via the `ErrorCodes`
constant object), not a TypeScript `enum`. Compare against the string values
directly.

**Never use `instanceof` to check for API errors.** The error objects are
serialized across the extension boundary and lose their prototype chain. Always
check the `type` property:

```typescript
try {
  const api = await initialApi.connect("undeployed");
} catch (error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as APIError).type === "DAppConnectorAPIError"
  ) {
    const apiError = error as APIError;
    switch (apiError.code) {
      case "PermissionRejected":
        // User declined the connection in Lace
        break;
      case "InternalError":
        // Something went wrong inside Lace
        break;
    }
  }
}
```

### ErrorCode Values

| Code                 | Meaning                                          |
| -------------------- | ------------------------------------------------ |
| `PermissionRejected` | Permission to perform the action was rejected    |
| `Rejected`           | The user rejected the request                    |
| `InternalError`      | Internal wallet error                            |
| `InvalidRequest`     | Malformed request to the wallet (e.g. a malformed transaction) |
| `Disconnected`       | The connection to the wallet was lost            |
| `InsufficientFunds`  | The request is valid but the wallet lacks the balance (added in 4.1.0) |

## Wallet-Driven Configuration

All network endpoints originate from the Lace wallet's `getConfiguration()`
method. This is a deliberate design decision in the Midnight ecosystem: the
wallet is the single source of truth for which network the user is connected
to.

**Why this matters:**

1. **No hardcoded URLs.** The DApp does not contain any network endpoints in
   its source code or environment variables. The user selects a network in
   Lace's settings, and the DApp automatically connects to the correct
   indexer and node. The network ID for the providers' `config` comes from
   here too.

2. **Network switching is seamless.** If the user switches from Preview to
   another network in Lace, re-connecting the DApp picks up the new
   endpoints automatically.

3. **Deployment simplicity.** The same DApp build works on any network
   without configuration changes.

## Choosing Where Proofs Are Generated

The connector's `Configuration.proverServerUri` is deprecated in favor of
`getProvingProvider`. Choose proving explicitly instead of deriving a proof
server URL from the node URI. The template's `ProvingOptions` is either
`{ mode: "wallet" }` (the default; the wallet proves) or
`{ mode: "local", proofServerUrl }` for a proof server the user runs, with
`DEFAULT_PROOF_SERVER_URL = "http://127.0.0.1:6300"`. Do not point a DApp at a
hosted proof server: it sees the proof inputs.

## The createProviders() Factory Pattern

The recommended pattern is a single factory function that takes a
`ConnectedAPI` and returns all the providers ready for use. This is the API
template's version:

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
import {
  ContractState as LedgerContractState,
  type ChargedState,
} from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import type {
  ContractStateRead,
  ProofProvider,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import {
  parseCoinPublicKeyToHex,
  parseEncPublicKeyToHex,
} from "@midnight-ntwrk/midnight-js-utils";
import { combineLatest, from, map, Observable, retry } from "rxjs";
import { inMemoryPrivateStateProvider } from "./private-state.js";
import type {
  AppProviders,
  ContractState,
  DerivedState,
  ImpureCircuitKeys,
  PrivateState,
} from "./types.js";
import { PRIVATE_STATE_ID } from "./types.js";

export { inMemoryPrivateStateProvider } from "./private-state.js";
export type {
  AppProviders,
  ContractState,
  DerivedState,
  ImpureCircuitKeys,
  PrivateState,
} from "./types.js";
export { PRIVATE_STATE_ID } from "./types.js";

/**
 * Where ZK proofs get generated.
 *  - "wallet": the connected wallet proves (ConnectedAPI.getProvingProvider).
 *    Nothing else to run, and witness data never leaves the wallet.
 *  - "local": a proof server you run yourself, such as
 *    `docker run -p 6300:6300 midnightntwrk/proof-server:9.0.2`.
 * Avoid public or hosted proof servers: whoever runs one sees your proof inputs.
 */
export type ProvingOptions =
  | { mode: "wallet" }
  | { mode: "local"; proofServerUrl: string };

export const DEFAULT_PROOF_SERVER_URL = "http://127.0.0.1:6300";

/**
 * How long a built transaction stays valid (Midnight.js 5's
 * `config.ttlSeconds`). The wallet behind the DApp Connector picks its own TTL
 * for what it adds; this one covers the contract call Midnight.js builds.
 */
const TX_TTL_SECONDS = 3600;

export interface CreateProvidersOptions {
  proving?: ProvingOptions;
  /**
   * Where the compiled contract's `keys/`, `zkir/` and `compiler/` directories
   * are served from. Defaults to the page's own origin, so copy them into the
   * UI's `public/` folder (see the UI's `copy-contract-keys` script).
   */
  zkAssetsUrl?: string;
}

/**
 * The providers, plus dispose() to close the indexer connection. Call it when
 * the wallet disconnects or the providers are rebuilt.
 */
export type ConnectedProviders = AppProviders & { dispose(): Promise<void> };

export async function createProviders(
  api: ConnectedAPI,
  { proving = { mode: "wallet" }, zkAssetsUrl = window.location.origin }: CreateProvidersOptions = {},
): Promise<ConnectedProviders> {
  // The wallet decides which network the DApp is on. Everything below (indexer
  // endpoints, network ID for address decoding and the providers' config)
  // follows from its configuration. Midnight.js 5 has no global network ID.
  const config = await api.getConfiguration();

  // Pass the browser's WebSocket explicitly: the provider's default comes from
  // isomorphic-ws, whose browser build has no named WebSocket export, so it is
  // undefined once bundled.
  const publicDataProvider = indexerPublicDataProvider({
    queryURL: config.indexerUri,
    subscriptionURL: config.indexerWsUri,
    webSocket: globalThis.WebSocket as unknown as IndexerProviderConfig["webSocket"],
  });

  const privateStateProvider = inMemoryPrivateStateProvider<
    typeof PRIVATE_STATE_ID,
    PrivateState
  >();

  // Fetches keys/<circuit>.{prover,verifier} and zkir/<circuit>.bzkir, and
  // checks them against compiler/contract-manifest.json.
  const zkConfigProvider = new FetchZkConfigProvider<ImpureCircuitKeys>(zkAssetsUrl, {
    fetchFunc: fetch.bind(globalThis),
  });

  const proofProvider: ProofProvider =
    proving.mode === "local"
      ? httpClientProofProvider(proving.proofServerUrl, zkConfigProvider)
      : // httpClientProofProvider uses CostModel.initialCostModel() internally,
        // so the wallet gets the same one.
        await dappConnectorProofProvider(api, zkConfigProvider, CostModel.initialCostModel());

  // Midnight.js builds the wallet and midnight providers from the connector:
  // balanceTx sends the transaction's bytes to balanceUnsealedTransaction (the
  // wallet adds DUST fee inputs, signs and binds it; the connector takes no
  // TTL, so the wallet picks the expiry) and submitTx reads the transaction ID
  // before handing the bytes to submitTransaction. Both serve ledger 8 and 9.
  const connector = await dappConnectorWalletProviders(api);

  // The connector reports Bech32m-encoded keys; the ledger works with hex, so
  // normalize both. parse*ToHex passes hex through unchanged.
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await api.getShieldedAddresses();
  const coinPublicKey = parseCoinPublicKeyToHex(shieldedCoinPublicKey, config.networkId);
  const encryptionPublicKey = parseEncPublicKeyToHex(
    shieldedEncryptionPublicKey,
    config.networkId,
  );
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
    config: { networkId: config.networkId, ttlSeconds: TX_TTL_SECONDS },
    dispose: () => publicDataProvider.dispose(),
  };
}
```

`AppProviders` is `MidnightProviders<ImpureCircuitKeys, typeof PRIVATE_STATE_ID,
PrivateState>` from the template's `types.ts`: provable circuit ids first,
private-state id second, private-state type third.

This factory is called once after wallet connection succeeds and stored in a
React Context so all components can access the providers.

## WalletProvider and balanceTx

The `walletProvider.balanceTx` method is the SDK's abstraction over the
wallet's `balanceUnsealedTransaction`. When the SDK constructs a transaction
(e.g., from `callTx`), it is first proven by the proof provider. The proven,
unbound transaction then needs fee inputs. `balanceTx` sends it to the
wallet, which:

1. Adds DUST fee inputs (and any inputs and outputs needed to balance it)
2. Signs it
3. Binds (finalizes) the transaction
4. Returns the balanced, bound transaction

The DApp Connector exchanges transactions as serialized hex strings.
`dappConnectorWalletProviders` hex-encodes the transaction's bytes for
`balanceUnsealedTransaction`, checks that the `{ tx }` the wallet returns is
even-length hex for a finalized transaction of the same ledger, and hands it
back to Midnight.js. Midnight.js passes a `ttl` as the second argument, but the
connector has no ttl parameter, so the wallet uses its own.

## MidnightProvider and submitTx

The `midnightProvider` comes from `dappConnectorWalletProviders` unchanged. Its
`submitTx` reads the `TransactionId` from the transaction's own `identifiers()`
first, and refuses a transaction without one before anything is broadcast.
Then it sends the hex-encoded bytes to the wallet's `submitTransaction`, which
forwards them to the node and resolves to `void`. The ID is what you track for
confirmation through the indexer.

## Browser vs Node.js Differences

Several providers have different implementations depending on the runtime:

| Provider             | Browser                        | Node.js (CLI tools)               |
| -------------------- | ------------------------------ | --------------------------------- |
| `zkConfigProvider`   | `FetchZkConfigProvider` (HTTP) | `NodeZkConfigProvider` (file system) |
| `privateStateProvider` | In-memory, or `levelPrivateStateProvider` on IndexedDB | `levelPrivateStateProvider` on disk |
| `walletProvider`     | Wallet extension (`dappConnectorWalletProviders`, keys converted to hex) | WalletFacade, with `createLedger9WalletProvider` |
| `midnightProvider`   | Wallet extension (`dappConnectorWalletProviders`) | WalletFacade, with `createLedger9MidnightProvider` |
| `publicDataProvider` | `indexerPublicDataProvider`, with the browser `WebSocket` passed in | `indexerPublicDataProvider` |
| `proofProvider`      | Wallet (`dappConnectorProofProvider`) or local proof server | `httpClientProofProvider` |
| `config`             | `networkId` from `getConfiguration()` | `networkId` from your own settings |

In the browser, the wallet extension handles key management and transaction
submission, and can also generate proofs. In Node.js (CLI tools, integration
tests), you manage keys directly and submit transactions without a wallet
extension.

The `publicDataProvider` talks to the indexer over HTTP and WebSocket in both
environments; the browser just has to hand it the `WebSocket` constructor.

## Wallet Setup

Lace is the reference Midnight wallet, but any wallet that implements the DApp
Connector API also works — discover wallets by enumerating
`Object.values(window.midnight)` and matching on `name`/`rdns`. The setup below
uses Lace as the reference; its requirements are:

1. **Chrome browser.** Lace is a Chrome extension (Chromium-based browsers
   also work).
2. **Install Lace.** Available from the Chrome Web Store or the Midnight
   documentation portal.
3. **Select the Midnight network.** In Lace settings, switch to the
   network the DApp asks for (Preview or Preprod for development, or
   Undeployed for a local devnet).
4. **Fund the wallet.** Use the network's faucet to receive test tokens. The
   faucet URL is available in the Midnight documentation.
5. **Connect to the DApp.** When the DApp calls `connect()`, Lace shows a
   popup asking the user to approve the connection. The user must approve
   before the DApp can access `ConnectedAPI`.

Each wallet injects an `InitialAPI` under its own key in `window.midnight` (a
UUID; Lace also aliases itself at `mnLace`). Detect availability by enumerating
the injected wallets rather than assuming a fixed key:

```typescript
function isWalletAvailable(): boolean {
  if (typeof window === "undefined" || !window.midnight) return false;
  return Object.values(window.midnight).some(
    (w) => w != null && typeof w.connect === "function",
  );
}
```

If the wallet is not available, the DApp should show an install prompt rather
than failing silently.
