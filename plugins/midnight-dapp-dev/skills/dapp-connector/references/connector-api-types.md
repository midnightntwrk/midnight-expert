# DApp Connector API Type Reference

Complete type definitions for the Midnight DApp Connector API, `@midnightntwrk/dapp-connector-api` 4.1.0. This is the npm scope Midnight.js 5 depends on. The older `@midnight-ntwrk/dapp-connector-api` scope also reaches 4.1.0, but import from `@midnightntwrk` so your types match the ones Midnight.js uses.

Compared with 4.0.1, version 4.1.0 adds the `InsufficientFunds` error code, adds an optional `scheme` field to `Signature`, and types `window.midnight` through a global `var midnight` declaration instead of a `Window` interface augmentation. Every method signature is unchanged. For usage patterns and React/Next.js integration, see the main `dapp-connector` skill. For building SDK providers from these types, see `references/browser-providers.md`.

## Core Types

### InitialAPI

Injected by the wallet extension at `window.midnight.{walletId}`:

```typescript
type InitialAPI = {
  /** Reverse DNS identifier (e.g., "com.example.wallet"). Treat it like a user agent string. */
  rdns: string;

  /** Wallet display name. Sanitize before display (render it as a text node). */
  name: string;

  /** Wallet icon URL (hosted or base64 data URL). Display it through an `img` tag. */
  icon: string;

  /** Version of @midnightntwrk/dapp-connector-api the wallet implements, e.g. "4.1.0" */
  apiVersion: string;

  /**
   * Initiate wallet connection, hinting the desired network.
   * @param networkId - "undeployed", "preview", "preprod", or "mainnet"
   * @returns ConnectedAPI on success
   * @throws APIError with code "PermissionRejected" if user denies
   */
  connect: (networkId: string) => Promise<ConnectedAPI>;
};
```

### ConnectedAPI

Union type returned by `connect()`:

```typescript
type ConnectedAPI = WalletConnectedAPI & HintUsage;
```

### HintUsage

```typescript
interface HintUsage {
  /**
   * Pre-declare methods the DApp intends to use.
   * Allows the wallet to batch permission prompts. The wallet may resolve the
   * returned promise only after the user has granted the hinted permissions.
   * @param methodNames - WalletConnectedAPI method names
   */
  hintUsage(methodNames: Array<keyof WalletConnectedAPI>): Promise<void>;
}
```

### WalletConnectedAPI

```typescript
interface WalletConnectedAPI {
  /**
   * Get the wallet's network configuration.
   * Returns endpoints matching the user's selected network in Lace.
   */
  getConfiguration(): Promise<Configuration>;

  /**
   * Check if the wallet is still connected.
   */
  getConnectionStatus(): Promise<ConnectionStatus>;

  /**
   * Get all shielded (private) addresses and keys.
   * All values are Bech32m-encoded strings.
   */
  getShieldedAddresses(): Promise<ShieldedAddresses>;

  /**
   * Get the unshielded (transparent) address.
   * Bech32m-encoded string.
   */
  getUnshieldedAddress(): Promise<UnshieldedAddress>;

  /**
   * Get the dust collection address.
   * Bech32m-encoded string.
   */
  getDustAddress(): Promise<DustAddress>;

  /**
   * Get balances for all token types in the shielded pool.
   * Keys are token type identifiers, values are bigint balances.
   */
  getShieldedBalances(): Promise<Record<string, bigint>>;

  /**
   * Get balances for all token types in the unshielded pool.
   * Keys are token type identifiers, values are bigint balances.
   */
  getUnshieldedBalances(): Promise<Record<string, bigint>>;

  /**
   * Get the current dust balance and generation cap.
   */
  getDustBalance(): Promise<DustBalance>;

  /**
   * Get paginated transaction history.
   * @param pageNumber - Page index
   * @param pageSize - Number of entries per page
   */
  getTxHistory(pageNumber: number, pageSize: number): Promise<HistoryEntry[]>;

  /**
   * Initialize a transfer transaction with the desired outputs. The wallet pays
   * fees by default (`payFees: true`).
   *
   * The returned `tx` is a SERIALIZED transaction (hex string), NOT a Ledger
   * `Transaction` object. See "Transaction values are serialized hex strings"
   * below.
   * @param desiredOutputs - Outputs to create
   * @param options - Optional transfer parameters
   */
  makeTransfer(
    desiredOutputs: DesiredOutput[],
    options?: { payFees?: boolean },
  ): Promise<{ tx: string }>;

  /**
   * Initialize a transaction with an unbalanced intent containing the desired
   * inputs and outputs. The primary use case is creating a transaction that
   * initiates a swap.
   *
   * The returned `tx` is a SERIALIZED transaction (hex string).
   * @param desiredInputs - Inputs to provide
   * @param desiredOutputs - Outputs to create
   * @param options - Intent options:
   *   - `intentId`: the segment id for the created intent. Use `1` to ensure no
   *     transaction merging executes actions before this intent in the same
   *     transaction; use a specific number within ledger limits to assign that
   *     segment id; or use `"random"` to let the wallet pick one (typical for swaps).
   *   - `payFees`: whether the wallet pays fees for the issued transaction.
   */
  makeIntent(
    desiredInputs: DesiredInput[],
    desiredOutputs: DesiredOutput[],
    options: { intentId: number | "random"; payFees: boolean },
  ): Promise<{ tx: string }>;

  /**
   * Balance an unsealed transaction (e.g. from a contract call). Pays fees and
   * adds the inputs/outputs needed to remove imbalances, returning a transaction
   * ready for submission. Expects a serialized `Transaction<SignatureEnabled,
   * Proof, PreBinding>` and returns a serialized transaction (hex strings).
   *
   * This is the method DApps use when interacting with contracts — the wallet may
   * need to add inputs/outputs to balance the transaction. Because it operates on
   * the *unsealed* transaction, it can balance contracts that use fallible sections.
   * @param tx - The serialized unbalanced transaction from the contract interaction
   * @param options - `payFees` defaults to `true`
   */
  balanceUnsealedTransaction(
    tx: string,
    options?: { payFees?: boolean },
  ): Promise<{ tx: string }>;

  /**
   * Balance a sealed transaction (proven, signed, and cryptographically bound).
   * Pays fees and adds the inputs/outputs needed to remove imbalances. Expects a
   * serialized `Transaction<SignatureEnabled, Proof, Binding>` and returns a
   * serialized transaction (hex strings).
   *
   * Mainly used when operating on transactions created by the wallet, or to force
   * balancing into a separate intent. Note: the wallet cannot balance contracts
   * that use fallible sections this way — use `balanceUnsealedTransaction` for those.
   * @param tx - The serialized sealed transaction to balance
   * @param options - `payFees` defaults to `true`
   */
  balanceSealedTransaction(
    tx: string,
    options?: { payFees?: boolean },
  ): Promise<{ tx: string }>;

  /**
   * Submit a transaction to the network, using the wallet as a relayer. The
   * transaction must be balanced and "sealed" (proven, signed, and
   * cryptographically bound — a serialized `Transaction<SignatureEnabled, Proof,
   * Binding>`), passed as a serialized hex string.
   * @param tx - The serialized, finalized transaction to submit
   */
  submitTransaction(tx: string): Promise<void>;

  /**
   * Sign arbitrary data with the unshielded signing key.
   * @param data - Data to sign, encoded as specified by `options.encoding`
   * @param options - Signing options (encoding + key type)
   */
  signData(data: string, options: SignDataOptions): Promise<Signature>;

  /**
   * Get a proving provider that delegates ZK proof generation to the wallet.
   * @param keyMaterialProvider - Provides ZK key material for proof generation
   */
  getProvingProvider(
    keyMaterialProvider: KeyMaterialProvider,
  ): Promise<ProvingProvider>;
}
```

## Data Types

### Configuration

```typescript
interface Configuration {
  /** Indexer GraphQL HTTP endpoint */
  indexerUri: string;

  /** Indexer GraphQL WebSocket endpoint */
  indexerWsUri: string;

  /**
   * Prover server URI. Often absent as different proving modalities emerge.
   * @deprecated Use `getProvingProvider` instead.
   */
  proverServerUri?: string;

  /** Substrate node RPC endpoint */
  substrateNodeUri: string;

  /** Active network identifier */
  networkId: string;
}
```

### ConnectionStatus

A discriminated union narrowed on the `status` field. When connected, it also
carries the `networkId` the wallet is connected to. `getConnectionStatus()`
returns `Promise<ConnectionStatus>`.

```typescript
type ConnectionStatus =
  | { status: "connected"; networkId: string }
  | { status: "disconnected" };

// Narrow on the `status` field:
const s = await api.getConnectionStatus();
if (s.status === "connected") {
  // s.networkId is available here
}
```

### Address Types

```typescript
interface ShieldedAddresses {
  /** Bech32m-encoded shielded address */
  shieldedAddress: string;

  /** Bech32m-encoded shielded coin public key */
  shieldedCoinPublicKey: string;

  /** Bech32m-encoded shielded encryption public key */
  shieldedEncryptionPublicKey: string;
}

interface UnshieldedAddress {
  /** Bech32m-encoded unshielded (transparent) address */
  unshieldedAddress: string;
}

interface DustAddress {
  /** Bech32m-encoded dust collection address */
  dustAddress: string;
}
```

### Balance Types

```typescript
interface DustBalance {
  /** Current dust balance */
  balance: bigint;

  /** Maximum dust cap derived from NIGHT delegation */
  cap: bigint;
}
```

### Transaction History

```typescript
interface HistoryEntry {
  /** Hex-encoded transaction hash */
  txHash: string;

  /** Transaction status */
  txStatus: TxStatus;
}

/**
 * Execution status of a transaction — indicates which sections of the
 * transaction executed successfully. Keys are section indices.
 */
type ExecutionStatus = Record<number, "Success" | "Failure">;

/**
 * Discriminated union narrowed on the `status` field. The `finalized` and
 * `confirmed` variants carry an `executionStatus`; `pending` and `discarded`
 * do not.
 */
type TxStatus =
  | { status: "finalized"; executionStatus: ExecutionStatus } // included in chain and finalized
  | { status: "confirmed"; executionStatus: ExecutionStatus } // included in chain, not finalized yet
  | { status: "pending" } // sent to network, not yet confirmed or discarded
  | { status: "discarded" }; // failed to be included (e.g. TTL or validity checks)
```

### Transaction values are serialized hex strings

The transaction methods above (`makeTransfer`, `makeIntent`,
`balanceUnsealedTransaction`, `balanceSealedTransaction`, `submitTransaction`)
do **not** exchange Ledger `Transaction` objects. The connector API speaks
**serialized transactions as hex strings**. The DApp Connector API package does
not export `Transaction` or similar object types; in a DApp, import the ledger
from `@midnight-ntwrk/midnight-js-protocol/v9`. Every public network runs
ledger 9.

Convert between the wallet's hex strings and ledger 9 transactions with the same
idiom the provider adapters use (see `references/browser-providers.md`). In those
adapters, Midnight.js hands you transaction handles; `handle.serialize()` gives
the bytes:

```typescript
import { toHex, fromHex } from "@midnight-ntwrk/midnight-js-utils";
import { Transaction } from "@midnight-ntwrk/midnight-js-protocol/v9";

// transaction bytes -> hex string the wallet understands
await api.submitTransaction(toHex(tx.serialize()));

// hex string from the wallet -> ledger 9 Transaction
const { tx: balancedHex } = await api.balanceUnsealedTransaction(
  toHex(unsealedTx.serialize()),
);
// A balanced/sealed tx is Transaction<SignatureEnabled, Proof, Binding>;
// pass the three instance markers for those type parameters.
const balanced = Transaction.deserialize(
  "signature",
  "proof",
  "binding",
  fromHex(balancedHex),
);
```

### Token and Transfer Types

```typescript
/** Hex-encoded string relating to the ledger's raw token type. */
type TokenType = string;

/**
 * Desired output from a transfer or intent. The recipient must be a Bech32m
 * address matching the token kind and the network the wallet is connected to.
 */
type DesiredOutput = {
  kind: "shielded" | "unshielded";
  type: TokenType;
  value: bigint;
  recipient: string;
};

/** Desired input for an intent: the token kind/type and amount to provide. */
type DesiredInput = {
  kind: "shielded" | "unshielded";
  type: TokenType;
  value: bigint;
};
```

### Signature Types

```typescript
interface Signature {
  /**
   * Signature scheme, added in 4.1.0. Optional for backward compatibility:
   * when it is absent, treat the signature as "schnorr_bip340". A future major
   * version will make it mandatory, so handle both values.
   */
  scheme?: "ecdsa_secp256k1_sha256" | "schnorr_bip340";

  /**
   * The data that was signed (echoed back from the input, in the original encoding).
   * Useful for verifying what was signed without re-parsing the request.
   */
  data: string;

  /**
   * The signature over the prefixed data. Per the connector API, the wallet
   * prepends a domain-separation prefix to the bytes before signing — the
   * standard guard that keeps a signed message from being interpreted as a
   * transaction. The exact prefix format is a wallet implementation detail and
   * is NOT specified by `@midnightntwrk/dapp-connector-api`, whose `signData`
   * JSDoc only states the data "will be prepended with right prefix"; do not
   * depend on a specific prefix string.
   *
   * Encoded as the big-endian scalars `r` and `s`, each padded to 32 bytes
   * (64 bytes total for either scheme).
   */
  signature: string;

  /**
   * The verifying key. 32 bytes (BIP-340 x-only) for "schnorr_bip340",
   * 33 bytes (SEC1 compressed) for "ecdsa_secp256k1_sha256".
   */
  verifyingKey: string;
}

interface SignDataOptions {
  /**
   * How the `data` argument is encoded.
   * - `"hex"` / `"base64"`: binary data encoded in that format — the wallet decodes
   *   to raw bytes before signing.
   * - `"text"`: sign the string as UTF-8 bytes (JS strings are UTF-16; the wallet
   *   handles the conversion).
   */
  encoding: "hex" | "base64" | "text";

  /** Which key to use for signing. Currently only `"unshielded"` is supported. */
  keyType: "unshielded";
}
```

## Error Types

### APIError

```typescript
type APIError = Error & {
  /** Discriminant field -- always "DAppConnectorAPIError" */
  type: "DAppConnectorAPIError";

  /** Error classification */
  code: ErrorCode;

  /** Human-readable error description */
  reason: string;
};

type ErrorCode =
  | "Disconnected"       // Wallet connection lost
  | "InternalError"      // Wallet-side internal failure
  | "InvalidRequest"     // Malformed request from DApp
  | "PermissionRejected" // User denied the permission prompt
  | "Rejected"           // User rejected the specific operation
  | "InsufficientFunds"; // Well-formed request, but the wallet lacks the balance (4.1.0)
```

The package also exports the codes as a runtime constant, `ErrorCodes` (e.g. `ErrorCodes.InsufficientFunds`).

### Error Checking Pattern

```typescript
function isDAppConnectorError(error: unknown): error is APIError {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as APIError).type === "DAppConnectorAPIError"
  );
}

// Usage
try {
  await api.submitTransaction(tx);
} catch (error) {
  if (isDAppConnectorError(error)) {
    // Handle specific error codes
    if (error.code === "Disconnected") {
      // Reconnect flow
    }
  }
}
```

## Window Type Augmentation

The package types the global for you. Since 4.1.0 it declares `var midnight: { [key: string]: InitialAPI } | undefined` in the global scope (earlier versions augmented `Window` instead), so once anything is imported from `@midnightntwrk/dapp-connector-api`, both `window.midnight` and `globalThis.midnight` are typed. Most projects need **no** manual declaration.

The UI template's `vite-env.d.ts` adds no `Window` declaration and relies on the package's global. If you add your own, use the same index signature as the package, `[key: string]: InitialAPI`, so `window.midnight` has one consistent type:

```typescript
// types/midnight.d.ts
import type { InitialAPI } from "@midnightntwrk/dapp-connector-api";

declare global {
  interface Window {
    // Each wallet installs its InitialAPI under its own key. The DApp Connector
    // API is CAIP-372-compatible, so keys are UUIDs. Do not assume a fixed key;
    // enumerate `Object.values(window.midnight)` and match by `name`/`rdns`.
    // (Lace also exposes a Lace-specific convenience alias at `mnLace`.)
    midnight?: { [walletId: string]: InitialAPI };
  }
}
```

**Detection pattern** — enumerate and match by identity, not by key:

```typescript
function findWallets(): InitialAPI[] {
  if (typeof window === "undefined" || !window.midnight) return [];
  return Object.values(window.midnight).filter(
    (entry): entry is InitialAPI =>
      entry != null &&
      typeof entry === "object" &&
      typeof (entry as InitialAPI).connect === "function" &&
      typeof (entry as InitialAPI).apiVersion === "string",
  );
}
```
