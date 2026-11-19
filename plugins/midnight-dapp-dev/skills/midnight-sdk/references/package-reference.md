# SDK Package Reference

Detailed exports, constructor signatures, and configuration for the Midnight.js SDK packages (5.0.1; all `@midnight-ntwrk/midnight-js-*` packages move in lockstep). Midnight.js 5 builds ledger 9 transactions, which every Midnight network runs. Check the [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix) for the versions that go with it. For high-level usage patterns, see the main `midnight-sdk` skill. For the transaction lifecycle, see `references/transaction-lifecycle.md`.

## @midnight-ntwrk/midnight-js-contracts

The primary contract interaction package. Handles deployment, discovery, circuit calls, and maintenance.

### Contract Deployment & Discovery

```typescript
import {
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-js";

const compiledContract = CompiledContract.make("myContract", Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets("managed/myContract"),
);

// Deploy a new contract
const deployed = await deployContract(providers, {
  compiledContract,
  privateStateId: PRIVATE_STATE_ID,   // both omitted for a contract
  initialPrivateState: initialState,  // with no private state
  // `args` is REQUIRED when the contract's constructor takes parameters
  // (its type is `Contract.InitializeParameters<C>`); for a no-argument
  // constructor the `args` field is omitted from the options type entirely.
  args: [constructorArg],
  signingKey,  // optional; a fresh signing key is sampled if omitted
});

// Find an existing contract by address
const found = await findDeployedContract(providers, {
  contractAddress,
  compiledContract,
  privateStateId: PRIVATE_STATE_ID,
  // initialPrivateState: only to REPLACE what is stored under privateStateId.
  // The key overwrites the stored state even when its value is undefined,
  // so leave it out to reuse the private state already stored.
});
```

`deployContract` and `findDeployedContract` read the network's ledger version and the artifacts' `compact-runtime` version first. Artifacts compiled for ledger 8 (toolchain 0.31.x) are refused for a new deploy with `EraMismatchError`.

### Circuit Call Functions

```typescript
import {
  submitCallTx,
  submitCallTxAsync,
  createUnprovenCallTx,
} from "@midnight-ntwrk/midnight-js-contracts";

// High-level: build, prove, balance, submit, finalize
const result = await deployed.callTx.circuitName(...args);

// The functions take one options object
const options = {
  compiledContract,
  contractAddress,
  circuitId: "circuitName" as const,
  args: [arg1],                     // omitted for a circuit with no arguments
  privateStateId: PRIVATE_STATE_ID, // omitted for a contract with no private state
};

const unproven = await createUnprovenCallTx(providers, options);   // build only
const finalized = await submitCallTx(providers, options);          // build to finalize
const submitted = await submitCallTxAsync(providers, options);     // build to submit
submitted.txId;
```

### Transaction Submission

```typescript
import { submitTxAsync } from "@midnight-ntwrk/midnight-js-contracts";

// Prove, balance and submit an unproven transaction handle without waiting
// for finalization. Returns the transaction ID.
const txId: string = await submitTxAsync(providers, { unprovenTx, circuitId });
```

### State Queries

```typescript
import {
  getStates,
  getPublicStates,
  getUnshieldedBalances,
  verifyContractState,
} from "@midnight-ntwrk/midnight-js-contracts";

// Public states plus the private state stored under privateStateId
const { contractState, zswapChainState, ledgerParameters, privateState } = await getStates(
  publicDataProvider, privateStateProvider, contractAddress, privateStateId, blockHash?,
);

// Public states only (serialized, era-tagged)
const publicStates: PublicStatesRead = await getPublicStates(publicDataProvider, contractAddress, blockHash?);

// Unshielded balances held by the contract
const balances: UnshieldedBalances = await getUnshieldedBalances(publicDataProvider, contractAddress);

// Check local verifier keys against the deployed ones; throws ContractTypeError on a mismatch
await verifyContractState(verifierKeys, publicStates.contractState, contractAddress);
```

### Contract Maintenance

```typescript
import {
  submitInsertVerifierKeyTx,
  submitRemoveVerifierKeyTx,
  submitReplaceAuthorityTx,
} from "@midnight-ntwrk/midnight-js-contracts";

// Add a verifier key for a circuit
await submitInsertVerifierKeyTx(providers, compiledContract, contractAddress, circuitId, newVk);

// Remove a verifier key
await submitRemoveVerifierKeyTx(providers, compiledContract, contractAddress, circuitId);

// Replace the contract authority (curried on the new SigningKey)
await submitReplaceAuthorityTx(providers, compiledContract, contractAddress)(newAuthority);

// The same operations through a deployed/found contract
await deployed.circuitMaintenanceTx.circuitName.insertVerifierKey(newVk);
await deployed.circuitMaintenanceTx.circuitName.removeVerifierKey();
await deployed.contractMaintenanceTx.replaceAuthority(newAuthority);
```

### Error Types

```typescript
import {
  TxFailedError,
  EraMismatchError,
} from "@midnight-ntwrk/midnight-js-contracts";

try {
  await deployed.callTx.myCircuit();
} catch (e) {
  if (e instanceof TxFailedError) {
    // Submitted but failed on-chain. e.operation is "call" | "deploy" |
    // "insert-verifier-key" | "remove-verifier-key" | "replace-authority";
    // e.record is the finalized record the chain reported.
  } else if (e instanceof EraMismatchError) {
    // A value from the wrong ledger era, e.g. ledger 8 artifacts on a
    // ledger 9 network. e.reason says which.
  }
}
```

Each error also carries a registered `code` (`"MIDNIGHT_JS_C_TX_FAILED"`, `"MIDNIGHT_JS_C_ERA_MISMATCH"`). Branch on `code` rather than `instanceof` where more than one copy of the package may be loaded.

### Return Types

```typescript
interface Ledger9FoundContract<C> {
  era: "v9";
  compiledContract: CompiledContract<C, any>;
  contractAddress: ContractAddress;
  deployTxData: Ledger9FoundDeployTxData<C>;
  callTx: { [circuit]: (...args) => Promise<Ledger9FinalizedCallTxData<C, circuit>> };
  circuitMaintenanceTx: Record<circuit, { insertVerifierKey(vk); removeVerifierKey() }>;
  contractMaintenanceTx: { replaceAuthority(newAuthority: SigningKey) };
}

// DeployedContract: same shape, with deployTxData: Ledger9FinalizedDeployTxData<C>
interface Ledger9FinalizedDeployTxData<C> {
  era: "v9";
  public: {
    contractAddress: ContractAddress;
    initialContractState: SerializedContractState<"v9">;
    // plus the finalized record (FinalizedTxRecord): status, txId, identifiers,
    // txHash, blockHash, blockHeight, blockTimestamp, protocolVersion, fees, ...
  };
  private: {
    signingKey: SigningKey;
    initialPrivateState: PrivateState<C>;
  };
}

interface Ledger9FinalizedCallTxData<C, PCK> {
  public: {
    // the finalized record (as above), plus nextContractState,
    // publicTranscript and partitionedTranscript
  };
  private: { /* privacy-sensitive: do not log or serialize */ };
}
```

## @midnight-ntwrk/midnight-js-types

Core type definitions and provider factories used across all SDK packages.

### Provider Interfaces

```typescript
interface WalletProvider {
  readonly supportedEras: readonly LedgerEra[];
  // Balances a proven (unbound) handle; returns a finalized handle of the same era.
  balanceTx(tx: UnboundTx, ttl?: Date): Promise<FinalizedTx>;
  getCoinPublicKey(): CoinPublicKey;
  getEncryptionPublicKey(): EncPublicKey;
}

interface MidnightProvider {
  readonly supportedEras: readonly LedgerEra[];
  submitTx(tx: FinalizedTx): Promise<TransactionId>;
}

interface PublicDataProvider {
  queryContractState(
    address: ContractAddress,
    config?: BlockHeightConfig | BlockHashConfig,
  ): Promise<ContractStateAndParametersRead | null>;
  // Resolve once when the tx appears on-chain (Promises, not Observables):
  watchForDeployTxData(address: ContractAddress, options?: WatchOptions): Promise<FinalizedTxRead>;
  watchForTxData(txId: TransactionId, options?: WatchOptions): Promise<FinalizedTxRead>;
  contractStateObservable(
    address: ContractAddress,
    config: ContractStateObservableConfig,
  ): Observable<PositionedRecord<ContractStateRead>>;
  unshieldedBalancesObservable(
    address: ContractAddress,
    config: ContractStateObservableConfig,
  ): Observable<PositionedRecord<UnshieldedBalances>>;
  // ...also queryBlock, queryZSwapAndContractState, queryDeployContractState,
  // queryUnshieldedBalances, watchForContractState, watchForUnshieldedBalances,
  // queryContractEvents, contractEventsObservable, queryLatestProtocolVersion
}

// A contract state as read: still serialized, tagged with the era that wrote it.
interface ContractStateRead {
  readonly protocolVersion: number;
  readonly contractState: SerializedContractState; // .era, .deserialize({ v9: ContractState })
}

interface PrivateStateProvider<PSI extends PrivateStateId, PS> {
  forContract(address: ContractAddress): ContractPrivateStates<PSI, PS>; // get / set / remove / clear
  clearAll(): Promise<void>;
  setSigningKey(address: ContractAddress, key: SigningKey): Promise<void>;
  getSigningKey(address: ContractAddress): Promise<SigningKey | null>;
  // ...also removeSigningKey, clearSigningKeys, exportSigningKeys, importSigningKeys
}

// Abstract class, not a plain interface.
abstract class ZKConfigProvider<K extends string> {
  abstract getZKIR(circuitId: K): Promise<ZKIR>;
  abstract getProverKey(circuitId: K): Promise<ProverKey>;
  abstract getVerifierKey(circuitId: K): Promise<VerifierKey>;
  getArtifactRuntimeVersion(): Promise<string>;
  get(circuitId: K): Promise<ZKConfig<K>>;
}

interface ProofProvider {
  readonly supportedEras: readonly LedgerEra[];
  proveTx(unprovenTx: UnprovenTx, proveTxConfig?: ProveTxConfig): Promise<UnboundTx>;
}
```

`ContractStateObservableConfig` is required:
`{ type: "latest" }`, `{ type: "all" }`, `{ type: "txId"; txId }`,
`{ type: "blockHeight"; blockHeight }`, or `{ type: "blockHash"; blockHash }`.
Each emission is a `PositionedRecord`: `{ value, blockHeight, blockHash }`.

### Ledger 9 Provider Factories

```typescript
import {
  createLedger9WalletProvider,
  createLedger9MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";

// impl: { balanceTx(tx, ttl?), getCoinPublicKey(), getEncryptionPublicKey() }.
// balanceTx gets a ledger 9 handle and may answer with a transaction object or its bytes.
const walletProvider = createLedger9WalletProvider(impl);

// submit: (tx: ledger 9 finalized handle) => Promise<TransactionId>
const midnightProvider = createLedger9MidnightProvider(submit);
```

Both set `supportedEras` to `["v9"]`. A provider that must also serve ledger 8 uses `createWalletProviderFromHandlers` / `createMidnightProviderFromHandlers` instead.

### MidnightProviders Bundle

```typescript
interface MidnightProviders<
  PCK extends AnyProvableCircuitId = AnyProvableCircuitId,
  PSI extends PrivateStateId = PrivateStateId,
  PS = any,
> {
  readonly privateStateProvider: PrivateStateProvider<PSI, PS>;
  readonly publicDataProvider: PublicDataProvider;
  readonly zkConfigProvider: ZKConfigProvider<PCK>;
  readonly proofProvider: ProofProvider;
  readonly walletProvider: WalletProvider;
  readonly midnightProvider: MidnightProvider;
  readonly config: MidnightConfig;
  readonly contractModuleProvider?: ContractModuleProvider; // cross-contract calls
  readonly loggerProvider?: LoggerProvider;
}

interface MidnightConfig {
  readonly networkId: string;   // "undeployed" | "preview" | "preprod" | "mainnet"
  readonly ttlSeconds: number;  // positive whole number
}
```

There is no `@midnight-ntwrk/midnight-js-network-id` package or `setNetworkId()` in Midnight.js 5. `config.networkId` replaces them.

## @midnight-ntwrk/midnight-js-protocol

The ledger 9 types a DApp needs, re-exported so it does not depend on `@midnight-ntwrk/ledger-v8`, `compact-runtime` or `compact-js` directly.

```typescript
import { CostModel, Transaction, unshieldedToken, ZswapSecretKeys } from "@midnight-ntwrk/midnight-js-protocol/v9";
import { ContractState, type ChargedState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-js";
```

## @midnight-ntwrk/midnight-js-indexer-public-data-provider

```typescript
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";

// Preferred: one config object
indexerPublicDataProvider({
  queryURL: string,          // indexer GraphQL HTTP endpoint (…/api/v4/graphql)
  subscriptionURL: string,   // indexer GraphQL WebSocket endpoint
  webSocket?: typeof WebSocket,
  pollInterval?: number,
}): PublicDataProvider;

// Deprecated positional form, still accepted:
indexerPublicDataProvider(queryURL: string, subscriptionURL: string, webSocket?: typeof WebSocket);
```

In the browser, pass `globalThis.WebSocket` as `webSocket`: the default comes from `isomorphic-ws`, whose browser build is undefined once bundled. Use indexer 4.x (`/api/v4/graphql`).

## @midnight-ntwrk/midnight-js-http-client-proof-provider

```typescript
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";

/**
 * Create a ProofProvider that talks to a proof server over HTTP.
 * Use midnightntwrk/proof-server:9.0.2 or later for ledger 9.
 */
httpClientProofProvider<K extends string>(
  proofServerUrl: string,               // e.g. "http://127.0.0.1:6300"
  zkConfigProvider: ZKConfigProvider<K> | ZKConfigRegistry,
  config?: ProvingProviderConfig,
): ProofProvider;

// Or one options object: httpClientProofProvider({ url, zkConfigProvider, ...config })
```

## @midnight-ntwrk/midnight-js-level-private-state-provider

Encrypted private state on LevelDB in Node.js, or IndexedDB in the browser.

```typescript
import {
  levelPrivateStateProvider,
  StorageEncryption,
} from "@midnight-ntwrk/midnight-js-level-private-state-provider";

/**
 * @param config.privateStoragePasswordProvider - Required. Returns the encryption
 *        password (sync or async). It must pass validatePassword: at least 16
 *        characters and at least 3 character classes.
 * @param config.accountId - Required. Scopes storage per account (hashed SHA-256);
 *        any unique id such as the wallet address
 * @param config.privateStateStoreName / signingKeyStoreName / midnightDbName - Optional names
 * @param config.cryptoBackend - Optional: "webcrypto" | "noble" (e.g. React Native)
 * @param config.levelFactory - Optional: custom LevelDB factory (e.g. browser/RN)
 */
levelPrivateStateProvider<PSI extends string, PS = any>(config: {
  privateStoragePasswordProvider: () => string | Promise<string>;
  accountId: string;
  privateStateStoreName?: string;
  signingKeyStoreName?: string;
  midnightDbName?: string;
  cryptoBackend?: "webcrypto" | "noble";
  levelFactory?: (dbName: string) => DatabaseLevel;
}): PrivateStateProvider<PSI, PS> & {
  changePassword(oldProvider, newProvider, options?): Promise<PasswordRotationResult>;
  changeSigningKeysPassword(oldProvider, newProvider, options?): Promise<PasswordRotationResult>;
  invalidateEncryptionCache(): Promise<void>;
};
```

The storage encryption uses Web Crypto + PBKDF2 and `StorageEncryption` is
**async**. There is no public `new StorageEncryption(pwd)` constructor. Construct it via
`await StorageEncryption.create(password, options?)`; `encrypt` / `decrypt` /
`decryptWithPassword` / `verifyPassword` are all async. The salt is supplied through
the options object (`{ existingSalt }`), not a positional argument:

```typescript
const encryption = await StorageEncryption.create(password, {
  existingSalt,            // optional Buffer | Uint8Array
  cryptoBackend: "webcrypto",
});
const ciphertext = await encryption.encrypt(plaintext);
const recovered = await encryption.decrypt(ciphertext);
```

## @midnight-ntwrk/midnight-js-node-zk-config-provider

Node.js only. Loads ZK circuit configurations from the local filesystem.

```typescript
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";

/**
 * @param directory - Path to the managed/<contract> directory
 *        (keys/, zkir/ and compiler/contract-manifest.json)
 * @param integrityOptions - Optional. { verify: "require" | "require-if-present" | "warn" | "off",
 *        expectedManifestHash? }. Default "require".
 */
new NodeZkConfigProvider<K extends string>(directory: string, integrityOptions?): ZKConfigProvider<K>;
```

Toolchain 0.36.x writes `compiler/contract-manifest.json`, which the default `verify: "require"` checks. Toolchain 0.31.1 wrote no manifest, so to keep calling a contract deployed before the ledger 9 fork with its original artifacts, pass `{ verify: "require-if-present" }`.

## @midnight-ntwrk/midnight-js-fetch-zk-config-provider

Browser only. Loads ZK circuit configurations via HTTP fetch.

```typescript
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";

/**
 * @param baseURL - Where keys/, zkir/ and compiler/ are served (e.g. window.location.origin)
 * @param options - Optional. { fetchFunc?, verify?, expectedManifestHash? }
 */
new FetchZkConfigProvider<K extends string>(baseURL: string, options?): ZKConfigProvider<K>;

const zkConfigProvider = new FetchZkConfigProvider<ImpureCircuitKeys>(window.location.origin, {
  fetchFunc: fetch.bind(globalThis),
});
```

## @midnight-ntwrk/midnight-js-logger-provider

Optional structured logging for SDK operations. Exports a `LoggerProvider` class (wrapping a `pino` logger). There is no `loggerProvider()` factory. Pass an instance as the optional `loggerProvider` member of `MidnightProviders`.

```typescript
import { LoggerProvider } from "@midnight-ntwrk/midnight-js-logger-provider";
import pino from "pino";

/**
 * Wrap a pino logger for SDK diagnostic output.
 * The constructor requires a pino-compatible Logger instance.
 */
const loggerProvider = new LoggerProvider(pino());
// loggerProvider exposes info/error/warn/debug/trace/fatal and isLevelEnabled(level)
```

## @midnight-ntwrk/midnight-js-dapp-connector-proof-provider

Browser wallet-delegated proving. Builds a `ProofProvider` whose
`proveTx` delegates ZK proof generation to the connected wallet via the DApp
Connector (`@midnightntwrk/dapp-connector-api` 4.1.0), removing the need for a separately reachable proof server in the browser.

```typescript
import { dappConnectorProofProvider } from "@midnight-ntwrk/midnight-js-dapp-connector-proof-provider";
import { CostModel } from "@midnight-ntwrk/midnight-js-protocol/v9";

/**
 * @param api - DApp Connector ConnectedAPI (uses `getProvingProvider`)
 * @param zkConfigProvider - Supplies ZK artifacts / key material
 * @param costModel - Cost model applied during transaction proving
 * @returns Promise<ProofProvider>
 */
const proofProvider = await dappConnectorProofProvider(
  api,
  zkConfigProvider,
  CostModel.initialCostModel(),
);
```

## @midnight-ntwrk/midnight-js-utils

Utility functions used across the SDK.

```typescript
import {
  toHex,
  fromHex,
  parseCoinPublicKeyToHex,
  parseEncPublicKeyToHex,
  assertIsContractAddress,
  validatePassword,
} from "@midnight-ntwrk/midnight-js-utils";

toHex(bytes: Uint8Array): string;   // hex, no "0x" prefix
fromHex(hex: string): Buffer;

// The DApp Connector returns Bech32m keys; the ledger works with hex.
// Both pass hex through unchanged.
parseCoinPublicKeyToHex(key: string, networkId: string): string;
parseEncPublicKeyToHex(key: string, networkId: string): string;

assertIsContractAddress(address: string): void;  // throws if not 32 bytes of hex
validatePassword(password: string): void;        // throws PasswordValidationError
```
