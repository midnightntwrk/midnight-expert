import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveSeeds, getWallet, loadWallets, saveWallet, saveWallets } from "../../src/lib/wallet.js";
import { STATE_DIR, WALLETS_FILE } from "../../src/lib/constants.js";

describe("wallet persistence", () => {
	let originalCwd: string;
	let tmpDir: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-test-"));
		process.chdir(tmpDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns empty store when no wallets file exists", () => {
		expect(loadWallets()).toEqual({});
	});

	it("saves and loads wallets", () => {
		const wallet = { seed: "a".repeat(64), address: "addr1", createdAt: "2026-01-01" };
		saveWallet("alice", wallet);

		const store = loadWallets();
		expect(store["alice"]).toEqual(wallet);
	});

	it("sets restrictive file permissions on wallets.json", () => {
		saveWallets({});
		const filePath = path.join(tmpDir, STATE_DIR, WALLETS_FILE);
		const stats = fs.statSync(filePath);
		// Check owner-only read/write (0o600 = 384 decimal, masked to lower 9 bits)
		expect(stats.mode & 0o777).toBe(0o600);
	});

	it("throws when getting nonexistent wallet", () => {
		expect(() => getWallet("nobody")).toThrow('Wallet "nobody" not found');
	});

	it("rejects a seed that isn't 32 bytes of hex", () => {
		expect(() => deriveSeeds("abcd")).toThrow("Invalid seed length");
	});
});
