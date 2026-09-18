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
} from "@midnightntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
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
import * as ledger from "@midnight-ntwrk/ledger-v8";
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";
import { firstValueFrom } from "rxjs";
import { filter, timeout } from "rxjs/operators";

// ─── Constants ────────────────────────────────────────────────────────────────

// The local-devnet genesis seed. The dev preset's chain spec pre-mints NIGHT
// to the wallet derived from this seed. See midnight-tooling:devnet#genesis-seed.
const GENESIS_SEED_HEX =
  "0000000000000000000000000000000000000000000000000000000000000001";

const DEFAULT_FUND_AMOUNT = 5_000_000n; // 5 NIGHT (6 decimal places)
const BALANCE_WAIT_MS = 60_000; // 60 seconds
const FAUCET_WAIT_MS = 5 * 60 * 1000; // 5 minutes

type Network = "undeployed" | "preprod" | "preview";
type PublicNetwork = "preprod" | "preview";

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
    relayURL: new URL("wss://rpc.preprod.midnight.network"),
    indexerHttpUrl:
      "https://indexer.preprod.midnight.network/api/v3/graphql",
    indexerWsUrl:
      "wss://indexer.preprod.midnight.network/api/v3/graphql/ws",
    faucetUrl: "https://faucet.preprod.midnight.network/",
  },
  preview: {
    relayURL: new URL("wss://rpc.preview.midnight.network"),
    indexerHttpUrl:
      "https://indexer.preview.midnight.network/api/v3/graphql",
    indexerWsUrl:
      "wss://indexer.preview.midnight.network/api/v3/graphql/ws",
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
  const hd = HDWallet.fromSeed(seed);
  if (hd.type !== "seedOk") {
    throw new Error(`HDWallet.fromSeed failed: ${hd.type}`);
  }
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust] as const)
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") {
    throw new Error(`deriveKeysAt failed: ${derived.type}`);
  }
  hd.hdWallet.clear();
  const derivedKeys = derived.keys as Record<number, Uint8Array>;

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(
    derivedKeys[Roles.Zswap]
  );
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivedKeys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(
    derivedKeys[Roles.NightExternal],
    networkId
  );

  return { shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
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
        indexerHttpUrl: "http://localhost:8088/api/v3/graphql",
        indexerWsUrl: "ws://localhost:8088/api/v3/graphql/ws",
      },
      txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
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
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
  };
}

// ─── Helper: init and start a WalletFacade ────────────────────────────────────

async function initWallet(
  configuration: DefaultConfiguration,
  shieldedSecretKeys: ledger.ZswapSecretKeys,
  dustSecretKey: ledger.DustSecretKey,
  unshieldedKeystore: ReturnType<typeof createKeystore>
): Promise<WalletFacade> {
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
  await wallet.start(shieldedSecretKeys, dustSecretKey);
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

  const registrationRecipe =
    await wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload)
    );

  const finalizedTx = await wallet.finalizeRecipe(registrationRecipe);
  const txId = await wallet.submitTransaction(finalizedTx);
  return txId;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const network = parseArgs();
  const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;

  // ─── Step 1: Generate a random seed ──────────────────────────────────────

  const seed = generateRandomSeed();
  const seedHex = Buffer.from(seed).toString("hex");
  console.log(`Seed:                   ${seedHex}`);
  console.log(
    "(Save this seed — you can re-derive the wallet with it at any time.)"
  );

  // ─── Step 2: Build new wallet keys and facade ─────────────────────────────

  const {
    shieldedSecretKeys,
    dustSecretKey,
    unshieldedKeystore,
  } = buildKeysFromSeed(seed, network);

  // No fee overhead: this wallet only registers DUST below (Step 7), which is
  // self-funding (paid by the DUST the registered NIGHT UTXOs generate), so it
  // needs no overhead even at a 0 DUST balance.
  const configuration = buildConfiguration(network);

  const wallet = await initWallet(
    configuration,
    shieldedSecretKeys,
    dustSecretKey,
    unshieldedKeystore
  );

  // ─── Step 3: Wait for initial sync ───────────────────────────────────────

  console.log(`Waiting for initial sync (network: ${network})...`);
  const syncedState = await wallet.waitForSyncedState();

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
    const {
      shieldedSecretKeys: genShielded,
      dustSecretKey: genDust,
      unshieldedKeystore: genKeystore,
    } = buildKeysFromSeed(genesisSeed, "undeployed");

    // The genesis sender spends (transfers NIGHT) and already holds DUST, so it
    // gets a fee overhead to keep the fee non-zero on the idle devnet (error 117).
    const senderConfiguration = buildConfiguration("undeployed", 1_000_000n);
    const sender = await initWallet(
      senderConfiguration,
      genShielded,
      genDust,
      genKeystore
    );

    console.log("Waiting for genesis wallet sync...");
    await sender.waitForSyncedState();

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
        { shieldedSecretKeys: genShielded, dustSecretKey: genDust },
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
      signedRecipe = await sender.signRecipe(recipe, (payload) =>
        genKeystore.signData(payload)
      );
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
      const freshState = await wallet.waitForSyncedState();
      nightBalance = freshState.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
    }
    console.log(`NIGHT balance:          ${nightBalance}`);

    // Step 7: Register DUST
    console.log("Registering NIGHT UTXOs for DUST generation...");
    // Re-sync to pick up the funded UTXOs
    const freshState = await wallet.waitForSyncedState();
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
  const freshState = await wallet.waitForSyncedState();
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
