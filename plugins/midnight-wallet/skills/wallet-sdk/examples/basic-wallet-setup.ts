/**
 * Complete wallet construction from seed to synced state.
 * Covers: seed generation, HD derivation, key conversion, configuration,
 * WalletFacade initialization, and waiting for sync.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { HDWallet, Roles, generateRandomSeed } from "@midnightntwrk/wallet-sdk-hd";
import { WalletFacade, WalletEntrySchema } from "@midnightntwrk/wallet-sdk-facade";
import type { DefaultConfiguration } from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { Buffer } from "buffer";

// ---------------------------------------------------------------------------
// Step 1 - Generate a random seed (or use a known one for testing)
// ---------------------------------------------------------------------------
const seed = Buffer.from(generateRandomSeed());
// For deterministic testing you can use a fixed hex seed instead:
// const seed = Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex");

// ---------------------------------------------------------------------------
// Step 2 - Derive keys via the HD wallet
// ---------------------------------------------------------------------------
const hdWallet = HDWallet.fromSeed(seed);

if (hdWallet.type !== "seedOk") {
  throw new Error("Failed to initialize HDWallet");
}

const derivationResult = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);

if (derivationResult.type !== "keysDerived") {
  throw new Error("Failed to derive keys");
}

// Clear the HD wallet from memory after derivation
hdWallet.hdWallet.clear();

// ---------------------------------------------------------------------------
// Step 3 - Convert derived bytes into typed secret keys
// ---------------------------------------------------------------------------
const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);

// ---------------------------------------------------------------------------
// Step 4 - Build configuration
// ---------------------------------------------------------------------------
const INDEXER_PORT = Number.parseInt(process.env["INDEXER_PORT"] ?? "8088", 10);
const NODE_PORT = Number.parseInt(process.env["NODE_PORT"] ?? "9944", 10);
const PROOF_SERVER_PORT = Number.parseInt(process.env["PROOF_SERVER_PORT"] ?? "6300", 10);

const configuration: DefaultConfiguration = {
  networkId: "undeployed",
  costParameters: {
    feeBlocksMargin: 5,
    // Forces a non-zero DUST fee so transactions normalize on an idle local
    // devnet (a zero fee is rejected as NotNormalized, error 117). Any positive
    // amount the wallet can cover in DUST works.
    additionalFeeOverhead: 1_000_000n,
  },
  relayURL: new URL(`ws://localhost:${NODE_PORT}`),
  provingServerUrl: new URL(`http://localhost:${PROOF_SERVER_PORT}`),
  indexerClientConnection: {
    indexerHttpUrl: `http://localhost:${INDEXER_PORT}/api/v4/graphql`,
    indexerWsUrl: `ws://localhost:${INDEXER_PORT}/api/v4/graphql/ws`,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
};

// ---------------------------------------------------------------------------
// Step 5 - Create the unshielded keystore and initialize WalletFacade
// ---------------------------------------------------------------------------
const unshieldedKeystore = createKeystore(
  derivationResult.keys[Roles.NightExternal],
  configuration.networkId,
);

const wallet: WalletFacade = await WalletFacade.init({
  configuration,
  shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (config) =>
    UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
  dust: (config) =>
    DustWallet(config).startWithSecretKey(
      dustSecretKey,
      ledger.LedgerParameters.initialParameters().dust,
    ),
});

// ---------------------------------------------------------------------------
// Step 6 - Start the wallet and wait for sync
// ---------------------------------------------------------------------------
await wallet.start(shieldedSecretKeys, dustSecretKey);

const syncedState = await wallet.waitForSyncedState();

console.log("Wallet synced successfully");
console.log("Shielded balances:", syncedState.shielded.balances);
console.log("Unshielded balances:", syncedState.unshielded.balances);

// Always stop the wallet when done
await wallet.stop();
