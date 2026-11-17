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
  UnshieldedAddress,
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

// ─── Constants ───────────────────────────────────────────────────────────────

// The local-devnet genesis seed. The dev preset's chain spec pre-mints NIGHT
// to the wallet derived from this seed. See midnight-tooling:devnet#genesis-seed.
const GENESIS_SEED_HEX =
  "0000000000000000000000000000000000000000000000000000000000000001";

// 1000 NIGHT (6 decimal places). A first DUST registration waits until the
// new UTXO has generated its own fee, and a few NIGHT take over an hour to
// get there; 1000 gets there in seconds.
const DEFAULT_AMOUNT = 1_000_000_000n;

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(): { recipientBech32: string; amount: bigint } {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      "Usage: fund-wallet-undeployed.ts <recipient-unshielded-bech32-address> [amount-bigint]"
    );
    console.error("  recipient  — bech32m unshielded address (mn_addr_undeployed…)");
    console.error("  amount     — NIGHT amount in smallest units (default: 1000000000)");
    process.exit(1);
  }

  const recipientBech32 = args[0];

  let amount = DEFAULT_AMOUNT;
  if (args[1] !== undefined) {
    try {
      amount = BigInt(args[1]);
    } catch {
      console.error(`Error: invalid amount '${args[1]}' — must be a valid bigint.`);
      process.exit(1);
    }
  }

  return { recipientBech32, amount };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { recipientBech32, amount } = parseArgs();

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

  // ─── Step 1: HD derivation from genesis seed ──────────────────────────────

  const seed = Buffer.from(GENESIS_SEED_HEX, "hex");
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
    // This wallet is the genesis sender that transfers NIGHT to the new wallet.
    // additionalFeeOverhead makes its fee non-zero on an idle local devnet, where
    // feesWithMargin is 0 and a zero-fee transaction is rejected as NotNormalized
    // (error 117). The genesis wallet already holds DUST, so it can cover the fee.
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

  const NIGHT_TOKEN_TYPE = ledger.unshieldedToken().raw;
  const senderBech32 = MidnightBech32m.encode(
    "undeployed",
    state.unshielded.address
  ).asString();
  const senderNight = state.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;

  console.log(`Sender (genesis):       ${senderBech32}`);
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
      { ttl }
    );
  } catch (err) {
    console.error(`Error: transferTransaction failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 8: Sign the recipe ──────────────────────────────────────────────
  // For unshielded NIGHT transfers the recipe needs a signature from the
  // sender's unshielded signing key. The keystore exposes signData() which
  // wraps ledger.signData with the derived secret key.

  let signedRecipe;
  try {
    signedRecipe = await wallet.signRecipe(recipe, unshieldedKeystore.signDataAsync
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
