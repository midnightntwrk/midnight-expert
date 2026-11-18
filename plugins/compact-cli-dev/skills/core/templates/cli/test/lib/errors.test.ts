import { describe, expect, it } from "vitest";
import { classifyError, ErrorCode } from "../../src/lib/errors.js";

describe("classifyError", () => {
	it("classifies DUST-related errors", () => {
		const result = classifyError(new Error("Insufficient dust for transaction fees"));
		expect(result.code).toBe(ErrorCode.DUST_REQUIRED);
		expect(result.action).toContain("dust:register");
	});

	it("classifies a DUST shortfall wrapped by Midnight.js", () => {
		const wrapped = new Error(
			"balanceTx rejected the transaction. The provider's own failure is on `cause`.",
			{ cause: new Error("Wallet.InsufficientFunds: Insufficient Funds: could not balance dust") },
		);
		const result = classifyError(wrapped);
		expect(result.code).toBe(ErrorCode.DUST_REQUIRED);
		expect(result.message).toContain("could not balance dust");
	});

	it("classifies proof server connection errors", () => {
		const result = classifyError(new Error("connect ECONNREFUSED 127.0.0.1:6300"));
		expect(result.code).toBe(ErrorCode.SERVICE_DOWN);
		expect(result.action).toContain("devnet:start");
	});

	it("classifies indexer connection errors", () => {
		const result = classifyError(new Error("connect ECONNREFUSED 127.0.0.1:8088"));
		expect(result.code).toBe(ErrorCode.SERVICE_DOWN);
		expect(result.action).toContain("devnet:status");
	});

	it("classifies timeout errors", () => {
		const result = classifyError(new Error("Operation timed out"));
		expect(result.code).toBe(ErrorCode.SYNC_TIMEOUT);
	});

	it("classifies contract not found errors", () => {
		const result = classifyError(new Error("Contract not found at address"));
		expect(result.code).toBe(ErrorCode.CONTRACT_NOT_FOUND);
	});

	it("classifies unknown errors", () => {
		const result = classifyError(new Error("Something unexpected"));
		expect(result.code).toBe(ErrorCode.UNKNOWN);
	});

	it("handles non-Error values", () => {
		const result = classifyError("string error");
		expect(result.code).toBe(ErrorCode.UNKNOWN);
		expect(result.message).toBe("string error");
	});
});
