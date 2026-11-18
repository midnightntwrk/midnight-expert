import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";

export default class Call extends BaseCommand {
	static override description = "Call a contract circuit (transaction)";

	static override args = {
		circuit: Args.string({
			description: "Circuit name to call",
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

	async run(): Promise<void> {
		const { args } = await this.parse(Call);

		// TODO: Replace this stub with your contract's actual circuit calls.
		//
		// Example pattern (using the counter contract):
		//
		//   import { buildFacade, getWallet } from "../lib/wallet.js";
		//   import { createProviders } from "../lib/providers.js";
		//   import { join, loadDeployedContracts } from "../lib/contract.js";
		//
		//   const walletData = getWallet(flags.wallet);
		//   const ctx = await buildFacade(walletData.seed);
		//   try {
		//     const providers = await createProviders(ctx.facade, ctx.keystore, "counter-private-state");
		//     const deployed = loadDeployedContracts().counter;
		//     if (!deployed) throw new Error("No deployed counter contract. Run `deploy` first.");
		//     // No initial private state: reuse the one saved at deploy or join.
		//     const contract = await join(providers, deployed.address);
		//
		//     const txData = await contract.callTx.increment();
		//     this.log(`Transaction: ${txData.public.txId}`);
		//     this.log(`Block: ${txData.public.blockHeight}`);
		//   } finally {
		//     await ctx.facade.stop();
		//   }

		this.log(`Circuit "${args.circuit}" is not yet implemented.`);
		this.log("Edit src/commands/call.ts to add your contract's circuit calls.");
	}
}
