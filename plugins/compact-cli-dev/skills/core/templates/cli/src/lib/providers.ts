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
import { DEVNET_CONFIG } from "./config.js";
import { LOCAL_PRIVATE_STATE_PASSWORD, TX_TTL_SECONDS, ZK_CONFIG_PATH } from "./constants.js";
import type { AppContract } from "./contract.js";
import { waitForSettled } from "./wallet.js";

// The full provider set deployContract / findDeployedContract require for this
// contract. ContractProviders ties the zkConfigProvider's circuit-id set to the
// contract's circuits, so the providers are accepted without casting.
export type Providers = ContractProviders<AppContract>;

// The wallet's answer goes back to Midnight.js as the transaction's bytes.
function toBytes(handle: WalletTransaction): Uint8Array {
	return Buffer.from(WalletTransaction.toWire(handle).transaction, "hex");
}

// Midnight.js hands the providers its own transaction handles, and the wallet
// takes its own, so a transaction crosses between them as bytes.
// facade.adoptTransaction reads the bytes and stamps them with the protocol
// version the wallet is acting at.
//
// The devnet runs ledger 9, so these providers serve ledger 9 only. A ledger 8
// transaction is refused with ProviderEraUnsupportedError.
export async function createWalletProviders(
	facade: WalletFacade,
	keystore: UnshieldedKeystore,
): Promise<{ walletProvider: WalletProvider; midnightProvider: MidnightProvider }> {
	const { shielded } = await waitForSettled(facade);

	const walletProvider = createLedger9WalletProvider({
		getCoinPublicKey: () => shielded.coinPublicKey.toHexString(),
		getEncryptionPublicKey: () => shielded.encryptionPublicKey.toHexString(),
		async balanceTx(tx, ttl) {
			const recipe = await facade.balanceUnboundTransaction(
				facade.adoptTransaction(tx.serialize(), "Unbound"),
				{ ttl: ttl ?? new Date(Date.now() + TX_TTL_SECONDS * 1000) },
			);
			const signed = await facade.signRecipe(recipe, keystore.signDataAsync);
			return toBytes(await facade.finalizeRecipe(signed));
		},
	});
	const midnightProvider = createLedger9MidnightProvider((tx) =>
		facade.submitTransaction(facade.adoptTransaction(tx.serialize(), "Finalized")),
	);

	return { walletProvider, midnightProvider };
}

export async function createProviders(
	facade: WalletFacade,
	keystore: UnshieldedKeystore,
	privateStateStoreName: string,
): Promise<Providers> {
	const { walletProvider, midnightProvider } = await createWalletProviders(facade, keystore);

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
		midnightProvider,
		// Midnight.js 5 takes the network ID and the transaction lifetime here,
		// for every transaction built with this provider set.
		config: { networkId: DEVNET_CONFIG.networkId, ttlSeconds: TX_TTL_SECONDS },
	};
}
