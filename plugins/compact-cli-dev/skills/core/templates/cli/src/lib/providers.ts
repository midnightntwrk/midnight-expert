import type { ProvableCircuitId } from "@midnight-ntwrk/compact-js";
import type { ContractProviders } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
	type MidnightProvider,
	type WalletProvider,
	createLedger9MidnightProvider,
	createLedger9WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import {
	type UnshieldedKeystore,
	type WalletFacade,
	WalletTransaction,
} from "@midnightntwrk/wallet-sdk";
import * as WalletLedger from "@midnightntwrk/wallet-sdk/ledger/v9";
import { DEVNET_CONFIG } from "./config.js";
import { LOCAL_PRIVATE_STATE_PASSWORD, TX_TTL_SECONDS, ZK_CONFIG_PATH } from "./constants.js";
import type { AppContract } from "./contract.js";
import { waitForSettled } from "./wallet.js";

// The full provider set deployContract / findDeployedContract require for this
// contract. ContractProviders ties the zkConfigProvider's circuit-id set to the
// contract's circuits, so the providers are accepted without casting.
export type Providers = ContractProviders<AppContract>;

// Midnight.js and the wallet SDK each load their own copy of the ledger, so a
// transaction crosses between them as bytes. The wallet decodes them with its
// copy and seals them, stamped with the protocol version the chain is on.
async function adopt<S extends "Unbound" | "Finalized">(
	facade: WalletFacade,
	stage: S,
	bytes: Uint8Array,
): Promise<WalletTransaction<S>> {
	const binding = stage === "Unbound" ? "pre-binding" : "binding";
	const tx = WalletLedger.Transaction.deserialize("signature", "proof", binding, bytes);
	const state = await waitForSettled(facade);
	return WalletTransaction.adopt(stage, tx, state.activeProtocolVersion);
}

// The wallet's answer goes back to Midnight.js as bytes, too.
function toBytes(handle: WalletTransaction): Uint8Array {
	return Buffer.from(WalletTransaction.toWire(handle).transaction, "hex");
}

// The devnet runs ledger 9, so this provider set serves ledger 9 only. A ledger
// 8 transaction is refused with ProviderEraUnsupportedError.
export async function createWalletProvider(
	facade: WalletFacade,
	keystore: UnshieldedKeystore,
): Promise<WalletProvider & MidnightProvider> {
	const { shielded } = await waitForSettled(facade);

	const walletProvider = createLedger9WalletProvider({
		getCoinPublicKey: () => shielded.coinPublicKey.toHexString(),
		getEncryptionPublicKey: () => shielded.encryptionPublicKey.toHexString(),
		async balanceTx(tx, ttl) {
			const recipe = await facade.balanceUnboundTransaction(
				await adopt(facade, "Unbound", tx.serialize()),
				{ ttl: ttl ?? new Date(Date.now() + TX_TTL_SECONDS * 1000) },
			);
			const signed = await facade.signRecipe(recipe, keystore.signDataAsync);
			return toBytes(await facade.finalizeRecipe(signed));
		},
	});
	const midnightProvider = createLedger9MidnightProvider(async (tx) =>
		facade.submitTransaction(await adopt(facade, "Finalized", tx.serialize())),
	);

	return {
		supportedEras: walletProvider.supportedEras,
		balanceTx: (tx, ttl) => walletProvider.balanceTx(tx, ttl),
		getCoinPublicKey: () => walletProvider.getCoinPublicKey(),
		getEncryptionPublicKey: () => walletProvider.getEncryptionPublicKey(),
		submitTx: (tx) => midnightProvider.submitTx(tx),
	};
}

export async function createProviders(
	facade: WalletFacade,
	keystore: UnshieldedKeystore,
	privateStateStoreName: string,
): Promise<Providers> {
	const walletProvider = await createWalletProvider(facade, keystore);

	const zkConfigProvider = new NodeZkConfigProvider<ProvableCircuitId<AppContract>>(ZK_CONFIG_PATH);

	return {
		privateStateProvider: levelPrivateStateProvider({
			privateStateStoreName,
			// Private state is encrypted at rest with this password and scoped to
			// the wallet address. This is a LOCAL DEVNET CLI (plaintext seeds), so a
			// fixed dev password is acceptable; use a real secret for any other network.
			privateStoragePasswordProvider: () => LOCAL_PRIVATE_STATE_PASSWORD,
			accountId: keystore.getBech32Address().toString(),
		}),
		publicDataProvider: indexerPublicDataProvider(DEVNET_CONFIG.indexer, DEVNET_CONFIG.indexerWS),
		zkConfigProvider,
		proofProvider: httpClientProofProvider(DEVNET_CONFIG.proofServer, zkConfigProvider),
		walletProvider,
		midnightProvider: walletProvider,
		// Midnight.js 5 takes the network ID and the transaction lifetime here,
		// for every transaction built with this provider set.
		config: { networkId: DEVNET_CONFIG.networkId, ttlSeconds: TX_TTL_SECONDS },
	};
}
