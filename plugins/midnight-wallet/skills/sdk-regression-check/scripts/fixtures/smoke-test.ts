// Smoke test for the wallet SDK construction pattern.
// Steps: HD derivation → key conversion → facade init → start → wait for sync → balance assertion.
// Each step has a tag so failures point to a precise location.

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "buffer";
import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
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

const GENESIS_SEED_HEX =
  "0000000000000000000000000000000000000000000000000000000000000001";

type Step =
  | "hd-derive"
  | "key-convert"
  | "facade-init"
  | "wallet-start"
  | "wait-sync"
  | "balance-read";

function fail(step: Step, err: unknown): never {
  console.error(JSON.stringify({ ok: false, step, error: String(err) }));
  process.exit(1);
}

async function main() {
  let derivedKeys: Record<number, Uint8Array>;
  try {
    const seed = Buffer.from(GENESIS_SEED_HEX, "hex");
    const hd = HDWallet.fromSeed(seed);
    if (hd.type !== "seedOk") throw new Error(`HDWallet.fromSeed: ${hd.type}`);
    const derived = hd.hdWallet
      .selectAccount(0)
      .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust] as const)
      .deriveKeysAt(0);
    if (derived.type !== "keysDerived")
      throw new Error(`deriveKeysAt: ${derived.type}`);
    hd.hdWallet.clear();
    derivedKeys = derived.keys as Record<number, Uint8Array>;
  } catch (e) {
    fail("hd-derive", e);
  }

  let shieldedSecretKeys: ledger.ZswapSecretKeys;
  let dustSecretKey: ledger.DustSecretKey;
  let unshieldedKeystore: ReturnType<typeof createKeystore>;
  try {
    shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(
      derivedKeys![Roles.Zswap]
    );
    dustSecretKey = ledger.DustSecretKey.fromSeed(derivedKeys![Roles.Dust]);
    unshieldedKeystore = createKeystore(
      derivedKeys![Roles.NightExternal],
      "undeployed"
    );
  } catch (e) {
    fail("key-convert", e);
  }

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

  let wallet: WalletFacade;
  try {
    wallet = await WalletFacade.init({
      configuration,
      shielded: (cfg) =>
        ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys!),
      unshielded: (cfg) =>
        UnshieldedWallet(cfg).startWithPublicKey(
          PublicKey.fromKeyStore(unshieldedKeystore!)
        ),
      dust: (cfg) =>
        DustWallet(cfg).startWithSecretKey(
          dustSecretKey!,
          ledger.LedgerParameters.initialParameters().dust
        ),
    });
  } catch (e) {
    fail("facade-init", e);
  }

  try {
    await wallet!.start(shieldedSecretKeys!, dustSecretKey!);
  } catch (e) {
    fail("wallet-start", e);
  }

  let state: Awaited<ReturnType<WalletFacade["waitForSyncedState"]>>;
  try {
    state = await wallet!.waitForSyncedState();
  } catch (e) {
    fail("wait-sync", e);
  }

  try {
    const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
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
