import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const FIXTURES = path.resolve(import.meta.dirname, "..", "test-fixtures", "sample-template");
const CLI_PATH = path.resolve(import.meta.dirname, "index.ts");
const TSX_BIN = path.resolve(import.meta.dirname, "..", "node_modules", ".bin", "tsx");

function runCli(input: string): { stdout: string; stderr: string; exitCode: number } {
	try {
		const stdout = execFileSync(TSX_BIN, [CLI_PATH], {
			input,
			encoding: "utf-8",
			cwd: path.resolve(import.meta.dirname, ".."),
			timeout: 10_000,
		});
		return { stdout, stderr: "", exitCode: 0 };
	} catch (error: unknown) {
		const e = error as { stdout?: string; stderr?: string; status?: number };
		return {
			stdout: e.stdout ?? "",
			stderr: e.stderr ?? "",
			exitCode: e.status ?? 1,
		};
	}
}

describe("template-engine CLI", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmpl-cli-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("processes template from stdin JSON and writes result to stdout", () => {
		const outDir = path.join(tmpDir, "out");
		const input = JSON.stringify({
			template: FIXTURES,
			output: outDir,
			context: { NAME: "Bob", PROJECT: "test-proj" },
		});

		const { stdout, exitCode } = runCli(input);
		expect(exitCode).toBe(0);

		const result = JSON.parse(stdout) as { output: string; files: number };
		expect(result.files).toBe(4);
		expect(fs.existsSync(path.join(outDir, "hello.txt"))).toBe(true);

		const hello = fs.readFileSync(path.join(outDir, "hello.txt"), "utf-8");
		expect(hello).toContain("Bob");
	});

	it("exits with code 1 and writes error JSON to stderr on invalid input", () => {
		const { stderr, exitCode } = runCli("not json");
		expect(exitCode).toBe(1);
		const errResult = JSON.parse(stderr) as { error: string };
		expect(errResult.error).toBeDefined();
	});

	it("exits with code 1 when template dir does not exist", () => {
		const input = JSON.stringify({
			template: "/nonexistent",
			output: path.join(tmpDir, "out"),
			context: {},
		});

		const { stderr, exitCode } = runCli(input);
		expect(exitCode).toBe(1);
		const errResult = JSON.parse(stderr) as { error: string };
		expect(errResult.error).toContain("does not exist");
	});
});
