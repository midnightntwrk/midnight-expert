/**
 * Register NIGHT UTXOs for passive DUST generation (wallet SDK 2.0.0).
 * Assumes wallet is already constructed and synced (see basic-wallet-setup.ts).
 *
 * Demonstrates: estimateRegistration, registerNightUtxosForDustGeneration,
 * and deregisterFromDustGeneration.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { WalletSeeds, generateRandomSeed } from "@midnightntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
  mergeWalletEntries,
  type DefaultConfiguration,
  type FacadeState,
  type UtxoWithMeta,
} from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet, isInsufficientDustForFeeError } from "@midnightntwrk/wallet-sdk-dust-wallet";
import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
import * as ledger from "@midnightntwrk/ledger-v9";
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
  // No additionalFeeOverhead needed for a first registration: it pays its own fee
  // from the DUST the registered NIGHT UTXOs would have generated since they were
  // created, not from the wallet's DUST balance, so it works at a 0 DUST balance.
  // Add additionalFeeOverhead on wallets that submit transfers or contract calls -
  // see examples/transfer-flow.ts.
  costParameters: { feeBlocksMargin: 5 },
  relayURL: new URL(`ws://localhost:${NODE_PORT}`),
  provingServerUrl: new URL(`http://localhost:${PROOF_SERVER_PORT}`),
  indexerClientConnection: {
    indexerHttpUrl: `http://localhost:${INDEXER_PORT}/api/v4/graphql`,
    indexerWsUrl: `ws://localhost:${INDEXER_PORT}/api/v4/graphql/ws`,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
};

async function initWallet(masterSeed: Buffer) {
  const seeds = WalletSeeds.fromMasterSeed(masterSeed);
  const unshieldedKeystore = createKeystore(
    { kind: "schnorr", secret: seeds.unshielded },
    configuration.networkId,
  );
  const wallet = await WalletFacade.init({
    configuration,
    shielded: (config) => ShieldedWallet(config).startWithSeed(seeds.shielded),
    unshielded: (config) =>
      UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (config) => DustWallet(config).startWithSeed(seeds.dust),
  });
  await wallet.start(seeds);
  return { wallet, unshieldedKeystore };
}

// Synced, and all three sub-wallets on the same protocol version. Build
// transactions only from a state like this (see basic-wallet-setup.ts).
const settled = (wallet: WalletFacade): Promise<FacadeState> =>
  rx.firstValueFrom(
    wallet.state().pipe(rx.filter((s) => s.isSynced && s.protocol._tag === "Settled")),
  );

// ---------------------------------------------------------------------------
// Initialize wallet with NIGHT tokens already available
// ---------------------------------------------------------------------------
const { wallet, unshieldedKeystore } = await initWallet(
  Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex"),
);

const NIGHT = ledger.unshieldedToken().raw;
const isUnregisteredNight = (coin: UtxoWithMeta) =>
  coin.utxo.type === NIGHT && !coin.meta.registeredForDustGeneration;

const syncedState = await settled(wallet);
const nightCoins = syncedState.unshielded.availableCoins.filter(isUnregisteredNight);
console.log("Unregistered NIGHT UTXOs before registration:", nightCoins.length);

// ---------------------------------------------------------------------------
// Register NIGHT UTXOs for DUST generation
// ---------------------------------------------------------------------------
// A first registration pays its own fee from the DUST the NIGHT has generated
// since it arrived. If that doesn't cover the fee yet, the call throws
// InsufficientDustForFeeError with an estimate of when it will; wait that long
// plus a margin and retry. An unreachable fee is a real error.
// The signing callback returns a Promise in 2.0.0; signDataAsync has that shape.
async function registerForDust(coins: readonly UtxoWithMeta[]): Promise<void> {
  const register = () =>
    wallet.registerNightUtxosForDustGeneration(
      coins,
      unshieldedKeystore.getPublicKey(),
      unshieldedKeystore.signDataAsync,
    );
  const recipe = await register().catch(async (error: unknown) => {
    if (!isInsufficientDustForFeeError(error) || error.estimate._tag !== "Reachable") throw error;
    const timeoutMs = Number(error.estimate.seconds) * 1000 + 60_000;
    await wallet.waitForGeneratedDust(coins, error.fee, { timeoutMs });
    return register();
  });
  await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
}

// Registering an empty list fails ("No guaranteedUnshieldedOffer found in
// intent"). The genesis wallet on a local devnet is registered already, so
// skip straight to the deregistration below in that case.
if (nightCoins.length > 0) {
  // Estimate the cost (optional, handy for a UI)
  const estimate = await wallet.estimateRegistration(nightCoins);
  console.log("Registration fee estimate:", estimate.fee);
  console.log("Dust generation estimations:", estimate.dustGenerationEstimations.length, "UTXOs");

  await registerForDust(nightCoins);
}

// Wait until the registration lands and DUST coins appear
const stateAfterRegistration = await rx.firstValueFrom(
  wallet.state().pipe(
    rx.filter((s) => s.isSynced),
    rx.filter(
      (s) =>
        s.unshielded.availableCoins.filter(isUnregisteredNight).length === 0 &&
        s.dust.availableCoins.length > 0,
    ),
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
// A change to NIGHT that is already registered can't pay its own fee, so
// balance it with DUST before finalizing.
const registeredCoins = stateAfterRegistration.unshielded.availableCoins.filter(
  (coin) => coin.meta.registeredForDustGeneration,
);

await wallet
  .deregisterFromDustGeneration(
    [registeredCoins[0]],
    unshieldedKeystore.getPublicKey(),
    unshieldedKeystore.signDataAsync,
  )
  .then((recipe) =>
    wallet.balanceUnprovenTransaction(recipe.transaction, {
      ttl: new Date(Date.now() + 30 * 60 * 1000),
      tokenKindsToBalance: ["dust"],
    }),
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
// Register it again
// ---------------------------------------------------------------------------
// The genesis wallet pays fees for every other example on the devnet, so put
// back the generation this example took away.
await registerForDust(stateAfterDeregistration.unshielded.availableCoins.filter(isUnregisteredNight));
await rx.firstValueFrom(
  wallet.state().pipe(
    rx.filter((s) => s.isSynced),
    rx.filter((s) => s.unshielded.availableCoins.filter(isUnregisteredNight).length === 0),
  ),
);
console.log("Re-registered; every NIGHT UTXO generates DUST again.");

// ---------------------------------------------------------------------------
// Clean up
// ---------------------------------------------------------------------------
await wallet.stop();
