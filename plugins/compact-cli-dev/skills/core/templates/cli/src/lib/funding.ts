import { unshieldedToken } from "@midnight-ntwrk/midnight-js-protocol/v9";
import {
	MidnightBech32m,
	UnshieldedAddress,
	type UnshieldedKeystore,
	type UtxoWithMeta,
	type WalletFacade,
	isInsufficientDustForFeeError,
} from "@midnightntwrk/wallet-sdk";
import * as Rx from "rxjs";
import { DEVNET_CONFIG } from "./config.js";
import {
	DUST_GENERATION_TIMEOUT,
	DUST_MIN_REQUIREMENT,
	DUST_POLL_INTERVAL,
	FUND_POLL_INTERVAL,
	GENESIS_SEED,
	TX_TTL_SECONDS,
} from "./constants.js";
import { withSpinner } from "./progress.js";
import { buildFacade, waitForSettled } from "./wallet.js";

const NIGHT = unshieldedToken().raw;

export async function waitForFunds(facade: WalletFacade): Promise<bigint> {
	return Rx.firstValueFrom(
		facade.state().pipe(
			Rx.throttleTime(FUND_POLL_INTERVAL, undefined, { leading: true, trailing: true }),
			Rx.filter((s) => s.isSynced && s.protocol._tag === "Settled"),
			Rx.map((s) => s.unshielded.balances[NIGHT] ?? 0n),
			Rx.filter((balance) => balance > 0n),
		),
	);
}

// DUST accrues after registration, so a freshly registered wallet holds a coin
// worth almost nothing. Wait until it can pay for a deploy. The balance grows
// with time, not with new wallet state, so re-read it on a timer.
export async function waitForDust(
	facade: WalletFacade,
	minimum = DUST_MIN_REQUIREMENT,
): Promise<bigint> {
	return Rx.firstValueFrom(
		Rx.combineLatest([
			facade.state().pipe(Rx.filter((s) => s.isSynced)),
			Rx.timer(0, DUST_POLL_INTERVAL),
		]).pipe(
			Rx.map(([s]) => s.dust.balance(new Date())),
			Rx.filter((balance) => balance >= minimum),
			Rx.timeout({ first: DUST_GENERATION_TIMEOUT }),
		),
	);
}

export async function airdropFromGenesis(targetAddress: string, amount: bigint): Promise<string> {
	return withSpinner("Airdropping from genesis wallet...", async () => {
		const genesis = await buildFacade(GENESIS_SEED);
		try {
			await waitForFunds(genesis.facade);

			// Addresses are branded types: decode the bech32m string into a typed
			// UnshieldedAddress for the transfer output.
			const receiverAddress = MidnightBech32m.parse(targetAddress).decode(
				UnshieldedAddress,
				DEVNET_CONFIG.networkId,
			);
			const recipe = await genesis.facade.transferTransaction(
				[{ type: "unshielded", outputs: [{ amount, receiverAddress, type: NIGHT }] }],
				{ ttl: new Date(Date.now() + TX_TTL_SECONDS * 1000), payFees: true },
			);

			const signed = await genesis.facade.signRecipe(recipe, genesis.keystore.signDataAsync);
			const finalized = await genesis.facade.finalizeRecipe(signed);
			return await genesis.facade.submitTransaction(finalized);
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
		const state = await waitForSettled(facade);

		const nightUtxos: readonly UtxoWithMeta[] = state.unshielded.availableCoins.filter(
			(coin) => coin.utxo.type === NIGHT && !coin.meta.registeredForDustGeneration,
		);

		if (nightUtxos.length === 0) {
			if (state.dust.availableCoins.length > 0) {
				return null; // Every NIGHT UTXO already generates DUST
			}
			throw new Error("No unregistered NIGHT UTXOs available for DUST generation.");
		}

		// A first registration pays its own fee from the DUST the NIGHT has
		// generated since it arrived. NIGHT that just arrived may not cover it
		// yet, and the call throws InsufficientDustForFeeError with an estimate of
		// when it will. Wait that long plus a margin and retry; an unreachable fee
		// is a real error.
		const register = () =>
			facade.registerNightUtxosForDustGeneration(
				nightUtxos,
				keystore.getPublicKey(),
				keystore.signDataAsync,
			);
		const recipe = await register().catch(async (error: unknown) => {
			if (!isInsufficientDustForFeeError(error) || error.estimate._tag !== "Reachable") throw error;
			const timeoutMs = Number(error.estimate.seconds) * 1000 + 60_000;
			await facade.waitForGeneratedDust(nightUtxos, error.fee, { timeoutMs });
			return register();
		});

		const finalized = await facade.finalizeRecipe(recipe);
		return await facade.submitTransaction(finalized);
	});
}
