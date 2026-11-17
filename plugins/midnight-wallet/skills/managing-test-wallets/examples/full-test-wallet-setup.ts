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
} from "@midnightntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  type FacadeState,
  WalletEntrySchema,
  mergeWalletEntries,
  type DefaultConfiguration,
  type CombinedTokenTransfer,
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
import * as ledger from "@midnightntwrk/ledger-v9";
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";
import { firstValueFrom } from "rxjs";
import { filter, timeout } from "rxjs/operators";

// Synced, and all three sub-wallets on the same protocol version. A wallet that
// synced across the ledger 9 fork reports protocol "Crossing" until the last
// sub-wallet catches up, and a transaction built then can fail with
// ProtocolVersionMismatchError, so wait for "Settled" before building one.
function waitForSettled(wallet: WalletFacade): Promise<FacadeState> {
  return rxFirstValueFrom(
    wallet.state().pipe(rxFilter((s) => s.isSynced && s.protocol._tag === "Settled"))
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

// The local-devnet genesis seed. The dev preset's chain spec pre-mints NIGHT
// to the wallet derived from this seed. See midnight-tooling:devnet#genesis-seed.
const GENESIS_SEED_HEX =
  "0000000000000000000000000000000000000000000000000000000000000001";

// 1000 NIGHT (6 decimal places). A first DUST registration waits until the
// new UTXO has generated its own fee, and a few NIGHT take over an hour to
// get there; 1000 gets there in seconds.
const DEFAULT_FUND_AMOUNT = 1_000_000_000n;
const BALANCE_WAIT_MS = 60_000; // 60 seconds
const FAUCET_WAIT_MS = 5 * 60 * 1000; // 5 minutes

type Network = "undeployed" | "preprod" | "preview";
type PublicNetwork = "preprod" | "preview";

// Blockfrost hosts the public Preprod indexer and node RPC, and every request
// needs a "Midnight Preprod" project ID (it starts with `nightpreprod`) in
// BLOCKFROST_PROJECT_ID. The getters below read it only when preprod is used.
// The token is part of each URL, so don't log these URLs.
function withBlockfrostKey(url: string): string {
  const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error("Set BLOCKFROST_PROJECT_ID to run against preprod.");
  }
  return `${url}${url.includes("?") ? "&" : "?"}project_id=${encodeURIComponent(projectId)}`;
}

const NETWORK_CONFIG: Record<
  PublicNetwork,
  {
    relayURL: URL;
    indexerHttpUrl: string;
    indexerWsUrl: string;
    faucetUrl: string;
  }
> = {
  preprod: {
    get relayURL() {
      return new URL(withBlockfrostKey("wss://rpc.midnight-preprod.blockfrost.io"));
    },
    get indexerHttpUrl() {
      return withBlockfrostKey("https://midnight-preprod.blockfrost.io/api/v0");
    },
    get indexerWsUrl() {
      return withBlockfrostKey("wss://midnight-preprod.blockfrost.io/api/v0/ws");
    },
    faucetUrl: "https://faucet.preprod.midnight.network/",
  },
  preview: {
    relayURL: new URL("wss://rpc.preview.midnight.network"),
    indexerHttpUrl:
      "https://indexer.preview.midnight.network/api/v4/graphql",
    indexerWsUrl:
      "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
    faucetUrl: "https://faucet.preview.midnight.network/",
  },
};

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(): Network {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return "undeployed";
  }

  const network = args[0];
  if (network !== "undeployed" && network !== "preprod" && network !== "preview") {
    console.error(
      `Error: network must be 'undeployed', 'preprod', or 'preview', got '${network}'.`
    );
    console.error(
      "Usage: full-test-wallet-setup.ts [network: undeployed|preprod|preview]"
    );
    process.exit(1);
  }

  return network;
}

// ─── Helper: build wallet keys from seed ─────────────────────────────────────

function buildKeysFromSeed(seed: Uint8Array, networkId: Network) {
  // WalletSeeds.fromMasterSeed walks the same HD path the 1.x HDWallet code
  // did (account 0, roles Zswap / NightExternal / Dust, index 0), so the
  // same master seed gives the same wallet and addresses.
  const seeds = WalletSeeds.fromMasterSeed(seed);
  const unshieldedKeystore = createKeystore(
    { kind: "schnorr", secret: seeds.unshielded },
    networkId
  );

  return { seeds, unshieldedKeystore };
}

// ─── Helper: build configuration ─────────────────────────────────────────────

// `feeOverhead`, when provided, is added as additionalFeeOverhead so the fee is
// non-zero on an idle local devnet (a zero fee is rejected as NotNormalized, 117).
// Pass it for a wallet that SPENDS (e.g. the genesis sender below). The wallet that
// only registers DUST does not need it: DUST registration is self-funding (the fee
// is paid by the DUST the registered NIGHT UTXOs generate), so it succeeds at a 0
// DUST balance with or without the overhead.
function buildConfiguration(network: Network, feeOverhead?: bigint): DefaultConfiguration {
  const costParameters =
    feeOverhead === undefined
      ? { feeBlocksMargin: 5 }
      : { feeBlocksMargin: 5, additionalFeeOverhead: feeOverhead };

  if (network === "undeployed") {
    return {
      networkId: "undeployed",
      costParameters,
      relayURL: new URL("ws://localhost:9944"),
      provingServerUrl: new URL("http://localhost:6300"),
      indexerClientConnection: {
        indexerHttpUrl: "http://localhost:8088/api/v4/graphql",
        indexerWsUrl: "ws://localhost:8088/api/v4/graphql/ws",
      },
      txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
    };
  }

  const netCfg = NETWORK_CONFIG[network];
  return {
    networkId: network,
    costParameters,
    relayURL: netCfg.relayURL,
    // Proof server runs locally even for public testnets.
    provingServerUrl: new URL("http://localhost:6300"),
    indexerClientConnection: {
      indexerHttpUrl: netCfg.indexerHttpUrl,
      indexerWsUrl: netCfg.indexerWsUrl,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
  };
}

// ─── Helper: init and start a WalletFacade ────────────────────────────────────

async function initWallet(
  configuration: DefaultConfiguration,
  seeds: WalletSeeds,
  unshieldedKeystore: ReturnType<typeof createKeystore>
): Promise<WalletFacade> {
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
  await wallet.start(seeds);
  return wallet;
}

// ─── Helper: register NIGHT UTXOs for DUST generation ────────────────────────

async function registerDust(
  wallet: WalletFacade,
  state: Awaited<ReturnType<typeof wallet.waitForSyncedState>>,
  unshieldedKeystore: ReturnType<typeof createKeystore>,
  NIGHT_TOKEN_TYPE: string
): Promise<string> {
  const nightUtxos: readonly UtxoWithMeta[] =
    state.unshielded.availableCoins.filter(
      (coin) =>
        coin.utxo.type === NIGHT_TOKEN_TYPE &&
        coin.meta.registeredForDustGeneration === false
    );

  console.log(`NIGHT UTXOs to register: ${nightUtxos.length}`);

  if (nightUtxos.length === 0) {
    throw new Error(
      "No NIGHT UTXOs to register. Fund the wallet first."
    );
  }

  // A first registration pays its own fee from the DUST the NIGHT would have
  // generated since it arrived. NIGHT that just arrived hasn't generated it
  // yet, and registering then throws "Insufficient generated dust to cover
  // registration fee", so wait until it has.
  const { fee } = await wallet.estimateRegistration(nightUtxos);
  await wallet.waitForGeneratedDust(nightUtxos, fee);

  const registrationRecipe =
    await wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      unshieldedKeystore.getPublicKey(),
      unshieldedKeystore.signDataAsync
    );

  const finalizedTx = await wallet.finalizeRecipe(registrationRecipe);
  const txId = await wallet.submitTransaction(finalizedTx);
  return txId;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const network = parseArgs();
  const NIGHT_TOKEN_TYPE = ledger.unshieldedToken().raw;

  // ─── Step 1: Generate a random seed ──────────────────────────────────────

  const seed = generateRandomSeed();
  const seedHex = Buffer.from(seed).toString("hex");
  console.log(`Seed:                   ${seedHex}`);
  console.log(
    "(Save this seed — you can re-derive the wallet with it at any time.)"
  );

  // ─── Step 2: Build new wallet keys and facade ─────────────────────────────

  const { seeds, unshieldedKeystore } = buildKeysFromSeed(seed, network);

  // No fee overhead: this wallet only registers DUST below (Step 7), which is
  // self-funding (paid by the DUST the registered NIGHT UTXOs generate), so it
  // needs no overhead even at a 0 DUST balance.
  const configuration = buildConfiguration(network);

  const wallet = await initWallet(configuration, seeds, unshieldedKeystore);

  // ─── Step 3: Wait for initial sync ───────────────────────────────────────

  console.log(`Waiting for initial sync (network: ${network})...`);
  const syncedState = await waitForSettled(wallet);

  const unshieldedAddr = MidnightBech32m.encode(
    network,
    syncedState.unshielded.address
  ).asString();
  const shieldedAddr = MidnightBech32m.encode(
    network,
    syncedState.shielded.address
  ).asString();
  const dustAddr = MidnightBech32m.encode(
    network,
    syncedState.dust.address
  ).asString();

  console.log(`Created wallet:         ${unshieldedAddr}`);

  // ─── Undeployed flow ──────────────────────────────────────────────────────

  if (network === "undeployed") {
    // Step 4: Build a sender facade from the genesis seed
    const genesisSeed = Buffer.from(GENESIS_SEED_HEX, "hex");
    const { seeds: genSeeds, unshieldedKeystore: genKeystore } = buildKeysFromSeed(
      genesisSeed,
      "undeployed"
    );

    // The genesis sender spends (transfers NIGHT) and already holds DUST, so it
    // gets a fee overhead to keep the fee non-zero on the idle devnet (error 117).
    const senderConfiguration = buildConfiguration("undeployed", 1_000_000n);
    const sender = await initWallet(senderConfiguration, genSeeds, genKeystore);

    console.log("Waiting for genesis wallet sync...");
    await waitForSettled(sender);

    // Step 5: Transfer NIGHT from genesis to new wallet
    let recipientUnshielded: UnshieldedAddress;
    try {
      recipientUnshielded = MidnightBech32m.parse(unshieldedAddr).decode(
        UnshieldedAddress,
        "undeployed"
      );
    } catch (err) {
      console.error(`Error: failed to decode recipient address: ${err}`);
      await sender.stop();
      await wallet.stop();
      process.exit(1);
    }

    const outputs: CombinedTokenTransfer[] = [
      {
        type: "unshielded",
        outputs: [
          {
            type: NIGHT_TOKEN_TYPE,
            receiverAddress: recipientUnshielded,
            amount: DEFAULT_FUND_AMOUNT,
          },
        ],
      },
    ];

    const ttl = new Date(Date.now() + 60 * 60 * 1000); // 1-hour TTL

    console.log(
      `Transferring ${DEFAULT_FUND_AMOUNT} NIGHT to new wallet...`
    );

    let recipe;
    try {
      recipe = await sender.transferTransaction(
        outputs,
        { ttl }
      );
    } catch (err) {
      console.error(`Error: transferTransaction failed: ${err}`);
      await sender.stop();
      await wallet.stop();
      process.exit(1);
    }

    let signedRecipe;
    try {
      signedRecipe = await sender.signRecipe(recipe, genKeystore.signDataAsync);
    } catch (err) {
      console.error(`Error: signRecipe failed: ${err}`);
      await sender.stop();
      await wallet.stop();
      process.exit(1);
    }

    let finalizedTx;
    try {
      finalizedTx = await sender.finalizeRecipe(signedRecipe);
    } catch (err) {
      console.error(`Error: finalizeRecipe failed: ${err}`);
      await sender.stop();
      await wallet.stop();
      process.exit(1);
    }

    let fundTxId;
    try {
      fundTxId = await sender.submitTransaction(finalizedTx);
    } catch (err) {
      console.error(`Error: submitTransaction failed: ${err}`);
      await sender.stop();
      await wallet.stop();
      process.exit(1);
    }

    console.log(`Fund transaction ID:    ${fundTxId}`);
    await sender.stop();

    // Step 6: Wait until new wallet receives NIGHT (60s timeout)
    console.log("Waiting for NIGHT to arrive...");
    let nightBalance = 0n;
    try {
      const fundedState = await firstValueFrom(
        wallet.state().pipe(
          filter(
            (s) =>
              (s.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n) >=
              DEFAULT_FUND_AMOUNT
          ),
          timeout(BALANCE_WAIT_MS)
        )
      );
      nightBalance =
        fundedState.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
    } catch {
      console.log(
        "Note: NIGHT balance not yet visible after 60s — proceeding anyway."
      );
      // Re-read from a fresh synced state
      const freshState = await waitForSettled(wallet);
      nightBalance = freshState.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
    }
    console.log(`NIGHT balance:          ${nightBalance}`);

    // Step 7: Register DUST
    console.log("Registering NIGHT UTXOs for DUST generation...");
    // Re-sync to pick up the funded UTXOs
    const freshState = await waitForSettled(wallet);
    let dustTxId: string;
    try {
      dustTxId = await registerDust(
        wallet,
        freshState,
        unshieldedKeystore,
        NIGHT_TOKEN_TYPE
      );
    } catch (err) {
      console.error(`Error: DUST registration failed: ${err}`);
      await wallet.stop();
      process.exit(1);
    }
    console.log(`DUST registration tx:   ${dustTxId}`);

    // Step 8: Wait for DUST balance > 0 (60s timeout)
    console.log("Waiting for DUST balance...");
    let dustBalance = 0n;
    try {
      const dustState = await firstValueFrom(
        wallet.state().pipe(
          filter((s) => s.dust.balance(new Date()) > 0n),
          timeout(BALANCE_WAIT_MS)
        )
      );
      dustBalance = dustState.dust.balance(new Date());
    } catch {
      console.log(
        "Note: DUST balance still 0 after 60s. It may accrue as more blocks are produced."
      );
    }
    console.log(`DUST balance:           ${dustBalance}`);

    // Step 9: Print summary
    console.log(
      "============================================================"
    );
    console.log(`Wallet ready (network: ${network})`);
    console.log(`Seed:        ${seedHex}`);
    console.log(`Unshielded:  ${unshieldedAddr}`);
    console.log(`Shielded:    ${shieldedAddr}`);
    console.log(`Dust:        ${dustAddr}`);
    console.log(`NIGHT:       ${nightBalance}`);
    console.log(`DUST:        ${dustBalance}`);
    console.log(
      "============================================================"
    );

    await wallet.stop();
    process.exit(0);
  }

  // ─── Public testnet flow (preprod / preview) ──────────────────────────────

  const faucetUrl = NETWORK_CONFIG[network as PublicNetwork].faucetUrl;

  console.log(
    `Paste this address into the ${network} faucet: ${faucetUrl}`
  );
  console.log(`Address:                ${unshieldedAddr}`);
  console.log(`Watching for NIGHT (timeout: 5 minutes)...`);

  // SIGINT handler for graceful exit while waiting
  process.on("SIGINT", async () => {
    await wallet.stop();
    process.exit(0);
  });

  let nightBalance = 0n;
  try {
    const fundedState = await firstValueFrom(
      wallet.state().pipe(
        filter(
          (s) => (s.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n) > 0n
        ),
        timeout(FAUCET_WAIT_MS)
      )
    );
    nightBalance = fundedState.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
    console.log(`NIGHT balance:          ${nightBalance}`);
  } catch {
    console.log(
      "Timeout — no funds arrived. Verify you pasted the correct address."
    );
    await wallet.stop();
    process.exit(1);
  }

  // Register DUST
  console.log("Registering NIGHT UTXOs for DUST generation...");
  const freshState = await waitForSettled(wallet);
  let dustTxId: string;
  try {
    dustTxId = await registerDust(
      wallet,
      freshState,
      unshieldedKeystore,
      NIGHT_TOKEN_TYPE
    );
  } catch (err) {
    console.error(`Error: DUST registration failed: ${err}`);
    await wallet.stop();
    process.exit(1);
  }
  console.log(`DUST registration tx:   ${dustTxId}`);

  // Wait for DUST balance > 0 (60s timeout)
  console.log("Waiting for DUST balance...");
  let dustBalance = 0n;
  try {
    const dustState = await firstValueFrom(
      wallet.state().pipe(
        filter((s) => s.dust.balance(new Date()) > 0n),
        timeout(BALANCE_WAIT_MS)
      )
    );
    dustBalance = dustState.dust.balance(new Date());
  } catch {
    console.log(
      "Note: DUST balance still 0 after 60s. It may accrue as more blocks are produced."
    );
  }
  console.log(`DUST balance:           ${dustBalance}`);

  // Print summary
  const shieldedAddrFinal = MidnightBech32m.encode(
    network,
    freshState.shielded.address
  ).asString();
  const dustAddrFinal = MidnightBech32m.encode(
    network,
    freshState.dust.address
  ).asString();

  console.log(
    "============================================================"
  );
  console.log(`Wallet ready (network: ${network})`);
  console.log(`Seed:        ${seedHex}`);
  console.log(`Unshielded:  ${unshieldedAddr}`);
  console.log(`Shielded:    ${shieldedAddrFinal}`);
  console.log(`Dust:        ${dustAddrFinal}`);
  console.log(`NIGHT:       ${nightBalance}`);
  console.log(`DUST:        ${dustBalance}`);
  console.log(
    "============================================================"
  );

  await wallet.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
