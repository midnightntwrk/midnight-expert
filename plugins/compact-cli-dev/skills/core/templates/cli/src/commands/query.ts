import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";

export default class Query extends BaseCommand {
	static override description = "Query contract public state (read-only)";

	static override args = {
		field: Args.string({
			description: "Ledger field to query",
			required: true,
		}),
	};

	static override flags = {
		...BaseCommand.baseFlags,
		address: Flags.string({
			description: "Contract address (uses deployed address if omitted)",
		}),
	};

	async run(): Promise<unknown> {
		const { args } = await this.parse(Query);

		// TODO: Replace this stub with your contract's actual state queries.
		//
		// Example pattern (using the counter contract):
		//
		//   import { loadDeployedContracts } from "../lib/contract.js";
		//   import { DEVNET_CONFIG } from "../lib/config.js";
		//   import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
		//   import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
		//   import { ledger } from "@midnight-ntwrk/counter-contract";
		//
		//   const address = flags.address ?? loadDeployedContracts().counter?.address;
		//   if (!address) throw new Error("No contract address. Pass --address or run `deploy` first.");
		//   const publicDataProvider = indexerPublicDataProvider(DEVNET_CONFIG.indexer, DEVNET_CONFIG.indexerWS);
		//   const read = await publicDataProvider.queryContractState(address);
		//
		//   // Midnight.js 5 returns the serialized state tagged with the ledger era
		//   // that wrote it. A contract deployed on ledger 9 decodes with v9.
		//   if (!read) throw new Error(`No contract state found at ${address}.`);
		//   const ledgerState = ledger(read.contractState.deserialize({ v9: ContractState }).data);
		//   if (!this.jsonEnabled()) {
		//     this.log(`Counter value: ${ledgerState.round}`);
		//   }
		//   // With --json, oclif prints what run() returns.
		//   return { address, round: ledgerState.round.toString() };

		if (!this.jsonEnabled()) {
			this.log(`Field "${args.field}" query is not yet implemented.`);
			this.log("Edit src/commands/query.ts to add your contract's state queries.");
		}
		return { field: args.field, implemented: false };
	}
}
