import type { ConnectedAPI } from "@midnightntwrk/dapp-connector-api";
import { dappConnectorProofProvider } from "@midnight-ntwrk/midnight-js-dapp-connector-proof-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
  CostModel,
  Transaction,
  type FinalizedTransaction,
} from "@midnight-ntwrk/midnight-js-protocol/v9";
import {
  ContractState as LedgerContractState,
  type ChargedState,
} from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import {
  createLedger9MidnightProvider,
  createLedger9WalletProvider,
  type ContractStateRead,
  type ProofProvider,
} from "@midnight-ntwrk/midnight-js-types";
import {
  fromHex,
  parseCoinPublicKeyToHex,
  parseEncPublicKeyToHex,
  toHex,
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

export async function createProviders(
  api: ConnectedAPI,
  { proving = { mode: "wallet" }, zkAssetsUrl = window.location.origin }: CreateProvidersOptions = {},
): Promise<AppProviders> {
  // The wallet decides which network the DApp is on. Everything below (indexer
  // endpoints, network ID for address decoding and the providers' config)
  // follows from its configuration. Midnight.js 5 has no global network ID.
  const config = await api.getConfiguration();

  // Pass the browser's WebSocket explicitly: the provider's default comes from
  // isomorphic-ws, whose browser build has no named WebSocket export, so it is
  // undefined once bundled.
  const publicDataProvider = indexerPublicDataProvider(
    config.indexerUri,
    config.indexerWsUri,
    globalThis.WebSocket as unknown as Parameters<typeof indexerPublicDataProvider>[2],
  );

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

  // The connector returns Bech32m-encoded keys. The ledger works with hex, so
  // normalize both. parse*ToHex passes hex through unchanged.
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await api.getShieldedAddresses();
  const coinPublicKey = parseCoinPublicKeyToHex(shieldedCoinPublicKey, config.networkId);
  const encryptionPublicKey = parseEncPublicKeyToHex(
    shieldedEncryptionPublicKey,
    config.networkId,
  );

  // createLedger9WalletProvider / createLedger9MidnightProvider lift these
  // ledger 9 only implementations into Midnight.js 5's era-tagged interfaces:
  // they hand over ledger 9 transaction handles, seal what comes back, and
  // declare supportedEras = ["v9"]. Every public network runs ledger 9.
  const walletProvider = createLedger9WalletProvider({
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
    // Midnight.js hands over a proven but unbound transaction. The wallet adds
    // DUST fee inputs, signs and binds it. The connector speaks hex strings, so
    // send the handle's bytes and read the answer as a finalized transaction.
    // The TTL is up to the wallet: the connector has no ttl parameter.
    balanceTx: async (tx, _ttl) => {
      const { tx: balancedHex } = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      return Transaction.deserialize(
        "signature",
        "proof",
        "binding",
        fromHex(balancedHex),
      ) satisfies FinalizedTransaction;
    },
  });

  // submitTransaction resolves to void, so read the transaction ID off the
  // transaction itself (the same ID the indexer reports).
  const midnightProvider = createLedger9MidnightProvider(async (handle) => {
    const bytes = handle.serialize();
    await api.submitTransaction(toHex(bytes));
    const [txId] = Transaction.deserialize("signature", "proof", "binding", bytes).identifiers();
    if (!txId) throw new Error("Submitted transaction has no identifier");
    return txId;
  });

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
    config: { networkId: config.networkId, ttlSeconds: TX_TTL_SECONDS },
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
