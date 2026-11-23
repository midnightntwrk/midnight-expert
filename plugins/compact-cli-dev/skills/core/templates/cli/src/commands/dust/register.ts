import { Args } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { registerDust, waitForDust, waitForFunds } from "../../lib/funding.js";
import { withSpinner } from "../../lib/progress.js";
import { buildFacade, getWallet } from "../../lib/wallet.js";

export default class DustRegister extends BaseCommand {
	static override description = "Register NIGHT UTXOs for DUST generation";

	static override args = {
		name: Args.string({ description: "Wallet name", required: true }),
	};

	async run(): Promise<unknown> {
		const { args } = await this.parse(DustRegister);
		const wallet = getWallet(args.name);

		const ctx = await withSpinner("Building wallet...", () => buildFacade(wallet.seed));
		try {
			await withSpinner("Syncing...", () => waitForFunds(ctx.facade));
			// null when every NIGHT UTXO already generates DUST. Either way, wait
			// until the wallet holds enough DUST to deploy.
			const txId = await registerDust(ctx.facade, ctx.keystore);
			await withSpinner("Waiting for DUST...", () => waitForDust(ctx.facade));

			if (!this.jsonEnabled()) {
				this.log(
					txId ? `  DUST registered. tx: ${txId}` : "  NIGHT already registered; DUST available.",
				);
			}
			return { txId, registered: txId !== null };
		} finally {
			await ctx.facade.stop();
		}
	}
}
