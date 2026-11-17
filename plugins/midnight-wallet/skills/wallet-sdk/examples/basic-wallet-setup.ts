/**
 * Complete wallet construction from seed to synced state (wallet SDK 2.0.0).
 * Covers: seed generation, per-wallet seed derivation, configuration,
 * WalletFacade initialization, and waiting until the wallet is synced and
 * its three sub-wallets agree on the protocol version.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { WalletSeeds, generateRandomSeed } from "@midnightntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
  mergeWalletEntries,
  type DefaultConfiguration,
} from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
import { firstValueFrom } from "rxjs";
import { filter } from "rxjs/operators";
import { Buffer } from "buffer";

// ---------------------------------------------------------------------------
// Step 1 - Generate a random master seed (or use a known one for testing)
// ---------------------------------------------------------------------------
const masterSeed = Buffer.from(generateRandomSeed());
// For deterministic testing you can use a fixed hex seed instead:
// const masterSeed = Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex");

// ---------------------------------------------------------------------------
// Step 2 - Derive the three wallets' seeds
// ---------------------------------------------------------------------------
// WalletSeeds.fromMasterSeed walks the same HD path the 1.x HDWallet code did
// (account 0, roles Zswap / NightExternal / Dust, index 0), so a master seed
// from wallet SDK 1.x restores the same wallet and the same addresses.
const seeds = WalletSeeds.fromMasterSeed(masterSeed);

// ---------------------------------------------------------------------------
// Step 3 - Build configuration
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
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
};

// ---------------------------------------------------------------------------
// Step 4 - Create the unshielded keystore and initialize WalletFacade
// ---------------------------------------------------------------------------
// The keystore signs for the unshielded wallet. "schnorr" is the scheme that
// works on both sides of the ledger 9 boundary.
const unshieldedKeystore = createKeystore(
  { kind: "schnorr", secret: seeds.unshielded },
  configuration.networkId,
);

const wallet: WalletFacade = await WalletFacade.init({
  configuration,
  shielded: (config) => ShieldedWallet(config).startWithSeed(seeds.shielded),
  unshielded: (config) =>
    UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
  dust: (config) => DustWallet(config).startWithSeed(seeds.dust),
});

// ---------------------------------------------------------------------------
// Step 5 - Start the wallet and wait until it is synced and settled
// ---------------------------------------------------------------------------
// start() takes the seeds, not key objects: a seed is the only key material
// that crosses the ledger 8 / ledger 9 boundary.
await wallet.start(seeds);

// isSynced alone isn't enough to build transactions. While a sub-wallet is
// still behind the protocol boundary the facade reports protocol "Crossing",
// and a transaction built then can fail with ProtocolVersionMismatchError.
const syncedState = await firstValueFrom(
  wallet.state().pipe(filter((s) => s.isSynced && s.protocol._tag === "Settled")),
);

console.log("Wallet synced successfully");
console.log("Shielded balances:", syncedState.shielded.balances);
console.log("Unshielded balances:", syncedState.unshielded.balances);

// Always stop the wallet when done
await wallet.stop();
