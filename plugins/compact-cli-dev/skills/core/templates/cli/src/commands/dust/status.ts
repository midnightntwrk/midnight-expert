import { Args } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { withSpinner } from "../../lib/progress.js";
import { buildFacade, getWallet, waitForSettled } from "../../lib/wallet.js";

export default class DustStatus extends BaseCommand {
	static override description = "Check DUST balance and registration status";

	static override args = {
		name: Args.string({ description: "Wallet name", required: true }),
	};

	async run(): Promise<void> {
		const { args } = await this.parse(DustStatus);
		const wallet = getWallet(args.name);

		const ctx = await withSpinner("Syncing wallet...", () => buildFacade(wallet.seed));
		try {
			const state = await waitForSettled(ctx.facade);

			const balance = state.dust.balance(new Date());
			const available = state.dust.availableCoins.length;
			const registered = state.unshielded.availableCoins.filter(
				(c) => c.meta.registeredForDustGeneration,
			).length;

			const result = {
				balance: balance.toString(),
				available,
				registered,
			};

			if (!this.jsonEnabled()) {
				this.log(`  DUST balance:    ${balance.toString()}`);
				this.log(`  Available coins: ${String(available)}`);
				this.log(`  Registered:      ${String(registered)}`);
			}

			this.outputResult(result);
		} finally {
			await ctx.facade.stop();
		}
	}
}
