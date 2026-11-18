export enum ErrorCode {
	NIGHT_REQUIRED = "NIGHT_REQUIRED",
	DUST_REQUIRED = "DUST_REQUIRED",
	SERVICE_DOWN = "SERVICE_DOWN",
	CONTRACT_NOT_FOUND = "CONTRACT_NOT_FOUND",
	WALLET_NOT_FOUND = "WALLET_NOT_FOUND",
	STALE_UTXO = "STALE_UTXO",
	SYNC_TIMEOUT = "SYNC_TIMEOUT",
	INVALID_SEED = "INVALID_SEED",
	UNKNOWN = "UNKNOWN",
}

interface ClassifiedError {
	code: ErrorCode;
	message: string;
	action: string;
}

const CLI_NAME = "{{CLI_PACKAGE_NAME}}";

// Midnight.js 5 wraps a wallet's failure in a ProviderFailedError ("balanceTx
// rejected the transaction ...") and keeps the wallet's own error on `cause`, so
// read the whole chain, not just the top message.
function messageChain(err: unknown): string[] {
	const messages: string[] = [];
	let current: unknown = err;
	for (let depth = 0; current !== undefined && current !== null && depth < 8; depth++) {
		messages.push(current instanceof Error ? current.message : String(current));
		// The wallet SDK's submitTransaction rejects with an AggregateError whose
		// first error is the real one.
		if (current instanceof AggregateError) {
			for (const inner of current.errors) messages.push(...messageChain(inner));
		}
		current = current instanceof Error ? current.cause : undefined;
	}
	return messages;
}

export function classifyError(err: unknown): ClassifiedError {
	const chain = messageChain(err).map((m) => m.toLowerCase());
	const message = messageChain(err).join("\n  caused by: ");
	// Each rule is matched against one message at a time, so words from two
	// unrelated messages in the chain can't combine into a match.
	const anyMessage = (test: (lower: string) => boolean) => chain.some(test);

	// Unreachable services first: a wrapper that mentions DUST can sit on top of
	// an indexer or node that is simply down.
	if (anyMessage((lower) => lower.includes("econnrefused") && lower.includes("6300"))) {
		return {
			code: ErrorCode.SERVICE_DOWN,
			message: "Proof server is not reachable at localhost:6300.",
			action: `Run \`${CLI_NAME} devnet:start\` to start all services.`,
		};
	}

	if (
		anyMessage(
			(lower) =>
				lower.includes("econnrefused") && (lower.includes("8088") || lower.includes("9944")),
		)
	) {
		return {
			code: ErrorCode.SERVICE_DOWN,
			message: "Devnet services are not reachable.",
			action: `Run \`${CLI_NAME} devnet:status\` to check which services are down.`,
		};
	}

	if (
		anyMessage(
			(lower) => lower.includes("no unregistered night") || lower.includes("no night arrived"),
		)
	) {
		return {
			code: ErrorCode.NIGHT_REQUIRED,
			message,
			action: `The wallet has no NIGHT. Run \`${CLI_NAME} wallet:fund <wallet>\` first.`,
		};
	}

	if (
		anyMessage(
			(lower) =>
				lower.includes("could not balance dust") ||
				lower.includes("insufficient dust") ||
				lower.includes("insufficientdustforfee") ||
				lower.includes("insufficient fee") ||
				lower.includes("dust is still accruing"),
		)
	) {
		return {
			code: ErrorCode.DUST_REQUIRED,
			message,
			action: `Run \`${CLI_NAME} dust:status <wallet>\`. If no NIGHT is registered, run \`${CLI_NAME} dust:register <wallet>\`; if it is, DUST is still accruing, so wait a minute and retry.`,
		};
	}

	if (anyMessage((lower) => lower.includes("contract") && lower.includes("not found"))) {
		return {
			code: ErrorCode.CONTRACT_NOT_FOUND,
			message,
			action: "Verify the contract address and that the devnet is running.",
		};
	}

	if (anyMessage((lower) => lower.includes("wallet") && lower.includes("not found"))) {
		return {
			code: ErrorCode.WALLET_NOT_FOUND,
			message,
			action: `Run \`${CLI_NAME} wallet:list\` to see available wallets, or \`${CLI_NAME} wallet:create <name>\` to create one.`,
		};
	}

	if (
		anyMessage(
			(lower) => lower.includes("stale") || (lower.includes("utxo") && lower.includes("spent")),
		)
	) {
		return {
			code: ErrorCode.STALE_UTXO,
			message,
			action: "A coin was already spent. Wait for wallet sync to complete and retry.",
		};
	}

	if (
		anyMessage(
			(lower) =>
				lower.includes("invalid") && (lower.includes("seed") || lower.includes("mnemonic")),
		)
	) {
		return {
			code: ErrorCode.INVALID_SEED,
			message,
			action: "The wallet seed must be a 64-character hex string (32 bytes).",
		};
	}

	if (anyMessage((lower) => lower.includes("timeout") || lower.includes("timed out"))) {
		return {
			code: ErrorCode.SYNC_TIMEOUT,
			message,
			action: "The devnet may still be starting. Wait a moment and retry.",
		};
	}

	return {
		code: ErrorCode.UNKNOWN,
		message,
		action: "Check the devnet logs for more details.",
	};
}

export function formatError(classified: ClassifiedError): string {
	return `Error [${classified.code}]: ${classified.message}\n  → ${classified.action}`;
}
