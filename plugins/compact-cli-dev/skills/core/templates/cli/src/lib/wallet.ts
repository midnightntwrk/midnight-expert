import fs from "node:fs";
import path from "node:path";
import {
	DustWallet,
	type FacadeState,
	InMemoryTransactionHistoryStorage,
	PublicKey,
	ShieldedWallet,
	type UnshieldedKeystore,
	UnshieldedWallet,
	WalletEntrySchema,
	WalletFacade,
	WalletSeeds,
	createKeystore,
	generateRandomSeed,
	mergeWalletEntries,
} from "@midnightntwrk/wallet-sdk";
import * as Rx from "rxjs";
import { WebSocket } from "ws";
import { DEVNET_CONFIG } from "./config.js";
import {
	ADDITIONAL_FEE_OVERHEAD,
	DIR_MODE,
	FEE_BLOCKS_MARGIN,
	FILE_MODE_PRIVATE,
	SEED_LENGTH,
	STATE_DIR,
	WALLETS_FILE,
	WALLET_SYNC_TIMEOUT,
} from "./constants.js";

// Required for GraphQL subscriptions in Node.js
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

// --- Types ---

export interface StoredWallet {
	seed: string;
	address: string;
	createdAt: string;
}

export interface WalletStore {
	[name: string]: StoredWallet;
}

export interface WalletContext {
	facade: WalletFacade;
	keystore: UnshieldedKeystore;
}

// --- Seed & Key Derivation ---

export function newSeed(): string {
	return Buffer.from(generateRandomSeed()).toString("hex");
}

// WalletSeeds.fromMasterSeed derives the shielded, unshielded and dust seeds on
// the same HD path wallet SDK 1.x used (account 0, index 0), so a seed saved by
// an older version of this CLI gives the same wallet and addresses.
export function deriveSeeds(seed: string): WalletSeeds {
	if (seed.length !== SEED_LENGTH) {
		throw new Error(
			`Invalid seed length: expected ${String(SEED_LENGTH)} hex chars, got ${String(seed.length)}`,
		);
	}
	// Buffer.from(_, "hex") stops at the first non-hex character, so check first.
	if (!/^[0-9a-fA-F]+$/.test(seed)) {
		throw new Error("Invalid seed: expected hex characters only (0-9, a-f)");
	}
	return WalletSeeds.fromMasterSeed(Buffer.from(seed, "hex"));
}

export function createWalletKeystore(seeds: WalletSeeds): UnshieldedKeystore {
	return createKeystore({ kind: "schnorr", secret: seeds.unshielded }, DEVNET_CONFIG.networkId);
}

// --- WalletFacade Building ---

export async function buildFacade(seed: string): Promise<WalletContext> {
	const seeds = deriveSeeds(seed);
	const keystore = createWalletKeystore(seeds);

	const facade = await WalletFacade.init({
		configuration: {
			networkId: DEVNET_CONFIG.networkId,
			indexerClientConnection: {
				indexerHttpUrl: DEVNET_CONFIG.indexer,
				indexerWsUrl: DEVNET_CONFIG.indexerWS,
			},
			relayURL: new URL(DEVNET_CONFIG.nodeWS),
			provingServerUrl: new URL(DEVNET_CONFIG.proofServer),
			costParameters: {
				additionalFeeOverhead: ADDITIONAL_FEE_OVERHEAD,
				feeBlocksMargin: FEE_BLOCKS_MARGIN,
			},
			txHistoryStorage: new InMemoryTransactionHistoryStorage(
				WalletEntrySchema,
				mergeWalletEntries,
			),
		},
		shielded: (cfg) => ShieldedWallet(cfg).startWithSeed(seeds.shielded),
		unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
		dust: (cfg) => DustWallet(cfg).startWithSeed(seeds.dust),
	});
	// start() takes the seeds rather than key objects: seeds are the only key
	// material that works on both sides of the ledger 8 / ledger 9 boundary.
	// Callers stop the facade in a finally block once this returns; if start()
	// throws, stop it here so its open connections don't keep the process alive.
	try {
		await facade.start(seeds);
	} catch (error) {
		await facade.stop().catch(() => undefined);
		throw error;
	}

	return { facade, keystore };
}

// Synced, and all three sub-wallets on the same protocol version. Until a
// wallet has caught up past the ledger 9 fork it reports protocol "Crossing",
// and a transaction built then can fail with ProtocolVersionMismatchError.
export function isSettled(state: FacadeState): boolean {
	return state.isSynced && state.protocol._tag === "Settled";
}

export function waitForSettled(facade: WalletFacade): Promise<FacadeState> {
	return Rx.firstValueFrom(
		facade.state().pipe(Rx.filter(isSettled), Rx.timeout(WALLET_SYNC_TIMEOUT)),
	);
}

// --- Persistence ---

function walletsPath(): string {
	return path.join(process.cwd(), STATE_DIR, WALLETS_FILE);
}

function ensureStateDir(): void {
	const dir = path.join(process.cwd(), STATE_DIR);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { mode: DIR_MODE, recursive: true });
	}
}

export function loadWallets(): WalletStore {
	const filePath = walletsPath();
	if (!fs.existsSync(filePath)) {
		return {};
	}
	const raw = fs.readFileSync(filePath, "utf-8");
	return JSON.parse(raw) as WalletStore;
}

export function saveWallets(store: WalletStore): void {
	ensureStateDir();
	const filePath = walletsPath();
	fs.writeFileSync(filePath, `${JSON.stringify(store, null, "\t")}\n`, {
		mode: FILE_MODE_PRIVATE,
	});
}

export function getWallet(name: string): StoredWallet {
	const store = loadWallets();
	const wallet = store[name];
	if (!wallet) {
		throw new Error(`Wallet "${name}" not found. Run \`wallet:create ${name}\` to create it.`);
	}
	return wallet;
}

export function saveWallet(name: string, wallet: StoredWallet): void {
	const store = loadWallets();
	store[name] = wallet;
	saveWallets(store);
}
