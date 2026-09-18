import type { ProvableCircuitId } from "@midnight-ntwrk/compact-js";
import type * as ledger from "@midnight-ntwrk/ledger-v8";
import type { ContractProviders } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type { MidnightProvider, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import type { UnshieldedKeystore } from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import * as Rx from "rxjs";
import { DEVNET_CONFIG } from "./config.js";
import { LOCAL_PRIVATE_STATE_PASSWORD, ZK_CONFIG_PATH } from "./constants.js";
import type { AppContract } from "./contract.js";

// The full provider set deployContract / findDeployedContract require for this
// contract. ContractProviders ties the zkConfigProvider's circuit-id set to the
// contract's circuits, so the providers are accepted without casting.
export type Providers = ContractProviders<AppContract>;

export async function createWalletProvider(
	facade: WalletFacade,
	shieldedSecretKeys: ledger.ZswapSecretKeys,
	dustSecretKey: ledger.DustSecretKey,
): Promise<WalletProvider & MidnightProvider> {
	const state = await Rx.firstValueFrom(facade.state().pipe(Rx.filter((s) => s.isSynced)));

	return {
		getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
		getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
		async balanceTx(tx, ttl) {
			const recipe = await facade.balanceUnboundTransaction(
				tx,
				{ shieldedSecretKeys, dustSecretKey },
				{ ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
			);
			const finalized = await facade.finalizeRecipe(recipe);
			return finalized;
		},
		submitTx: (tx) => facade.submitTransaction(tx),
	} as WalletProvider & MidnightProvider;
}

export async function createProviders(
	facade: WalletFacade,
	shieldedSecretKeys: ledger.ZswapSecretKeys,
	dustSecretKey: ledger.DustSecretKey,
	keystore: UnshieldedKeystore,
	privateStateStoreName: string,
): Promise<Providers> {
	const walletProvider = await createWalletProvider(facade, shieldedSecretKeys, dustSecretKey);

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
	};
}
