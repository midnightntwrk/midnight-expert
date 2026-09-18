/**
 * Subscribe to wallet state and monitor balances.
 * Assumes wallet is already constructed and started (see basic-wallet-setup.ts).
 *
 * Demonstrates: waitForSyncedState one-shot, dust.balance(new Date()) for
 * time-dependent balance, wallet.state().subscribe for continuous monitoring,
 * sync progress reporting, and subscription cleanup.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
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

const { wallet } = await initWallet(
  Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex"),
);

// ---------------------------------------------------------------------------
// One-shot: wait for initial sync and inspect state
// ---------------------------------------------------------------------------
const syncedState = await wallet.waitForSyncedState();

console.log("=== Initial Synced State ===");
console.log("Shielded balances:", syncedState.shielded.balances);
console.log("Shielded available coins:", syncedState.shielded.availableCoins.length);
console.log("Unshielded balances:", syncedState.unshielded.balances);
console.log("Unshielded available coins:", syncedState.unshielded.availableCoins.length);

// DUST balance is time-dependent — pass the current date to get the accrued amount
console.log("DUST balance (now):", syncedState.dust.balance(new Date()));
console.log("DUST available coins:", syncedState.dust.availableCoins.length);

// ---------------------------------------------------------------------------
// Sync progress reporting
// ---------------------------------------------------------------------------
// Each sub-wallet exposes a progress field with appliedIndex and highestIndex
console.log("\n=== Sync Progress ===");
console.log("Shielded progress:", syncedState.shielded.progress);
console.log("Unshielded progress:", syncedState.unshielded.progress);
console.log("Dust progress:", syncedState.dust.progress);

// ---------------------------------------------------------------------------
// Continuous observation: subscribe to wallet.state() observable
// ---------------------------------------------------------------------------
console.log("\n=== Starting continuous state observation ===");

const subscription = wallet.state().subscribe({
  next: (state) => {
    if (!state.isSynced) {
      // Report sync progress while catching up
      const shieldedProgress = state.shielded.progress;
      console.log(
        `Syncing... shielded: ${shieldedProgress.appliedIndex}/${shieldedProgress.highestIndex}`,
      );
      return;
    }

    // Report balances once synced
    console.log("--- Synced state update ---");
    console.log("  Unshielded NIGHT:", state.unshielded.balances[ledger.nativeToken().raw] ?? 0n);
    console.log("  Shielded balance:", state.shielded.balances[ledger.shieldedToken().raw] ?? 0n);
    console.log("  DUST balance:", state.dust.balance(new Date()));
    console.log("  Pending transactions:", state.pending.all.length);
  },
  error: (err) => console.error("State observation error:", err),
  complete: () => console.log("State observation completed"),
});

// ---------------------------------------------------------------------------
// Wait for a specific condition using rxjs operators
// ---------------------------------------------------------------------------
// Example: wait until we see a synced state with at least one unshielded coin
const stateWithCoins = await rx.firstValueFrom(
  wallet.state().pipe(
    rx.filter((s) => s.isSynced),
    rx.filter((s) => s.unshielded.availableCoins.length > 0),
    rx.timeout(60_000), // fail after 60 seconds
  ),
);

console.log(
  "\nFound state with unshielded coins:",
  stateWithCoins.unshielded.availableCoins.length,
);

// ---------------------------------------------------------------------------
// Clean up: always unsubscribe and stop the wallet
// ---------------------------------------------------------------------------
subscription.unsubscribe();
await wallet.stop();

console.log("\nWallet stopped and subscriptions cleaned up.");
