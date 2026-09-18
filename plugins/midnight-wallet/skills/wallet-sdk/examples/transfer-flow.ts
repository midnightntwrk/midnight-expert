/**
 * Transfer NIGHT tokens between wallets.
 * Assumes wallet is already constructed and synced (see basic-wallet-setup.ts).
 *
 * Demonstrates: transferTransaction, signRecipe (synchronous callback),
 * finalizeRecipe, and submitTransaction for both unshielded and shielded transfers.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { HDWallet, Roles, generateRandomSeed } from "@midnightntwrk/wallet-sdk-hd";
import { WalletFacade, WalletEntrySchema } from "@midnightntwrk/wallet-sdk-facade";
import type { DefaultConfiguration } from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { Buffer } from "buffer";
import * as rx from "rxjs";

// ---------------------------------------------------------------------------
// Helper: initialize a wallet from a seed (same pattern as basic-wallet-setup)
// ---------------------------------------------------------------------------
const INDEXER_PORT = Number.parseInt(process.env["INDEXER_PORT"] ?? "8088", 10);
const NODE_PORT = Number.parseInt(process.env["NODE_PORT"] ?? "9944", 10);
const PROOF_SERVER_PORT = Number.parseInt(process.env["PROOF_SERVER_PORT"] ?? "6300", 10);

const configuration: DefaultConfiguration = {
  networkId: "undeployed",
  // additionalFeeOverhead makes the fee non-zero on an idle local devnet, where
  // feesWithMargin is 0 and a zero-fee transaction is rejected as NotNormalized
  // (error 117). Any positive amount the wallet can cover in DUST works.
  costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 1_000_000n },
  relayURL: new URL(`ws://localhost:${NODE_PORT}`),
  provingServerUrl: new URL(`http://localhost:${PROOF_SERVER_PORT}`),
  indexerClientConnection: {
    indexerHttpUrl: `http://localhost:${INDEXER_PORT}/api/v4/graphql`,
    indexerWsUrl: `ws://localhost:${INDEXER_PORT}/api/v4/graphql/ws`,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
};

async function initWallet(seed: Buffer) {
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== "seedOk") throw new Error("Failed to initialize HDWallet");

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derivationResult.type !== "keysDerived") throw new Error("Failed to derive keys");
  hdWallet.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], configuration.networkId);

  const wallet = await WalletFacade.init({
    configuration,
    shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (config) =>
      UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (config) =>
      DustWallet(config).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

// ---------------------------------------------------------------------------
// Set up sender (pre-funded) and receiver wallets
// ---------------------------------------------------------------------------
const sender = await initWallet(
  Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex"),
);
const receiver = await initWallet(Buffer.from(generateRandomSeed()));

await sender.wallet.waitForSyncedState();

// ---------------------------------------------------------------------------
// Unshielded transfer: NIGHT tokens (requires signRecipe)
// ---------------------------------------------------------------------------
// NOTE: signRecipe takes a *synchronous* callback — the keystore.signData
// call must return the signature directly, not a Promise.

await sender.wallet
  .transferTransaction(
    [
      {
        type: "unshielded",
        outputs: [
          {
            amount: 1_000_000n,
            receiverAddress: await receiver.wallet.unshielded.getAddress(),
            type: ledger.unshieldedToken().raw,
          },
        ],
      },
    ],
    {
      shieldedSecretKeys: sender.shieldedSecretKeys,
      dustSecretKey: sender.dustSecretKey,
    },
    {
      ttl: new Date(Date.now() + 30 * 60 * 1000),
    },
  )
  // signRecipe is required for unshielded transfers (NIGHT moves on-chain)
  .then((recipe) =>
    sender.wallet.signRecipe(recipe, (payload) => sender.unshieldedKeystore.signData(payload)),
  )
  .then((recipe) => sender.wallet.finalizeRecipe(recipe))
  .then((finalizedTransaction) => sender.wallet.submitTransaction(finalizedTransaction));

// Wait for the receiver to see the balance
const receiverState = await rx.firstValueFrom(
  receiver.wallet.state().pipe(
    rx.filter((s) => s.isSynced),
    rx.filter((s) => {
      const nightBalance = s.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
      return nightBalance > 0n;
    }),
  ),
);

console.log(
  "Unshielded transfer completed; receiver NIGHT balance:",
  receiverState.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n,
);

// ---------------------------------------------------------------------------
// Shielded transfer: private tokens (no signRecipe needed)
// ---------------------------------------------------------------------------
await sender.wallet
  .transferTransaction(
    [
      {
        type: "shielded",
        outputs: [
          {
            amount: 500_000n,
            receiverAddress: await receiver.wallet.shielded.getAddress(),
            type: ledger.shieldedToken().raw,
          },
        ],
      },
    ],
    {
      shieldedSecretKeys: sender.shieldedSecretKeys,
      dustSecretKey: sender.dustSecretKey,
    },
    {
      ttl: new Date(Date.now() + 30 * 60 * 1000),
    },
  )
  // Shielded transfers skip signRecipe — go straight to finalize
  .then((recipe) => sender.wallet.finalizeRecipe(recipe))
  .then((finalizedTransaction) => sender.wallet.submitTransaction(finalizedTransaction));

const shieldedState = await rx.firstValueFrom(
  receiver.wallet.state().pipe(
    rx.filter((s) => s.isSynced),
    rx.filter((s) => s.shielded.availableCoins.length > 0),
  ),
);

console.log(
  "Shielded transfer completed; receiver shielded balance:",
  shieldedState.shielded.balances[ledger.shieldedToken().raw] ?? 0n,
);

// ---------------------------------------------------------------------------
// Clean up
// ---------------------------------------------------------------------------
await receiver.wallet.stop();
await sender.wallet.stop();
