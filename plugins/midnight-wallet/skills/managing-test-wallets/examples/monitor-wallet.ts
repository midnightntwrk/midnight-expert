// Verified against the package versions pinned in
// midnight-wallet:sdk-regression-check/versions.lock.json on 2026-06-02.
// If your installed @midnightntwrk/wallet-sdk-* versions differ,
// run scripts/drift-check.sh in that skill before trusting this template.

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "buffer";
import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
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
import * as ledger from "@midnight-ntwrk/ledger-v8";
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

  const hd = HDWallet.fromSeed(seed);
  if (hd.type !== "seedOk") {
    console.error(`HDWallet.fromSeed failed: ${hd.type}`);
    process.exit(1);
  }
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust] as const)
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") {
    console.error(`deriveKeysAt failed: ${derived.type}`);
    process.exit(1);
  }
  hd.hdWallet.clear();
  const derivedKeys = derived.keys as Record<number, Uint8Array>;

  // ─── Step 2: Key conversion ───────────────────────────────────────────────

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(
    derivedKeys[Roles.Zswap]
  );
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivedKeys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(
    derivedKeys[Roles.NightExternal],
    "undeployed"
  );

  // ─── Step 3: Configuration (local devnet) ─────────────────────────────────

  const configuration: DefaultConfiguration = {
    networkId: "undeployed",
    costParameters: { feeBlocksMargin: 5 },
    relayURL: new URL("ws://localhost:9944"),
    provingServerUrl: new URL("http://localhost:6300"),
    indexerClientConnection: {
      indexerHttpUrl: "http://localhost:8088/api/v3/graphql",
      indexerWsUrl: "ws://localhost:8088/api/v3/graphql/ws",
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
  };

  // ─── Step 4: Wallet facade init ───────────────────────────────────────────

  const wallet = await WalletFacade.init({
    configuration,
    shielded: (cfg) =>
      ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore)
      ),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust
      ),
  });

  // ─── Step 5: Start wallet ─────────────────────────────────────────────────

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  // ─── Step 6: SIGINT handler ───────────────────────────────────────────────

  process.on("SIGINT", async () => {
    await wallet.stop();
    process.exit(0);
  });

  // ─── Step 7: Subscribe to state and print live ticker ────────────────────

  const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;

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
