// Verified against the package versions pinned in
// midnight-wallet:sdk-regression-check/versions.lock.json on 2026-06-02.
// If your installed @midnightntwrk/wallet-sdk-* versions differ,
// run scripts/drift-check.sh in that skill before trusting this template.

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "buffer";
import { WalletSeeds } from "@midnightntwrk/wallet-sdk-hd";
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
import * as ledger from "@midnightntwrk/ledger-v9";
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(): Uint8Array {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: monitor-wallet.ts <wallet-seed-hex>");
    console.error("  wallet-seed-hex — 64 hex characters (32 bytes)");
    process.exit(1);
  }

  const hex = args[0].replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error("Error: seed must be exactly 64 hex characters (32 bytes).");
    process.exit(1);
  }

  return Buffer.from(hex, "hex");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = parseArgs();

  // ─── Step 1: HD derivation ────────────────────────────────────────────────

  // WalletSeeds.fromMasterSeed walks the same HD path the 1.x HDWallet code
  // did (account 0, roles Zswap / NightExternal / Dust, index 0), so the
  // same master seed gives the same wallet and addresses.
  const seeds = WalletSeeds.fromMasterSeed(seed);
  const unshieldedKeystore = createKeystore(
    { kind: "schnorr", secret: seeds.unshielded },
    "undeployed"
  );

  // ─── Step 3: Configuration (local devnet) ─────────────────────────────────

  const configuration: DefaultConfiguration = {
    networkId: "undeployed",
    costParameters: { feeBlocksMargin: 5 },
    relayURL: new URL("ws://localhost:9944"),
    provingServerUrl: new URL("http://localhost:6300"),
    indexerClientConnection: {
      indexerHttpUrl: "http://localhost:8088/api/v4/graphql",
      indexerWsUrl: "ws://localhost:8088/api/v4/graphql/ws",
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
  };

  // ─── Step 4: Wallet facade init ───────────────────────────────────────────

  const wallet = await WalletFacade.init({
    configuration,
    shielded: (cfg) =>
      ShieldedWallet(cfg).startWithSeed(seeds.shielded),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore)
      ),
    dust: (cfg) =>
      DustWallet(cfg).startWithSeed(seeds.dust),
  });

  // ─── Step 5: Start wallet ─────────────────────────────────────────────────

  await wallet.start(seeds);

  // ─── Step 6: SIGINT handler ───────────────────────────────────────────────

  process.on("SIGINT", async () => {
    await wallet.stop();
    process.exit(0);
  });

  // ─── Step 7: Subscribe to state and print live ticker ────────────────────

  const NIGHT_TOKEN_TYPE = ledger.unshieldedToken().raw;

  wallet.state().subscribe((state) => {
    const timestamp = new Date().toISOString();
    const sync = state.isSynced;
    const night = state.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;

    // Convert bigint values to strings in the shielded balances map for
    // JSON.stringify (which cannot serialize bigint by default).
    const shieldedBalances = state.shielded.balances;
    const shieldedJson = JSON.stringify(
      shieldedBalances,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value)
    );

    const dust = state.dust.balance(new Date());

    console.log(
      `[${timestamp}] sync=${sync} NIGHT=${night.toString()} SHIELDED=${shieldedJson} DUST=${dust.toString()}`
    );
  });

  // Keep the process alive until SIGINT — the subscription drives everything.
  await new Promise<never>(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
