import { Args } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { getWallet } from "../../lib/wallet.js";

export default class WalletInfo extends BaseCommand {
	static override description = "Show wallet details";

	static override args = {
		name: Args.string({
			description: "Wallet name",
			required: true,
		}),
	};

	async run(): Promise<unknown> {
		const { args } = await this.parse(WalletInfo);
		const wallet = getWallet(args.name);

		const result = {
			name: args.name,
			address: wallet.address,
			createdAt: wallet.createdAt,
		};

		if (!this.jsonEnabled()) {
			this.log(`Wallet: ${args.name}`);
			this.log(`  Address:    ${wallet.address}`);
			this.log(`  Created:    ${wallet.createdAt}`);
		}

		return result;
	}
}
