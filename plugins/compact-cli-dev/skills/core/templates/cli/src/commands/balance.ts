import { Token } from "@midnightntwrk/wallet-sdk";
import { Args } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { withSpinner } from "../lib/progress.js";
import { buildFacade, getWallet, waitForSettled } from "../lib/wallet.js";

export default class Balance extends BaseCommand {
	static override description = "Check NIGHT and DUST balances for a wallet";

	static override args = {
		name: Args.string({ description: "Wallet name", required: true }),
	};

	async run(): Promise<unknown> {
		const { args } = await this.parse(Balance);
		const wallet = getWallet(args.name);

		const ctx = await withSpinner("Syncing wallet...", () => buildFacade(wallet.seed));
		try {
			const state = await waitForSettled(ctx.facade);

			const night = state.unshielded.balances[Token.night] ?? 0n;
			const dust = state.dust.balance(new Date());

			const result = {
				night: night.toString(),
				dust: dust.toString(),
			};

			if (!this.jsonEnabled()) {
				this.log(`  NIGHT: ${night.toString()}`);
				this.log(`  DUST:  ${dust.toString()}`);
			}

			return result;
		} finally {
			await ctx.facade.stop();
		}
	}
}
