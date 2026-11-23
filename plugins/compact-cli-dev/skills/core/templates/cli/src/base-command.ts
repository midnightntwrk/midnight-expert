import fs from "node:fs";
import path from "node:path";
import { Command, type Interfaces } from "@oclif/core";
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

	// With --json, oclif prints whatever run() returns as JSON, so a command
	// returns its result instead of logging it (this.log() is muted in JSON
	// mode). If run() throws, even from a finally block, only the error is
	// printed. Guard human-readable output with `if (!this.jsonEnabled())`.

	override async catch(err: Interfaces.CommandError): Promise<unknown> {
		if (this.jsonEnabled()) {
			// oclif sets a non-zero exit code and prints toErrorJson(err).
			return super.catch(err);
		}
		this.error(formatError(classifyError(err)));
	}

	protected override toErrorJson(err: unknown): unknown {
		const { code, message, action } = classifyError(err);
		return { error: code, message, action };
	}
}
