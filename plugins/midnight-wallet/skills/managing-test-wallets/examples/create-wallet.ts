// Verified against the package versions pinned in
// midnight-wallet:sdk-regression-check/versions.lock.json on 2026-06-02.
// If your installed @midnightntwrk/wallet-sdk-* versions differ,
// run scripts/drift-check.sh in that skill before trusting this template.

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "buffer";
import { firstValueFrom as rxFirstValueFrom, filter as rxFilter } from "rxjs";
import {
  WalletSeeds,
  generateRandomSeed,
  validateMnemonic,
} from "@midnightntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  type FacadeState,
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
import { mnemonicToSeedSync } from "@scure/bip39";

// Synced, and all three sub-wallets on the same protocol version. A wallet that
// synced across the ledger 9 fork reports protocol "Crossing" until the last
// sub-wallet catches up, and a transaction built then can fail with
// ProtocolVersionMismatchError, so wait for "Settled" before building one.
function waitForSettled(wallet: WalletFacade): Promise<FacadeState> {
  return rxFirstValueFrom(
    wallet.state().pipe(rxFilter((s) => s.isSynced && s.protocol._tag === "Settled"))
  );
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(): Uint8Array {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Mode 1: random seed
    return generateRandomSeed();
  }

  if (args[0] === "--seed" && args[1]) {
    // Mode 2: hex seed
    const hex = args[1].replace(/^0x/, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      console.error(
        "Error: --seed must be exactly 64 hex characters (32 bytes)."
      );
      process.exit(1);
    }
    return Buffer.from(hex, "hex");
  }

  if (args[0] === "--mnemonic" && args[1]) {
    const phrase = args[1];
    if (!validateMnemonic(phrase)) {
      console.error("Error: invalid BIP-39 mnemonic.");
      process.exit(1);
    }
    return mnemonicToSeedSync(phrase);
  }

  console.error(
    "Usage: create-wallet.ts [--seed <64-hex-chars>] [--mnemonic \"<24-word phrase>\"]"
  );
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = parseArgs();

  // Step 1: Derive the three wallets' seeds
  // WalletSeeds.fromMasterSeed walks the same HD path the 1.x HDWallet code
  // did (account 0, roles Zswap / NightExternal / Dust, index 0), so the
  // same master seed gives the same wallet and addresses.
  const seeds = WalletSeeds.fromMasterSeed(seed);
  const unshieldedKeystore = createKeystore(
    { kind: "schnorr", secret: seeds.unshielded },
    "undeployed"
  );

  // Step 3: Configuration (local devnet)
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

  // Step 4: Wallet facade init
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

  // Step 5: Start sync
  await wallet.start(seeds);

  // Step 6: Wait for synced state
  const state = await waitForSettled(wallet);

  // Step 7: Extract addresses as bech32 strings
  const unshieldedAddr = MidnightBech32m.encode(
    "undeployed",
    state.unshielded.address
  ).asString();
  const shieldedAddr = MidnightBech32m.encode(
    "undeployed",
    state.shielded.address
  ).asString();
  const dustAddr = MidnightBech32m.encode(
    "undeployed",
    state.dust.address
  ).asString();

  // Step 8: Read NIGHT balance
  const NIGHT_TOKEN_TYPE = ledger.unshieldedToken().raw;
  const night = state.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;

  // Step 9: Print results
  console.log(`Unshielded: ${unshieldedAddr}`);
  console.log(`Shielded:   ${shieldedAddr}`);
  console.log(`Dust:       ${dustAddr}`);
  console.log(`NIGHT:      ${night}`);

  await wallet.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
