# Provider Patterns

Every Midnight browser DApp assembles exactly 6 providers before it can deploy
or interact with a contract. These providers are the bridge between the browser
environment, the Lace wallet extension, the Midnight indexer, and the proof
server. This document is the authoritative reference for how they work, how they
are configured, and how they differ between browser and Node.js environments.

## The 6 Providers

### 1. publicDataProvider

**Purpose:** Reads on-chain contract state from the Midnight indexer.

**Interface:** `PublicDataProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** Created via `indexerPublicDataProvider()` from
`@midnight-ntwrk/midnight-js-indexer-public-data-provider`. Takes two
arguments: `indexerUri` (HTTP endpoint for queries) and `indexerWsUri`
(WebSocket endpoint for real-time state subscriptions).

```typescript
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

const publicDataProvider = indexerPublicDataProvider(
  config.indexerUri,
  config.indexerWsUri,
);
```

The WebSocket connection enables `contractStateObservable()`, which pushes
state updates whenever a transaction modifies the contract's public ledger.
This is the primary mechanism for keeping the UI in sync with on-chain state.

### 2. zkConfigProvider

**Purpose:** Loads the zero-knowledge circuit configuration (`.zkir` files)
needed to construct and verify proofs.

**Interface:** `ZKConfigProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** Created via `FetchZkConfigProvider` from
`@midnight-ntwrk/midnight-js-fetch-zk-config-provider`. In the browser,
circuit files are served as static assets from the application's origin.

```typescript
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';

const zkConfigProvider = new FetchZkConfigProvider<ContractCircuits>(
  window.location.origin,
  fetch,
);
```

The generic type parameter corresponds to your contract's circuit identifiers.
The provider fetches `.zkir` files from the application's public directory at
runtime.

### 3. proofProvider

**Purpose:** Generates zero-knowledge proofs for transactions by communicating
with a proof server.

**Interface:** `ProofProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** Created via `httpClientProofProvider()` from
`@midnight-ntwrk/midnight-js-http-client-proof-provider`. Takes the proof
server URI and a `zkConfigProvider` instance.

```typescript
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';

const proofProvider = httpClientProofProvider(proofServerUri, zkConfigProvider);
```

The proof server is a separate process that performs the computationally
intensive ZK proof generation. In the browser, proof generation is delegated
to this server via HTTP requests rather than running locally.

#### Gotcha: builtin protocol keys with a self-hosted `httpClientProofProvider`

A transaction that touches the shielded pool needs proofs not just for your
contract's own circuits, but also for protocol-level builtin circuits —
`midnight/zswap/spend`, `midnight/zswap/output`, `midnight/zswap/sign`,
`midnight/dust/spend`. These are part of the ledger/kernel (see
`proof-server:proof-server-architecture`'s `key-material.md` for the
server-side prefetch/on-demand-fetch mechanics), not something any DApp
compiles or serves itself.

**Wallet-delegated proving** (`api.getProvingProvider(...)` from the DApp
Connector, i.e. no `proofServerUri` configured) resolves these builtins
*internally* inside the wallet — your `zkConfigProvider` is never asked for
them. Your `zkConfigProvider`/`KeyMaterialProvider` is still consulted for
your own contract's circuits, just not for the protocol builtins.

**Self-hosted `httpClientProofProvider`** (the pattern shown above) has no
such fallback. `@midnight-ntwrk/midnight-js-http-client-proof-provider`
falls through to whatever `zkConfigProvider` you gave it for *any* circuit
ID it doesn't recognize as a `contract:<address>/<circuitId>` location —
including the protocol builtins. If your `zkConfigProvider` only serves
your own contract's `.zkir`/prover/verifier files under
`window.location.origin` (the common case shown above), fetching
`midnight/zswap/output` (and friends) 404s, and proving fails with an
opaque `'check' returned an error` or `key not found: <circuit>` message —
easy to misdiagnose as a broken proof server or a missing key for your
*own* circuit rather than a missing builtin.

**Fix:** either don't configure `proofServerUri` at all and let wallet-delegated
proving handle it (the simplest option — this is why apps that never set a
proof server URI don't hit this), or, if a self-hosted proof server is a
hard requirement, intercept builtin circuit IDs before they reach your
contract's `zkConfigProvider` and resolve them separately (fetch from a
known-good source, or delegate just those lookups to a wallet-provided
resolver). `midnightntwrk/passport` (`demo/mn-passport-foundations/app/src/lib/wasmProver.ts`)
does this with a hand-rolled `SYSTEM_KEYS` map and a `lookupSystemKey()`
shim checked before falling through to the contract `zkConfigProvider`.

### 4. walletProvider

**Purpose:** Provides cryptographic keys and transaction balancing. This is
the provider that bridges the Lace wallet's signing capabilities into the
Midnight SDK's transaction pipeline.

**Interface:** `WalletProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** Assembled manually from the `ConnectedAPI`
returned by the Lace wallet extension.

```typescript
import { toHex, fromHex } from "@midnight-ntwrk/midnight-js-utils";
import { Transaction } from "@midnight-ntwrk/ledger-v8";

// getShieldedAddresses() resolves once; cache the keys before building the provider.
const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
  await connectedApi.getShieldedAddresses();

const walletProvider: WalletProvider = {
  // getCoinPublicKey / getEncryptionPublicKey are synchronous.
  getCoinPublicKey: () => shieldedCoinPublicKey,
  getEncryptionPublicKey: () => shieldedEncryptionPublicKey,
  // WalletProvider.balanceTx is (tx: UnboundTransaction, ttl?: Date) =>
  // Promise<FinalizedTransaction>. The DApp Connector speaks serialized hex
  // strings, so serialize the unbound tx to hex, hand it to Lace, then
  // deserialize the returned hex back into a FinalizedTransaction.
  // options is `{ payFees?: boolean }`; an empty `{}` uses the defaults.
  balanceTx: async (tx, _ttl) => {
    const { tx: balancedHex } = await connectedApi.balanceUnsealedTransaction(
      toHex(tx.serialize()),
      {},
    );
    // A finalized tx is Transaction<SignatureEnabled, Proof, Binding>; pass the
    // three instance markers for those type parameters.
    return Transaction.deserialize(
      "signature",
      "proof",
      "binding",
      fromHex(balancedHex),
    );
  },
};
```

The `balanceTx` method is critical: it takes a proven (unbound) transaction,
sends it to Lace, which adds the necessary coin inputs to cover fees and binds
(finalizes) the transaction. Because the DApp Connector exchanges transactions
as serialized hex strings, `balanceTx` must `toHex(tx.serialize())` on the way
in and `Transaction.deserialize(...)` the returned hex string back into a
`FinalizedTransaction` on the way out — it must not return the raw string.

### 5. midnightProvider

**Purpose:** Submits signed, balanced, proven transactions to the Midnight
network.

**Interface:** `MidnightProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** Delegates directly to the Lace wallet's
`submitTransaction` method.

```typescript
import { toHex } from "@midnight-ntwrk/midnight-js-utils";

const midnightProvider: MidnightProvider = {
  // submitTransaction takes a serialized hex string and returns void, so
  // recover the tx id from the transaction's own identifiers().
  submitTx: async (tx) => {
    await connectedApi.submitTransaction(toHex(tx.serialize()));
    return tx.identifiers()[0];
  },
};
```

After the proof server generates the ZK proof and Lace balances the
transaction, `submitTx` broadcasts it to the Substrate node via Lace. The
wallet handles the actual network communication. `submitTransaction` returns
`void`, so the `TransactionId` is read from `tx.identifiers()[0]` rather than
from the call's result.

### 6. privateStateProvider

**Purpose:** Stores the DApp's private (off-chain) state. This is state that
is known only to the current user and is never published on-chain.

**Interface:** `PrivateStateProvider` from `@midnight-ntwrk/midnight-js-types`.

**Browser implementation:** A simple in-memory `Map`. Browser DApps do not
persist private state across sessions — when the user refreshes the page,
private state is reconstructed from the contract's public ledger where
possible.

`PrivateStateProvider<PSI, PS>` is a ~13-method interface (`setContractAddress`,
`set`, `get`, `remove`, `clear`, `setSigningKey`, `getSigningKey`,
`removeSigningKey`, `clearSigningKeys`, `exportPrivateStates`,
`importPrivateStates`, `exportSigningKeys`, `importSigningKeys`). A minimal
in-memory implementation backs the private-state and signing-key stores with
`Map`s; the export/import methods can reject for an ephemeral store:

```typescript
function inMemoryPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<PSI, PS>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  return {
    setContractAddress: () => {},
    set: async (id, state) => { states.set(id, state); },
    get: async (id) => states.get(id) ?? null,
    remove: async (id) => { states.delete(id); },
    clear: async () => { states.clear(); },
    setSigningKey: async (address, key) => { signingKeys.set(address, key); },
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => { signingKeys.delete(address); },
    clearSigningKeys: async () => { signingKeys.clear(); },
    exportPrivateStates: async () => { throw new Error("not supported in-memory"); },
    importPrivateStates: async () => { throw new Error("not supported in-memory"); },
    exportSigningKeys: async () => { throw new Error("not supported in-memory"); },
    importSigningKeys: async () => { throw new Error("not supported in-memory"); },
  };
}
```

## DApp Connector API Types

Wallet extensions expose the DApp Connector API through `window.midnight`, each
under its own key (Lace also aliases itself at `mnLace`). The API surface is
defined in `@midnight-ntwrk/dapp-connector-api` (v4).

### InitialAPI

The entry point for wallet interaction. Available before the user approves
the connection.

| Property     | Type                                      | Description                                  |
| ------------ | ----------------------------------------- | -------------------------------------------- |
| `name`       | `string`                                  | Wallet display name (e.g., "Lace")           |
| `icon`       | `string`                                  | Base64 or data URI of the wallet icon         |
| `apiVersion` | `string`                                  | Version of the `@midnight-ntwrk/dapp-connector-api` package the wallet implements (e.g., "4.0.1") |
| `rdns`       | `string`                                  | Reverse DNS identifier                       |
| `connect`    | `(networkId: string) => Promise<ConnectedAPI>` | Hints the desired network id, requests user approval, returns the connected API |

The `connect()` method prompts the user to approve the DApp in the wallet
extension popup. The `networkId` parameter hints the desired network — e.g.
`"mainnet"` for mainnet, or the network id of the target testnet/devnet.

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
| `balanceUnsealedTransaction()` | `Promise<{ tx: string }>`                                                            | Adds coin inputs and binds; takes/returns serialized hex |
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
  substrateNodeUri: string; // Substrate node RPC endpoint
  networkId: string;        // Network identifier (e.g., "testnet")
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
  | "Rejected";

interface APIError {
  type: "DAppConnectorAPIError";
  code: ErrorCode;
  reason: string;
}
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

## Wallet-Driven Configuration

All network endpoints originate from the Lace wallet's `getConfiguration()`
method. This is a deliberate design decision in the Midnight ecosystem: the
wallet is the single source of truth for which network the user is connected
to.

**Why this matters:**

1. **No hardcoded URLs.** The DApp does not contain any network endpoints in
   its source code or environment variables. The user selects a network in
   Lace's settings, and the DApp automatically connects to the correct
   indexer, node, and proof server.

2. **Network switching is seamless.** If the user switches from testnet to
   another network in Lace, re-connecting the DApp picks up the new
   endpoints automatically.

3. **Deployment simplicity.** The same DApp build works on any network
   without configuration changes.

## Proof Server URI Derivation

The proof server URI is not included in `getConfiguration()`. It must be
derived from `substrateNodeUri`:

```typescript
function deriveProofServerUri(substrateNodeUri: string): string {
  const url = new URL(substrateNodeUri);
  url.port = "6300";
  return url.toString();
}
```

The convention is that the proof server runs on the same host as the Substrate
node but on port 6300 (the node itself typically uses port 9944). Some
deployments provide a `serviceUriConfig().proverServerUri` — if available, use
that instead of deriving from the node URI.

## The createProviders() Factory Pattern

The recommended pattern is a single factory function that takes a
`ConnectedAPI` and returns all 6 providers ready for use:

```typescript
import { type ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js-utils';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import type {
  MidnightProviders,
  WalletProvider,
  MidnightProvider,
  PrivateStateProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

// MidnightProviders<PCK, PSI, PS>: provable circuit ids first, private-state id
// second, private-state type third. PCK must extend AnyProvableCircuitId (a
// string) and PSI must extend PrivateStateId (a string).
export async function createProviders<
  PCK extends string,
  PSI extends string,
  PS,
>(
  connectedApi: ConnectedAPI,
  privateStateProvider: PrivateStateProvider<PSI, PS>,
): Promise<MidnightProviders<PCK, PSI, PS>> {
  const config = await connectedApi.getConfiguration();
  setNetworkId(config.networkId);

  const proofServerUri = deriveProofServerUri(config.substrateNodeUri);

  const publicDataProvider = indexerPublicDataProvider(
    config.indexerUri,
    config.indexerWsUri,
  );

  const zkConfigProvider = new FetchZkConfigProvider<PCK>(
    window.location.origin,
    fetch.bind(window),
  );

  const proofProvider = httpClientProofProvider(proofServerUri, zkConfigProvider);

  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await connectedApi.getShieldedAddresses();

  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shieldedEncryptionPublicKey,
    // Serialize the unbound tx to hex for the connector, then deserialize the
    // returned hex string back into a FinalizedTransaction.
    balanceTx: async (tx, _ttl) => {
      const { tx: balancedHex } = await connectedApi.balanceUnsealedTransaction(
        toHex(tx.serialize()),
        {},
      );
      return Transaction.deserialize(
        'signature',
        'proof',
        'binding',
        fromHex(balancedHex),
      );
    },
  };

  const midnightProvider: MidnightProvider = {
    submitTx: async (tx) => {
      await connectedApi.submitTransaction(toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };

  return {
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
    privateStateProvider,
  };
}
```

The `privateStateProvider` is passed in rather than built inline, because the
full `PrivateStateProvider<PSI, PS>` interface has ~13 methods (see the
in-memory implementation above). Keying it by the private-state ID (`PSI`)
rather than by contract address matches the `MidnightProviders` generics.

This factory is called once after wallet connection succeeds and stored in a
React Context so all components can access the providers.

## WalletProvider and balanceTx

The `walletProvider.balanceTx` method is the SDK's abstraction over Lace's
`balanceUnsealedTransaction`. When the SDK constructs a transaction (e.g.,
from `callTx`), the result is an `UnprovenTransaction`. After proof generation,
the transaction needs coin inputs to pay fees. `balanceTx` sends the
transaction to Lace, which:

1. Selects appropriate coin inputs from the user's wallet
2. Constructs change outputs if necessary
3. Binds (finalizes) the transaction
4. Returns the balanced, bound transaction

The DApp Connector exchanges transactions as serialized hex strings.
`balanceTx` therefore hex-encodes the unbound transaction with
`toHex(tx.serialize())` before calling `balanceUnsealedTransaction`, and
deserializes the returned `{ tx }` string with
`Transaction.deserialize('signature', 'proof', 'binding', fromHex(tx))` to
produce the `FinalizedTransaction` it must return. `serialize`/`deserialize`
come from `@midnight-ntwrk/ledger-v8`; `toHex`/`fromHex` from
`@midnight-ntwrk/midnight-js-utils`.

## MidnightProvider and submitTx

The `midnightProvider.submitTx` method wraps Lace's `submitTransaction`. After
balancing and binding, the transaction is ready for broadcast. `submitTx`
serializes it (`toHex(tx.serialize())`) and sends it to Lace, which forwards it
to the Substrate node. Lace's `submitTransaction` resolves to `void`, so
`submitTx` reads the `TransactionId` from `tx.identifiers()[0]` and returns
that for tracking confirmation via the indexer's WebSocket subscription.

## Browser vs Node.js Differences

Several providers have different implementations depending on the runtime:

| Provider             | Browser                        | Node.js (CLI tools)               |
| -------------------- | ------------------------------ | --------------------------------- |
| `zkConfigProvider`   | `FetchZkConfigProvider` (HTTP) | `NodeZkConfigProvider` (file system) |
| `privateStateProvider` | In-memory `Map`              | LevelDB on disk                   |
| `walletProvider`     | Lace extension                 | Standalone key management         |
| `midnightProvider`   | Lace extension                 | Direct Substrate RPC              |
| `publicDataProvider` | Same (`indexerPublicDataProvider`) | Same                          |
| `proofProvider`      | Same (`httpClientProofProvider`)   | Same                          |

In the browser, the wallet extension handles key management and transaction
submission. In Node.js (CLI tools, integration tests), you manage keys
directly and submit transactions via Substrate RPC without Lace.

The `publicDataProvider` and `proofProvider` are identical in both
environments — they communicate with external services (indexer and proof
server) over HTTP/WebSocket regardless of runtime.

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
   appropriate Midnight network (testnet for development).
4. **Fund the wallet.** Use the Midnight testnet faucet to receive test
   tokens. The faucet URL is available in the Midnight documentation.
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
