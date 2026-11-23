/**
 * Subscribe to wallet state and monitor balances (wallet SDK 2.0.1).
 * Assumes wallet is already constructed and started (see basic-wallet-setup.ts).
 *
 * Demonstrates: a one-shot wait for a synced, settled state,
 * dust.balance(new Date()) for the time-dependent balance,
 * wallet.state().subscribe for continuous monitoring, sync progress
 * and protocol reporting, and subscription cleanup.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { WalletSeeds } from "@midnightntwrk/wallet-sdk-hd";
import {
  isAwaiting,
  WalletFacade,
  WalletEntrySchema,
  mergeWalletEntries,
  type DefaultConfiguration,
  type FacadeState,
} from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
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

const { wallet } = await initWallet(
  Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex"),
);

// ---------------------------------------------------------------------------
// One-shot: wait for initial sync and inspect state
// ---------------------------------------------------------------------------
const syncedState = await settled(wallet);

console.log("=== Initial Synced State ===");
console.log("Shielded balances:", syncedState.shielded.balances);
console.log("Shielded available coins:", syncedState.shielded.availableCoins.length);
console.log("Unshielded balances:", syncedState.unshielded.balances);
console.log("Unshielded available coins:", syncedState.unshielded.availableCoins.length);

// DUST balance is time-dependent - pass the current date to get the accrued amount
console.log("DUST balance (now):", syncedState.dust.balance(new Date()));
console.log("DUST available coins:", syncedState.dust.availableCoins.length);

// ---------------------------------------------------------------------------
// Sync progress and protocol reporting
// ---------------------------------------------------------------------------
// Each sub-wallet exposes progress (appliedIndex, highestIndex, isConnected).
// highestIndex can stay 0 while a sub-wallet replays events, so don't build a
// percentage from it. protocol is "Settled" once all three sub-wallets are on
// the same protocol version, and "Crossing" while one is still behind a fork.
console.log("\n=== Sync Progress ===");
console.log("Shielded progress:", syncedState.shielded.progress);
console.log("Unshielded progress:", syncedState.unshielded.progress);
console.log("Dust progress:", syncedState.dust.progress);
console.log("Protocol:", syncedState.protocol);

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
        `Syncing... shielded applied ${shieldedProgress.appliedIndex}, protocol ${state.protocol._tag}`,
      );
      return;
    }

    // Report balances once synced
    console.log("--- Synced state update ---");
    console.log("  Unshielded NIGHT:", state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n);
    console.log("  Shielded balance:", state.shielded.balances[ledger.shieldedToken().raw] ?? 0n);
    console.log("  DUST balance:", state.dust.balance(new Date()));
    console.log("  Transactions awaiting a result:", state.lifecycle.filter(isAwaiting).length);
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
