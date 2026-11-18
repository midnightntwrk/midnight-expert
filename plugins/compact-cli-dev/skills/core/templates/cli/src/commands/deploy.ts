import { Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { CONTRACT_NAME } from "../lib/constants.js";
import { deploy } from "../lib/contract.js";
import { waitForFunds } from "../lib/funding.js";
import { withSpinner } from "../lib/progress.js";
import { createProviders } from "../lib/providers.js";
import { buildFacade, getWallet } from "../lib/wallet.js";

export default class Deploy extends BaseCommand {
	static override description = "Deploy the compiled contract to devnet";

	static override flags = {
		...BaseCommand.baseFlags,
		wallet: Flags.string({
			description: "Wallet name to use for deployment",
			default: "default",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Deploy);
		const walletData = getWallet(flags.wallet);

		const ctx = await withSpinner("Building wallet...", () => buildFacade(walletData.seed));
		try {
			await withSpinner("Syncing...", () => waitForFunds(ctx.facade));

			const providers = await withSpinner("Configuring providers...", () =>
				createProviders(ctx.facade, ctx.keystore, `${CONTRACT_NAME}-private-state`),
			);

			const result = await deploy(providers, {});

			if (!this.jsonEnabled()) {
				this.log("  Contract deployed!");
				this.log(`  Address:      ${result.contractAddress}`);
				this.log(`  Transaction:  ${result.txId}`);
				this.log(`  Block:        ${result.blockHeight.toString()}`);
			}

			this.outputResult({
				contractAddress: result.contractAddress,
				txId: result.txId,
				blockHeight: result.blockHeight.toString(),
			});
		} finally {
			await ctx.facade.stop();
		}
	}
}
