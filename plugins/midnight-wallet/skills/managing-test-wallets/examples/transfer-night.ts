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
  type CombinedTokenTransfer,
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
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(): {
  senderSeed: Uint8Array;
  recipientBech32: string;
  amount: bigint;
} {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error(
      "Usage: transfer-night.ts <sender-seed-hex> <recipient-unshielded-bech32> <amount-bigint>"
    );
    console.error("  sender-seed-hex              — 64 hex characters (32 bytes)");
    console.error("  recipient-unshielded-bech32  — bech32m unshielded address");
    console.error("  amount-bigint                — NIGHT amount in smallest units");
    process.exit(1);
  }

  const hex = args[0].replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error("Error: sender seed must be exactly 64 hex characters (32 bytes).");
    process.exit(1);
  }
  const senderSeed = Buffer.from(hex, "hex");

  const recipientBech32 = args[1];

  let amount: bigint;
  try {
    amount = BigInt(args[2]);
  } catch {
    console.error(`Error: invalid amount '${args[2]}' — must be a valid bigint.`);
    process.exit(1);
  }

  return { senderSeed, recipientBech32, amount };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { senderSeed, recipientBech32, amount } = parseArgs();

  // Decode recipient bech32 to UnshieldedAddress
  let recipientUnshielded: UnshieldedAddress;
  try {
    recipientUnshielded = MidnightBech32m.parse(recipientBech32).decode(
      UnshieldedAddress,
      "undeployed"
    );
  } catch (err) {
    console.error(`Error: failed to decode recipient address: ${err}`);
    process.exit(1);
  }

  // ─── Step 1: HD derivation from sender seed ───────────────────────────────

  const hd = HDWallet.fromSeed(senderSeed);
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
    // additionalFeeOverhead makes the fee non-zero on an idle local devnet, where
    // feesWithMargin is 0 and a zero-fee transaction is rejected as NotNormalized
    // (error 117). Any positive amount the wallet can cover in DUST works.
    costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 1_000_000n },
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

  // ─── Step 5: Start and wait for sync ─────────────────────────────────────

  await wallet.start(shieldedSecretKeys, dustSecretKey);
  const state = await wallet.waitForSyncedState();

  // ─── Step 6: Print sender info ────────────────────────────────────────────

  const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
  const senderBech32 = MidnightBech32m.encode(
    "undeployed",
    state.unshielded.address
  ).asString();
  const senderNight = state.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;

  console.log(`Sender:                 ${senderBech32}`);
  console.log(`Sender NIGHT balance:   ${senderNight}`);
  console.log(`Recipient:              ${recipientBech32}`);
  console.log(`Amount:                 ${amount}`);

  // ─── Step 7: Build transfer recipe ───────────────────────────────────────

  const outputs: CombinedTokenTransfer[] = [
    {
      type: "unshielded",
      outputs: [
        {
          type: NIGHT_TOKEN_TYPE,
          receiverAddress: recipientUnshielded,
          amount,
        },
      ],
    },
  ];

  const ttl = new Date(Date.now() + 60 * 60 * 1000); // 1-hour TTL

  let recipe;
  try {
    recipe = await wallet.transferTransaction(
      outputs,
      { shieldedSecretKeys, dustSecretKey },
      { ttl }
    );
  } catch (err) {
    console.error(`Error: transferTransaction failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 8: Sign the recipe ──────────────────────────────────────────────

  let signedRecipe;
  try {
    signedRecipe = await wallet.signRecipe(recipe, (payload) =>
      unshieldedKeystore.signData(payload)
    );
  } catch (err) {
    console.error(`Error: signRecipe failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 9: Finalize (prove) ─────────────────────────────────────────────

  let finalizedTx;
  try {
    finalizedTx = await wallet.finalizeRecipe(signedRecipe);
  } catch (err) {
    console.error(`Error: finalizeRecipe failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 10: Submit ──────────────────────────────────────────────────────

  let txId;
  try {
    txId = await wallet.submitTransaction(finalizedTx);
  } catch (err) {
    console.error(`Error: submitTransaction failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  console.log(`Submitted transaction:  ${txId}`);

  await wallet.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
