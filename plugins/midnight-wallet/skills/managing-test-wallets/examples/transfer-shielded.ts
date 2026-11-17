// Verified against the package versions pinned in
// midnight-wallet:sdk-regression-check/versions.lock.json on 2026-11-17.
// If your installed @midnightntwrk/wallet-sdk-* versions differ,
// run scripts/drift-check.sh in that skill before trusting this template.

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "buffer";
import { firstValueFrom, filter } from "rxjs";
import { WalletSeeds } from "@midnightntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  type FacadeState,
  WalletEntrySchema,
  mergeWalletEntries,
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
import * as ledger from "@midnightntwrk/ledger-v9";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";

// Synced, and all three sub-wallets on the same protocol version. A wallet that
// synced across the ledger 9 fork reports protocol "Crossing" until the last
// sub-wallet catches up, and a transaction built then can fail with
// ProtocolVersionMismatchError, so wait for "Settled" before building one.
function waitForSettled(wallet: WalletFacade): Promise<FacadeState> {
  return firstValueFrom(
    wallet.state().pipe(filter((s) => s.isSynced && s.protocol._tag === "Settled"))
  );
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(): {
  senderSeed: Uint8Array;
  recipientBech32: string;
  amount: bigint;
} {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error(
      "Usage: transfer-shielded.ts <sender-seed-hex> <recipient-shielded-bech32> <amount-bigint>"
    );
    console.error("  sender-seed-hex            — 64 hex characters (32 bytes)");
    console.error("  recipient-shielded-bech32  — bech32m shielded address");
    console.error("  amount-bigint              — token amount in smallest units");
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

  // ─── Step 1: HD derivation from sender seed ───────────────────────────────

  // WalletSeeds.fromMasterSeed walks the same HD path the 1.x HDWallet code
  // did (account 0, roles Zswap / NightExternal / Dust, index 0), so the
  // same master seed gives the same wallet and addresses.
  const seeds = WalletSeeds.fromMasterSeed(senderSeed);
  const unshieldedKeystore = createKeystore(
    { kind: "schnorr", secret: seeds.unshielded },
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

  // ─── Step 5: Start and wait for sync ─────────────────────────────────────

  await wallet.start(seeds);
  const state = await waitForSettled(wallet);

  // ─── Step 6: Print sender info ────────────────────────────────────────────

  const senderBech32 = MidnightBech32m.encode(
    "undeployed",
    state.unshielded.address
  ).asString();

  // Represent shielded balances as a human-readable string (bigint-safe).
  const shieldedBalances = state.shielded.balances;
  const shieldedBreakdown = JSON.stringify(
    shieldedBalances,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value)
  );

  console.log(`Sender:               ${senderBech32}`);
  console.log(`Shielded balance:     ${shieldedBreakdown}`);

  // ─── Step 7: Check for shielded balance ──────────────────────────────────
  // Sum all shielded token amounts. If the total is 0 the sender cannot make a
  // shielded transfer and we exit gracefully with an explanation.

  const totalShielded = Object.values(shieldedBalances).reduce(
    (sum, v) => sum + (v as bigint),
    0n
  );

  if (totalShielded === 0n) {
    console.log(
      "Sender has no shielded tokens. To use this example you need shielded balance."
    );
    console.log(
      "See SDK reference for `wallet.initSwap` to convert unshielded to shielded."
    );
    await wallet.stop();
    process.exit(0);
  }

  // ─── Step 8: Decode recipient shielded address ────────────────────────────

  let recipientShielded: ShieldedAddress;
  try {
    recipientShielded = MidnightBech32m.parse(recipientBech32).decode(
      ShieldedAddress,
      "undeployed"
    );
  } catch (err) {
    console.error(`Error: failed to decode recipient shielded address: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  const NIGHT_TOKEN_TYPE = ledger.unshieldedToken().raw;

  console.log(`Recipient (shielded):   ${recipientBech32}`);
  console.log(`Amount:                 ${amount}`);

  // ─── Step 9: Build shielded transfer recipe ───────────────────────────────

  const outputs: CombinedTokenTransfer[] = [
    {
      type: "shielded",
      outputs: [
        {
          type: NIGHT_TOKEN_TYPE,
          receiverAddress: recipientShielded,
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
      { ttl }
    );
  } catch (err) {
    console.error(`Error: transferTransaction failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 10: Sign the recipe ─────────────────────────────────────────────

  let signedRecipe;
  try {
    signedRecipe = await wallet.signRecipe(recipe, unshieldedKeystore.signDataAsync
    );
  } catch (err) {
    console.error(`Error: signRecipe failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 11: Finalize (prove) ────────────────────────────────────────────

  let finalizedTx;
  try {
    finalizedTx = await wallet.finalizeRecipe(signedRecipe);
  } catch (err) {
    console.error(`Error: finalizeRecipe failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 12: Submit ──────────────────────────────────────────────────────

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
