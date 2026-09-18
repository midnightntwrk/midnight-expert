// Verified against the package versions pinned in
// midnight-wallet:sdk-regression-check/versions.lock.json on 2026-06-02.
// If your installed @midnightntwrk/wallet-sdk-* versions differ,
// run scripts/drift-check.sh in that skill before trusting this template.

// This script needs the wallet seed because it builds a WalletFacade to
// subscribe to balance changes. The seed is only used locally to drive the
// SDK's sync; nothing is sent off-machine.

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
import { firstValueFrom } from "rxjs";
import { filter, timeout } from "rxjs/operators";

// ─── Network config ───────────────────────────────────────────────────────────

type PublicNetwork = "preprod" | "preview";

const NETWORK_CONFIG: Record<
  PublicNetwork,
  {
    relayURL: URL;
    indexerHttpUrl: string;
    indexerWsUrl: string;
    faucetUrl: string;
    networkId: "preprod" | "preview";
  }
> = {
  preprod: {
    relayURL: new URL("wss://rpc.preprod.midnight.network"),
    indexerHttpUrl:
      "https://indexer.preprod.midnight.network/api/v3/graphql",
    indexerWsUrl:
      "wss://indexer.preprod.midnight.network/api/v3/graphql/ws",
    faucetUrl: "https://faucet.preprod.midnight.network/",
    networkId: "preprod",
  },
  preview: {
    relayURL: new URL("wss://rpc.preview.midnight.network"),
    indexerHttpUrl:
      "https://indexer.preview.midnight.network/api/v3/graphql",
    indexerWsUrl:
      "wss://indexer.preview.midnight.network/api/v3/graphql/ws",
    faucetUrl: "https://faucet.preview.midnight.network/",
    networkId: "preview",
  },
};

const SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const FUND_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(): { seed: Uint8Array; network: PublicNetwork } {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: fund-wallet-public-faucet.ts <wallet-seed-hex> <network: preprod|preview>"
    );
    console.error("  wallet-seed-hex — 64 hex characters (32 bytes)");
    console.error("  network         — preprod or preview");
    process.exit(1);
  }

  const hex = args[0].replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error(
      "Error: seed must be exactly 64 hex characters (32 bytes)."
    );
    process.exit(1);
  }
  const seed = Buffer.from(hex, "hex");

  const network = args[1];
  if (network !== "preprod" && network !== "preview") {
    console.error(`Error: network must be 'preprod' or 'preview', got '${network}'.`);
    console.error(
      "Usage: fund-wallet-public-faucet.ts <wallet-seed-hex> <network: preprod|preview>"
    );
    process.exit(1);
  }

  return { seed, network };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { seed, network } = parseArgs();
  const netCfg = NETWORK_CONFIG[network];

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
    netCfg.networkId
  );

  // ─── Step 3: Configuration (public testnet) ───────────────────────────────
  // Proof server runs locally even for public testnets.

  const configuration: DefaultConfiguration = {
    networkId: netCfg.networkId,
    costParameters: { feeBlocksMargin: 5 },
    relayURL: netCfg.relayURL,
    provingServerUrl: new URL("http://localhost:6300"),
    indexerClientConnection: {
      indexerHttpUrl: netCfg.indexerHttpUrl,
      indexerWsUrl: netCfg.indexerWsUrl,
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

  // ─── Step 5: Start wallet and derive unshielded address ──────────────────
  // The unshielded address is a pure function of the derived public key and
  // network ID. wallet.state() emits an initial value immediately after start,
  // before sync completes — so we can print the address right away and let the
  // user paste it into the faucet while the sync runs in the background.

  const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  // Grab the address from the very first state emission (before sync completes).
  const initialState = await firstValueFrom(wallet.state());
  const unshieldedAddr = MidnightBech32m.encode(
    netCfg.networkId,
    initialState.unshielded.address
  ).asString();

  // ─── Step 6: Print the four output lines ─────────────────────────────────

  console.log(`Network:                ${network}`);
  console.log(`Address:                ${unshieldedAddr}`);
  console.log(`Faucet URL:             ${netCfg.faucetUrl}`);
  console.log(`Watching for funds (timeout: 5 minutes)...`);

  // ─── Step 7: SIGINT handler ───────────────────────────────────────────────

  process.on("SIGINT", async () => {
    await wallet.stop();
    process.exit(0);
  });

  // ─── Step 8: Wait for sync to complete (5-minute timeout) ────────────────
  // The subscription below needs a synced wallet to reliably detect incoming
  // funds. We wait for sync before starting the balance watch.

  try {
    const syncPromise = wallet.waitForSyncedState();
    const syncTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Timed out waiting for initial sync")),
        SYNC_TIMEOUT_MS
      )
    );
    await Promise.race([syncPromise, syncTimeoutPromise]);
  } catch (err) {
    console.error(`Error: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 9: Watch for incoming NIGHT (5-minute timeout) ─────────────────

  try {
    const fundedState = await firstValueFrom(
      wallet.state().pipe(
        filter((s) => (s.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n) > 0n),
        timeout(FUND_TIMEOUT_MS)
      )
    );

    const balance = fundedState.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
    console.log(`Balance arrived: ${balance}`);
    await wallet.stop();
    process.exit(0);
  } catch {
    console.log(
      "Timeout — no funds arrived. Verify you pasted the correct address."
    );
    await wallet.stop();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
