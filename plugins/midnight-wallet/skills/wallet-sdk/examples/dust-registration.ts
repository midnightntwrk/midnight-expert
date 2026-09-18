/**
 * Register NIGHT UTXOs for passive DUST generation.
 * Assumes wallet is already constructed and synced (see basic-wallet-setup.ts).
 *
 * Demonstrates: waitForSyncedState, estimateRegistration,
 * registerNightUtxosForDustGeneration, and deregisterFromDustGeneration.
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
import * as rx from "rxjs";

// ---------------------------------------------------------------------------
// Helper: initialize a wallet from a seed (same pattern as basic-wallet-setup)
// ---------------------------------------------------------------------------
const INDEXER_PORT = Number.parseInt(process.env["INDEXER_PORT"] ?? "8088", 10);
const NODE_PORT = Number.parseInt(process.env["NODE_PORT"] ?? "9944", 10);
const PROOF_SERVER_PORT = Number.parseInt(process.env["PROOF_SERVER_PORT"] ?? "6300", 10);

const configuration: DefaultConfiguration = {
  networkId: "undeployed",
  // No additionalFeeOverhead needed: DUST registration is self-funding — the fee
  // is paid by the DUST the registered NIGHT UTXOs generate, not from the wallet's
  // existing DUST balance, so it succeeds even at a 0 DUST balance. (Verified on a
  // local devnet.) Add additionalFeeOverhead on wallets that submit transfers or
  // contract calls — see examples/transfer-flow.ts.
  costParameters: { feeBlocksMargin: 5 },
  relayURL: new URL(`ws://localhost:${NODE_PORT}`),
  provingServerUrl: new URL(`http://localhost:${PROOF_SERVER_PORT}`),
  indexerClientConnection: {
    indexerHttpUrl: `http://localhost:${INDEXER_PORT}/api/v4/graphql`,
    indexerWsUrl: `ws://localhost:${INDEXER_PORT}/api/v4/graphql/ws`,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
};

async function initWallet(seed: Buffer) {
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== "seedOk") throw new Error("Failed to initialize HDWallet");

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derivationResult.type !== "keysDerived") throw new Error("Failed to derive keys");
  hdWallet.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], configuration.networkId);

  const wallet = await WalletFacade.init({
    configuration,
    shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (config) =>
      UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (config) =>
      DustWallet(config).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

// ---------------------------------------------------------------------------
// Initialize wallet with NIGHT tokens already available
// ---------------------------------------------------------------------------
const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await initWallet(
  Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex"),
);

const syncedState = await wallet.waitForSyncedState();
const nightCoins = syncedState.unshielded.availableCoins;
console.log("Available NIGHT UTXOs before registration:", nightCoins.length);

// ---------------------------------------------------------------------------
// Estimate registration cost (optional — useful for UI display)
// ---------------------------------------------------------------------------
const estimate = await wallet.estimateRegistration(nightCoins);
console.log("Registration fee estimate:", estimate.fee);
console.log("Dust generation estimations:", estimate.dustGenerationEstimations.length, "UTXOs");

// ---------------------------------------------------------------------------
// Register NIGHT UTXOs for DUST generation
// ---------------------------------------------------------------------------
// nightVerifyingKey comes from unshieldedKeystore.getPublicKey()
await wallet
  .registerNightUtxosForDustGeneration(
    nightCoins,
    unshieldedKeystore.getPublicKey(),
    (payload) => unshieldedKeystore.signData(payload),
  )
  .then((recipe) => wallet.finalizeRecipe(recipe))
  .then((finalizedTransaction) => wallet.submitTransaction(finalizedTransaction));

// Wait until DUST coins appear
const stateAfterRegistration = await rx.firstValueFrom(
  wallet.state().pipe(
    rx.filter((s) => s.isSynced),
    rx.filter((s) => s.dust.availableCoins.length > 0),
  ),
);

console.log("DUST coins after registration:", stateAfterRegistration.dust.availableCoins.length);
console.log(
  "Registered coins:",
  stateAfterRegistration.unshielded.availableCoins.filter(
    (coin) => coin.meta.registeredForDustGeneration,
  ).length,
);

// ---------------------------------------------------------------------------
// Deregister from DUST generation
// ---------------------------------------------------------------------------
const registeredCoins = stateAfterRegistration.unshielded.availableCoins.filter(
  (coin) => coin.meta.registeredForDustGeneration,
);

await wallet
  .deregisterFromDustGeneration(
    [registeredCoins[0]],
    unshieldedKeystore.getPublicKey(),
    (payload) => unshieldedKeystore.signData(payload),
  )
  .then((recipe) =>
    wallet.balanceUnprovenTransaction(
      recipe.transaction,
      { shieldedSecretKeys, dustSecretKey },
      {
        ttl: new Date(Date.now() + 30 * 60 * 1000),
        tokenKindsToBalance: ["dust"],
      },
    ),
  )
  .then((recipe) => wallet.finalizeRecipe(recipe))
  .then((finalizedTransaction) => wallet.submitTransaction(finalizedTransaction));

const stateAfterDeregistration = await rx.firstValueFrom(
  wallet.state().pipe(
    rx.filter((s) => s.isSynced),
    rx.filter(
      (s) => s.unshielded.availableCoins.filter((c) => !c.meta.registeredForDustGeneration).length > 0,
    ),
  ),
);

console.log(
  "Registered coins after deregistration:",
  stateAfterDeregistration.unshielded.availableCoins.filter(
    (coin) => coin.meta.registeredForDustGeneration,
  ).length,
);

// ---------------------------------------------------------------------------
// Clean up
// ---------------------------------------------------------------------------
await wallet.stop();
