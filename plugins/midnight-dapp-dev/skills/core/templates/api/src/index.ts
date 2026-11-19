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

/**
 * The state data the compiler-generated `ledger()` decodes, from a contract
 * state as the public data provider serves it. Midnight.js 5 serves the state
 * still serialized, tagged with the ledger era that wrote it. A contract
 * deployed on any network today is ledger 9, so only a ledger 9 decoder is given.
 */
export function contractStateData(read: ContractStateRead): ChargedState {
  if (read.contractState.era !== "v9") throw new Error("Expected a ledger 9 contract state");
  return read.contractState.deserialize({ v9: LedgerContractState }).data;
}

// TODO: Import your compiled contract and implement deploy/join.
//
// Example deployment pattern:
//
//   import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
//   import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-js";
//   import { Contract } from "{{CONTRACT_PACKAGE}}";
//   import { witnesses } from "{{CONTRACT_PACKAGE}}/witnesses";
//
//   // withCompiledFileAssets is required by the type. In the browser,
//   // Midnight.js reads the keys and ZKIR through providers.zkConfigProvider,
//   // not from this path.
//   const compiledContract = CompiledContract.make("myContract", Contract).pipe(
//     CompiledContract.withWitnesses(witnesses),
//     CompiledContract.withCompiledFileAssets("managed/myContract"),
//   );
//
//   export async function deploy(providers: AppProviders) {
//     return deployContract(providers, {
//       compiledContract,
//       privateStateId: PRIVATE_STATE_ID,
//       initialPrivateState: { secretKey: crypto.getRandomValues(new Uint8Array(32)) },
//     });
//   }
//
// Example join pattern. With initialPrivateState, findDeployedContract stores
// it under privateStateId, replacing what is there; leave the key out to reuse
// the private state this browser already holds for the contract.
//
//   export async function join(providers: AppProviders, contractAddress: string) {
//     return findDeployedContract(providers, {
//       contractAddress,
//       compiledContract,
//       privateStateId: PRIVATE_STATE_ID,
//       initialPrivateState: { secretKey: crypto.getRandomValues(new Uint8Array(32)) },
//     });
//   }

export function createStateObservable(
  providers: Pick<AppProviders, "publicDataProvider" | "privateStateProvider">,
  contractAddress: string,
  // Your compiled contract's generated `ledger()` function: pass
  // `(data) => ledger(data)` from "{{CONTRACT_PACKAGE}}".
  parseLedger: (data: ChargedState) => ContractState,
): Observable<DerivedState> {
  const public$ = providers.publicDataProvider
    .contractStateObservable(contractAddress, { type: "latest" })
    // Each emission is a PositionedRecord: the state read plus the block that
    // carried it (blockHeight, blockHash), so a stream can resume from there.
    .pipe(map(({ value }) => parseLedger(contractStateData(value))));

  // Private state is scoped by contract address.
  const private$ = from(
    providers.privateStateProvider.forContract(contractAddress).get(PRIVATE_STATE_ID),
  );

  return combineLatest([public$, private$]).pipe(
    map(([contractState, privateState]) => ({ contractState, privateState })),
    retry({ delay: 500 }),
  );
}
