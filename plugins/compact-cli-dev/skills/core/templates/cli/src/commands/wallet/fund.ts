import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import {
	airdropFromGenesis,
	nightBalance,
	registerDust,
	waitForDust,
	waitForFunds,
} from "../../lib/funding.js";
import { withSpinner } from "../../lib/progress.js";
import { buildFacade, getWallet, waitForSettled } from "../../lib/wallet.js";

export default class WalletFund extends BaseCommand {
	static override description = "Fund a wallet from the genesis account and register for DUST";

	static override args = {
		name: Args.string({
			description: "Wallet name",
			required: true,
		}),
	};

	static override flags = {
		...BaseCommand.baseFlags,
		amount: Flags.string({
			// 10,000 NIGHT. DUST accrues in proportion to the NIGHT registered, so
			// this reaches the DUST a deploy needs in under a minute.
			description: "Amount of NIGHT to airdrop (in micro-NIGHT)",
			default: "10000000000",
		}),
	};

	async run(): Promise<unknown> {
		const { args, flags } = await this.parse(WalletFund);
		const wallet = getWallet(args.name);
		const amount = BigInt(flags.amount);

		const ctx = await withSpinner("Syncing wallet...", () => buildFacade(wallet.seed));
		try {
			// Read the balance first, so NIGHT the wallet already holds isn't
			// mistaken for the airdrop.
			const before = nightBalance(await waitForSettled(ctx.facade));

			// Step 1: Airdrop from genesis
			const txId = await airdropFromGenesis(wallet.address, amount);
			if (!this.jsonEnabled()) {
				this.log(`  Airdrop tx: ${txId}`);
			}

			// Step 2: Wait for the airdrop to arrive
			await withSpinner("Waiting for funds to arrive...", () =>
				waitForFunds(ctx.facade, before + amount),
			);

			// Step 3: Register the new NIGHT for DUST, then wait until the wallet
			// holds enough DUST to deploy.
			const dustTx = await registerDust(ctx.facade, ctx.keystore);
			if (dustTx && !this.jsonEnabled()) {
				this.log(`  DUST registration tx: ${dustTx}`);
			}
			await withSpinner("Waiting for DUST generation...", () => waitForDust(ctx.facade));

			if (!this.jsonEnabled()) {
				this.log(`  Wallet "${args.name}" funded and DUST registered.`);
			}

			return { name: args.name, txId, dustTx };
		} finally {
			await ctx.facade.stop();
		}
	}
}
