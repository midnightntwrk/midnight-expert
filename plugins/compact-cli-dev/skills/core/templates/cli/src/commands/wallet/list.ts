import { BaseCommand } from "../../base-command.js";
import { loadWallets } from "../../lib/wallet.js";

export default class WalletList extends BaseCommand {
	static override description = "List all saved wallets";

	async run(): Promise<unknown> {
		const store = loadWallets();
		const entries = Object.entries(store);

		if (entries.length === 0) {
			if (!this.jsonEnabled()) {
				this.log("No wallets found. Run `wallet:create` to create one.");
			}
			return [];
		}

		const result = entries.map(([name, w]) => ({ name, address: w.address }));

		if (!this.jsonEnabled()) {
			for (const { name, address } of result) {
				this.log(`  ${name}: ${address}`);
			}
		}

		return result;
	}
}
