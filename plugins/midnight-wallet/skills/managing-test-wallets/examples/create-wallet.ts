// Verified against the package versions pinned in
// midnight-wallet:sdk-regression-check/versions.lock.json on 2026-06-02.
// If your installed @midnightntwrk/wallet-sdk-* versions differ,
// run scripts/drift-check.sh in that skill before trusting this template.

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "buffer";
import {
  HDWallet,
  Roles,
  generateRandomSeed,
  validateMnemonic,
} from "@midnightntwrk/wallet-sdk-hd";
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
import { mnemonicToSeedSync } from "@scure/bip39";

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

  // Step 1: HD derivation
  const hdResult = HDWallet.fromSeed(seed);
  if (hdResult.type !== "seedOk") {
    console.error(`HDWallet.fromSeed failed: ${hdResult.type}`);
    process.exit(1);
  }
  const derived = hdResult.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust] as const)
    .deriveKeysAt(0);

  if (derived.type !== "keysDerived") {
    console.error(`deriveKeysAt failed: ${derived.type}`);
    process.exit(1);
  }
  hdResult.hdWallet.clear();
  const derivedKeys = derived.keys as Record<number, Uint8Array>;

  // Step 2: Key conversion
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(
    derivedKeys[Roles.Zswap]
  );
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivedKeys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(
    derivedKeys[Roles.NightExternal],
    "undeployed"
  );

  // Step 3: Configuration (local devnet)
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

  // Step 4: Wallet facade init
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

  // Step 5: Start sync
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  // Step 6: Wait for synced state
  const state = await wallet.waitForSyncedState();

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
  const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
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
