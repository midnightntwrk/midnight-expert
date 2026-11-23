import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { CONTRACT_NAME } from "../lib/constants.js";
import { join } from "../lib/contract.js";
import { waitForFunds } from "../lib/funding.js";
import { withSpinner } from "../lib/progress.js";
import { createProviders } from "../lib/providers.js";
import { buildFacade, getWallet } from "../lib/wallet.js";

export default class Join extends BaseCommand {
	static override description = "Join an existing deployed contract";

	static override args = {
		address: Args.string({
			description: "Contract address to join",
			required: true,
		}),
	};

	static override flags = {
		...BaseCommand.baseFlags,
		wallet: Flags.string({
			description: "Wallet name",
			default: "default",
		}),
	};

	async run(): Promise<unknown> {
		const { args, flags } = await this.parse(Join);
		const walletData = getWallet(flags.wallet);

		const ctx = await withSpinner("Building wallet...", () => buildFacade(walletData.seed));
		try {
			await withSpinner("Syncing...", () => waitForFunds(ctx.facade));

			const providers = await createProviders(
				ctx.facade,
				ctx.keystore,
				`${CONTRACT_NAME}-private-state`,
			);

			await join(providers, args.address, {});

			if (!this.jsonEnabled()) {
				this.log(`  Joined contract at: ${args.address}`);
			}

			return { contractAddress: args.address };
		} finally {
			await ctx.facade.stop();
		}
	}
}
