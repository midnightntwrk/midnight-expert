import { Args } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { createWalletKeystore, deriveSeeds, newSeed, saveWallet } from "../../lib/wallet.js";

export default class WalletCreate extends BaseCommand {
	static override description = "Generate a new wallet with a random seed";

	static override args = {
		name: Args.string({
			description: "Name for the wallet",
			default: "default",
		}),
	};

	async run(): Promise<unknown> {
		const { args } = await this.parse(WalletCreate);
		const name = args.name;

		const seed = newSeed();
		const keystore = createWalletKeystore(deriveSeeds(seed));
		// getBech32Address() returns a branded MidnightBech32m; persist the string.
		const address = keystore.getBech32Address().toString();

		const wallet = {
			seed,
			address,
			createdAt: new Date().toISOString(),
		};

		saveWallet(name, wallet);

		if (!this.jsonEnabled()) {
			this.log(`Wallet "${name}" created.`);
			this.log(`  Address: ${address}`);
			this.log(`  Seed:    ${seed}`);
		}

		return { name, address, seed };
	}
}
