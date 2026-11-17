// Smoke test for the wallet SDK construction pattern.
// Steps: seed derivation → keystore → facade init → start → wait for sync and settle → balance assertion.
// Each step has a tag so failures point to a precise location.

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "buffer";
import { firstValueFrom as rxFirstValueFrom, filter as rxFilter } from "rxjs";
import { WalletSeeds, type WalletSeeds as Seeds } from "@midnightntwrk/wallet-sdk-hd";
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

// Synced, and all three sub-wallets on the same protocol version. A wallet that
// synced across the ledger 9 fork reports protocol "Crossing" until the last
// sub-wallet catches up, and a transaction built then can fail with
// ProtocolVersionMismatchError, so wait for "Settled" before building one.
function waitForSettled(wallet: WalletFacade): Promise<FacadeState> {
  return rxFirstValueFrom(
    wallet.state().pipe(rxFilter((s) => s.isSynced && s.protocol._tag === "Settled"))
  );
}

const GENESIS_SEED_HEX =
  "0000000000000000000000000000000000000000000000000000000000000001";

type Step =
  | "seed-derive"
  | "keystore"
  | "facade-init"
  | "wallet-start"
  | "wait-sync"
  | "balance-read";

function fail(step: Step, err: unknown): never {
  console.error(JSON.stringify({ ok: false, step, error: String(err) }));
  process.exit(1);
}

async function main() {
  let seeds: Seeds;
  try {
    // Same HD path as wallet SDK 1.x (account 0, roles Zswap / NightExternal /
    // Dust, index 0), so the genesis seed gives the same pre-funded wallet.
    seeds = WalletSeeds.fromMasterSeed(Buffer.from(GENESIS_SEED_HEX, "hex"));
  } catch (e) {
    fail("seed-derive", e);
  }

  let unshieldedKeystore: ReturnType<typeof createKeystore>;
  try {
    unshieldedKeystore = createKeystore(
      { kind: "schnorr", secret: seeds!.unshielded },
      "undeployed"
    );
  } catch (e) {
    fail("keystore", e);
  }

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

  let wallet: WalletFacade;
  try {
    wallet = await WalletFacade.init({
      configuration,
      shielded: (cfg) =>
        ShieldedWallet(cfg).startWithSeed(seeds!.shielded),
      unshielded: (cfg) =>
        UnshieldedWallet(cfg).startWithPublicKey(
          PublicKey.fromKeyStore(unshieldedKeystore!)
        ),
      dust: (cfg) =>
        DustWallet(cfg).startWithSeed(seeds!.dust),
    });
  } catch (e) {
    fail("facade-init", e);
  }

  try {
    await wallet!.start(seeds!);
  } catch (e) {
    fail("wallet-start", e);
  }

  let state: FacadeState;
  try {
    state = await waitForSettled(wallet!);
  } catch (e) {
    fail("wait-sync", e);
  }

  try {
    const NIGHT_TOKEN_TYPE = ledger.unshieldedToken().raw;
    const night = state!.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
    if (night <= 0n) {
      throw new Error(`Expected NIGHT > 0, got ${night}`);
    }
    console.log(JSON.stringify({ ok: true, night: night.toString() }));
  } catch (e) {
    fail("balance-read", e);
  }

  await wallet!.stop();
  process.exit(0);
}

main().catch((e) => fail("balance-read", e));
