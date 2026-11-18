import fs from "node:fs";
import path from "node:path";
import { Command } from "@oclif/core";
import { INIT_MARKER, STATE_DIR } from "./lib/constants.js";
import { classifyError, formatError } from "./lib/errors.js";
import { setJsonMode } from "./lib/progress.js";

const WELCOME_BANNER = `
  ┌─────────────────────────────────────────────────────────────┐
  │  WARNING: These wallets are for LOCAL DEVNET use only.      │
  │  Seeds are stored in plaintext. Never use these accounts    │
  │  on preprod, preview, or mainnet.                           │
  └─────────────────────────────────────────────────────────────┘
`;

export abstract class BaseCommand extends Command {
	// Opt in to oclif's built-in `--json` flag. When `--json` is passed,
	// `this.jsonEnabled()` returns true. (In @oclif/core v4 `jsonEnabled` is a
	// method on the base Command, so we must call it, not assign to it.)
	static override enableJsonFlag = true;

	override async init(): Promise<void> {
		await super.init();
		setJsonMode(this.jsonEnabled());
		this.showWelcomeBanner();
	}

	private showWelcomeBanner(): void {
		if (this.jsonEnabled()) return;

		const markerPath = path.join(process.cwd(), STATE_DIR, INIT_MARKER);
		if (fs.existsSync(markerPath)) return;

		this.log(WELCOME_BANNER);

		const dir = path.join(process.cwd(), STATE_DIR);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(markerPath, "");
	}

	protected outputResult(result: unknown): void {
		if (this.jsonEnabled()) {
			this.log(JSON.stringify(result, null, "\t"));
		}
	}

	override async catch(err: unknown): Promise<void> {
		const classified = classifyError(err);
		if (this.jsonEnabled()) {
			this.log(
				JSON.stringify(
					{ error: classified.code, message: classified.message, action: classified.action },
					null,
					"\t",
				),
			);
		} else {
			this.error(formatError(classified));
		}
	}
}
