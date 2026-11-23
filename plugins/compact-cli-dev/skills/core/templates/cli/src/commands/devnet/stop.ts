import { execSync } from "node:child_process";
import { BaseCommand } from "../../base-command.js";
import { findComposeFile } from "../../lib/devnet.js";

export default class DevnetStop extends BaseCommand {
	static override description = "Stop the local devnet";

	async run(): Promise<unknown> {
		const composeFile = findComposeFile();

		execSync(`docker compose -f "${composeFile}" down`, {
			stdio: this.jsonEnabled() ? "pipe" : "inherit",
		});

		if (!this.jsonEnabled()) {
			this.log("  Devnet stopped.");
		}
		return { stopped: true };
	}
}
