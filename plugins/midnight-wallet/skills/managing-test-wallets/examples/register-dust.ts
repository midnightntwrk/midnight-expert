// Verified against the package versions pinned in
// midnight-wallet:sdk-regression-check/versions.lock.json on 2026-11-17.
// If your installed @midnightntwrk/wallet-sdk-* versions differ,
// run scripts/drift-check.sh in that skill before trusting this template.

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "buffer";
import { WalletSeeds } from "@midnightntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  type FacadeState,
  WalletEntrySchema,
  mergeWalletEntries,
  type DefaultConfiguration,
  type UtxoWithMeta,
} from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet, isInsufficientDustForFeeError } from "@midnightntwrk/wallet-sdk-dust-wallet";
import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
import * as ledger from "@midnightntwrk/ledger-v9";
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";
import { firstValueFrom } from "rxjs";
import { filter, timeout } from "rxjs/operators";

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

function parseArgs(): Uint8Array {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: register-dust.ts <wallet-seed-hex>");
    console.error("  wallet-seed-hex — 64 hex characters (32 bytes)");
    process.exit(1);
  }

  const hex = args[0].replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error(
      "Error: seed must be exactly 64 hex characters (32 bytes)."
    );
    process.exit(1);
  }

  return Buffer.from(hex, "hex");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = parseArgs();

  // ─── Step 1: Seed derivation ──────────────────────────────────────────────

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
    // No additionalFeeOverhead needed: DUST registration is self-funding — the fee
    // is paid by the DUST the registered NIGHT UTXOs generate, not from the wallet's
    // existing DUST balance, so it succeeds even at a 0 DUST balance. (Verified on
    // a local devnet.) Add additionalFeeOverhead on wallets that submit transfers
    // or contract calls — see examples/transfer-night.ts.
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

  // ─── Step 5: Start and wait for sync ─────────────────────────────────────

  await wallet.start(seeds);
  const state = await waitForSettled(wallet);

  // ─── Step 6: Print wallet info ────────────────────────────────────────────

  const NIGHT_TOKEN_TYPE = ledger.unshieldedToken().raw;
  const walletBech32 = MidnightBech32m.encode(
    "undeployed",
    state.unshielded.address
  ).asString();
  const nightBalance = state.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;

  console.log(`Wallet:                 ${walletBech32}`);
  console.log(`NIGHT balance:          ${nightBalance}`);

  // ─── Step 7: Get NIGHT UTXOs eligible for dust registration ──────────────

  // Filter to unregistered NIGHT UTXOs only — already-registered UTXOs would
  // cause the registration tx to fail.
  const nightUtxos: readonly UtxoWithMeta[] =
    state.unshielded.availableCoins.filter(
      (coin) =>
        coin.utxo.type === NIGHT_TOKEN_TYPE &&
        coin.meta.registeredForDustGeneration === false
    );

  console.log(`NIGHT UTXOs to register: ${nightUtxos.length}`);

  if (nightUtxos.length === 0) {
    console.log(
      "No NIGHT UTXOs to register. Fund the wallet first via fund-wallet-undeployed.ts."
    );
    await wallet.stop();
    process.exit(0);
  }

  // ─── Step 8: Estimate registration fee ───────────────────────────────────

  let estimateResult: Awaited<ReturnType<WalletFacade["estimateRegistration"]>>;
  try {
    estimateResult = await wallet.estimateRegistration(nightUtxos);
  } catch (err) {
    console.error(`Error: estimateRegistration failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  console.log(`Estimated fee:          ${estimateResult.fee}`);

  // ─── Step 9: Build registration recipe ───────────────────────────────────
  // registerNightUtxosForDustGeneration handles signing internally; we pass the
  // verifying key and a sign callback that returns a Promise (signDataAsync).
  // No separate signRecipe step.

  // A first registration pays its own fee from the DUST the NIGHT has
  // generated since it arrived. If that doesn't cover the fee yet, the call
  // throws InsufficientDustForFeeError with an estimate of when it will; wait
  // that long (plus a margin) and retry. An unreachable fee is a real error.
  const register = () =>
    wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      unshieldedKeystore.getPublicKey(),
      unshieldedKeystore.signDataAsync
    );

  let registrationRecipe;
  try {
    registrationRecipe = await register().catch(async (error: unknown) => {
      if (!isInsufficientDustForFeeError(error) || error.estimate._tag !== "Reachable") throw error;
      const timeoutMs = Number(error.estimate.seconds) * 1000 + 60_000;
      console.log(`Waiting ~${Math.ceil(timeoutMs / 1000)}s for the NIGHT to generate the fee...`);
      await wallet.waitForGeneratedDust(nightUtxos, error.fee, { timeoutMs });
      return register();
    });
  } catch (err) {
    console.error(`Error: registerNightUtxosForDustGeneration failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 10: Finalize (prove) ────────────────────────────────────────────

  let finalizedTx;
  try {
    finalizedTx = await wallet.finalizeRecipe(registrationRecipe);
  } catch (err) {
    console.error(`Error: finalizeRecipe failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  // ─── Step 11: Submit ──────────────────────────────────────────────────────

  let txId;
  try {
    txId = await wallet.submitTransaction(finalizedTx);
  } catch (err) {
    console.error(`Error: submitTransaction failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }

  console.log(`Submitted transaction:  ${txId}`);

  // ─── Step 12: Wait for DUST balance > 0 (60s timeout) ───────────────────

  let dustBalance = 0n;
  try {
    const finalState = await firstValueFrom(
      wallet.state().pipe(
        filter((s) => s.dust.balance(new Date()) > 0n),
        timeout(60_000)
      )
    );
    dustBalance = finalState.dust.balance(new Date());
  } catch {
    // Timeout — DUST may still accrue later. Print 0 and continue.
    console.log(
      "Note: DUST balance still 0 after 60s. It may accrue as more blocks are produced."
    );
  }

  console.log(`DUST balance:           ${dustBalance}`);

  await wallet.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
