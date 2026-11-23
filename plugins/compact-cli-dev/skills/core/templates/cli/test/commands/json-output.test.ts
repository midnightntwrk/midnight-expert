import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "@oclif/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import WalletInfo from "../../src/commands/wallet/info.js";
import WalletList from "../../src/commands/wallet/list.js";

// The CLI package root, so oclif can load its config.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// oclif writes command output with console.log, so capture it there.
async function runAndCapture(run: () => Promise<unknown>): Promise<string> {
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	try {
		await run();
		return log.mock.calls.map((args) => args.join(" ")).join("\n");
	} finally {
		log.mockRestore();
	}
}

describe("--json output", () => {
	let config: Config;
	let originalCwd: string;
	let tmpDir: string;

	// Loading oclif's config is slow the first time, so do it once.
	beforeAll(async () => {
		config = await Config.load(root);
	}, 30_000);

	beforeEach(() => {
		originalCwd = process.cwd();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "json-test-"));
		process.chdir(tmpDir);
		process.exitCode = undefined;
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tmpDir, { recursive: true, force: true });
		// A failing command sets this; clear it so the test run itself passes.
		process.exitCode = undefined;
	});

	it("prints the command's result as JSON", async () => {
		const stdout = await runAndCapture(() => WalletList.run(["--json"], config));

		expect(JSON.parse(stdout)).toEqual([]);
		expect(process.exitCode).toBeUndefined();
	});

	it("prints an error as JSON and exits non-zero", async () => {
		const stdout = await runAndCapture(() => WalletInfo.run(["nope", "--json"], config));

		expect(JSON.parse(stdout)).toMatchObject({
			error: "WALLET_NOT_FOUND",
			message: expect.stringContaining("nope"),
		});
		expect(process.exitCode).toBe(1);
	});
});
