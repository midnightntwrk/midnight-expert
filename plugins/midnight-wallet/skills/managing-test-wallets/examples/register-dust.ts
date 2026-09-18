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
  type UtxoWithMeta,
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
    // No additionalFeeOverhead needed: DUST registration is self-funding — the fee
    // is paid by the DUST the registered NIGHT UTXOs generate, not from the wallet's
    // existing DUST balance, so it succeeds even at a 0 DUST balance. (Verified on
    // a local devnet.) Add additionalFeeOverhead on wallets that submit transfers
    // or contract calls — see examples/transfer-night.ts.
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

  // ─── Step 5: Start and wait for sync ─────────────────────────────────────

  await wallet.start(shieldedSecretKeys, dustSecretKey);
  const state = await wallet.waitForSyncedState();

  // ─── Step 6: Print wallet info ────────────────────────────────────────────

  const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
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
  // verifying key and a synchronous sign callback. No separate signRecipe step.

  let registrationRecipe;
  try {
    registrationRecipe = await wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload)
    );
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
