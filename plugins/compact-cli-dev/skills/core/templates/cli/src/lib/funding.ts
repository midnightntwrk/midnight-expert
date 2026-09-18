import { unshieldedToken } from "@midnight-ntwrk/ledger-v8";
import { getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk-address-format";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import type { UnshieldedKeystore } from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import * as Rx from "rxjs";
import {
	DUST_GENERATION_TIMEOUT,
	DUST_POLL_INTERVAL,
	FUND_POLL_INTERVAL,
	GENESIS_SEED,
} from "./constants.js";
import { withSpinner } from "./progress.js";
import { buildFacade } from "./wallet.js";

export async function waitForFunds(facade: WalletFacade): Promise<bigint> {
	return Rx.firstValueFrom(
		facade.state().pipe(
			Rx.throttleTime(FUND_POLL_INTERVAL),
			Rx.filter((state) => state.isSynced),
			Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
			Rx.filter((balance) => balance > 0n),
		),
	);
}

export async function waitForDust(facade: WalletFacade): Promise<bigint> {
	return Rx.firstValueFrom(
		facade.state().pipe(
			Rx.throttleTime(DUST_POLL_INTERVAL),
			Rx.filter((s) => s.isSynced),
			Rx.map((s) => s.dust.balance(new Date())),
			Rx.filter((balance) => balance > 0n),
			Rx.timeout(DUST_GENERATION_TIMEOUT),
		),
	);
}

export async function airdropFromGenesis(targetAddress: string, amount: bigint): Promise<string> {
	return withSpinner("Airdropping from genesis wallet...", async () => {
		const genesis = await buildFacade(GENESIS_SEED);
		try {
			await Rx.firstValueFrom(
				genesis.facade.state().pipe(
					Rx.throttleTime(FUND_POLL_INTERVAL),
					Rx.filter((s) => s.isSynced),
					Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
					Rx.filter((b) => b > 0n),
				),
			);

			const ttl = new Date(Date.now() + 10 * 60 * 1000);
			// Addresses are branded types in the 4.x SDK: decode the bech32m
			// string into a typed UnshieldedAddress for the transfer output.
			const receiverAddress = MidnightBech32m.parse(targetAddress).decode(
				UnshieldedAddress,
				getNetworkId(),
			);
			const recipe = await genesis.facade.transferTransaction(
				[
					{
						type: "unshielded",
						outputs: [
							{
								amount,
								receiverAddress,
								type: unshieldedToken().raw,
							},
						],
					},
				],
				{
					shieldedSecretKeys: genesis.shieldedSecretKeys,
					dustSecretKey: genesis.dustSecretKey,
				},
				{ ttl, payFees: true },
			);

			const signed = await genesis.facade.signRecipe(recipe, (msg) =>
				genesis.keystore.signData(msg),
			);
			const finalized = await genesis.facade.finalizeRecipe(signed);
			const txHash = await genesis.facade.submitTransaction(finalized);
			return txHash;
		} finally {
			await genesis.facade.stop();
		}
	});
}

export async function registerDust(
	facade: WalletFacade,
	keystore: UnshieldedKeystore,
): Promise<string | null> {
	return withSpinner("Registering for DUST generation...", async () => {
		const state = await Rx.firstValueFrom(facade.state().pipe(Rx.filter((s) => s.isSynced)));

		if (state.dust.availableCoins.length > 0) {
			return null; // Already has DUST
		}

		const nightUtxos = state.unshielded.availableCoins.filter(
			(coin) => !coin.meta.registeredForDustGeneration,
		);

		if (nightUtxos.length === 0) {
			throw new Error("No unregistered NIGHT UTXOs available for DUST generation.");
		}

		const dustState = state.dust;
		const ttl = new Date(Date.now() + 10 * 60 * 1000);

		// createDustGenerationTransaction expects the Dust wallet's UtxoWithMeta
		// shape (the ledger Utxo flattened with its `ctime`). `ctime` is already a
		// Date on the unshielded wallet's UtxoWithMeta.
		const recipe = await facade.dust.createDustGenerationTransaction(
			new Date(),
			ttl,
			nightUtxos.map((u) => ({
				...u.utxo,
				ctime: u.meta.ctime,
				registeredForDustGeneration: u.meta.registeredForDustGeneration,
			})),
			keystore.getPublicKey(),
			dustState.address,
		);

		const intent = recipe.intents?.get(1);
		if (!intent) {
			throw new Error("Failed to create DUST generation intent.");
		}
		const sig = keystore.signData(intent.signatureData(1));
		const signed = await facade.dust.addDustGenerationSignature(recipe, sig);
		const finalized = await facade.finalizeTransaction(signed);
		const txHash = await facade.submitTransaction(finalized);
		return txHash;
	});
}
