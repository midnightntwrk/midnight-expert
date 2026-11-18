# Error Handling Reference

Covers error classification, the ErrorCode enum, formatting, BaseCommand integration, and patterns for adding new error types.

---

## Error Classification

The `classifyError()` function inspects an error's message and returns a structured `ClassifiedError`:

```typescript
interface ClassifiedError {
  code: ErrorCode;
  message: string;
  action: string;
}

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
  // Each rule is matched against one message at a time.
  const anyMessage = (test: (lower: string) => boolean) => chain.some(test);

  // Unreachable services first: a wrapper that mentions DUST can sit on top of
  // an indexer or node that is simply down.
  if (anyMessage((lower) => lower.includes("econnrefused") && lower.includes("6300"))) {
    return { code: ErrorCode.SERVICE_DOWN, message: "Proof server is not reachable at localhost:6300.", action: `Run \`${CLI_NAME} devnet:start\` to start all services.` };
  }

  if (anyMessage((lower) => lower.includes("no unregistered night") || lower.includes("no night arrived"))) {
    return { code: ErrorCode.NIGHT_REQUIRED, message, action: `The wallet has no NIGHT. Run \`${CLI_NAME} wallet:fund <wallet>\` first.` };
  }

  if (anyMessage((lower) => lower.includes("could not balance dust") || lower.includes("insufficient dust") /* ... */)) {
    return {
      code: ErrorCode.DUST_REQUIRED,
      message,
      action: `Run \`${CLI_NAME} dust:status <wallet>\`. If no NIGHT is registered, run \`${CLI_NAME} dust:register <wallet>\`; if it is, DUST is still accruing, so wait a minute and retry.`,
    };
  }

  // ... more patterns ...

  return {
    code: ErrorCode.UNKNOWN,
    message,
    action: "Check the devnet logs for more details.",
  };
}
```

Classification works by substring matching on the lowercased error messages, one message at a time, so words from two unrelated messages in the chain can't combine into a match. The first matching rule wins, and unreachable services are checked first.

Midnight.js 5 wraps a provider's failure in a `ProviderFailedError` whose own message is generic ("balanceTx rejected the transaction. The provider's own failure is on `cause` ..."). The wallet's actual error, such as `Insufficient Funds: could not balance dust`, is on `cause`, so `messageChain()` walks the `cause` chain, and the errors inside an `AggregateError`, and the classifier matches against every message in it.

---

## ErrorCode Enum

| Code | Triggers When | Suggested Action |
|------|--------------|-----------------|
| `NIGHT_REQUIRED` | No unregistered NIGHT to register, or no NIGHT arrived in time | Run `wallet:fund <wallet>` |
| `DUST_REQUIRED` | A message says the wallet couldn't balance DUST, or that DUST is still accruing | Check `dust:status <wallet>`; register NIGHT or wait for DUST to accrue |
| `SERVICE_DOWN` | Connection refused to port 6300 (proof server) | Run `devnet:start` |
| `SERVICE_DOWN` | Connection refused to port 8088 (indexer) or 9944 (node) | Run `devnet:status` to check services |
| `CONTRACT_NOT_FOUND` | Message contains "contract" and "not found" | Verify contract address and devnet status |
| `SYNC_TIMEOUT` | Message contains "timeout" or "timed out" | Wait for devnet to start, then retry |
| `WALLET_NOT_FOUND` | Thrown by `getWallet()` when name not in store | Run `wallet:create <name>` |
| `INVALID_SEED` | Thrown by `deriveSeeds()` on bad seed length | Check seed is exactly 64 hex characters |
| `STALE_UTXO` | Transaction fails due to spent inputs | Retry — wallet state is stale |
| `UNKNOWN` | No pattern matches | Check devnet logs |

```typescript
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
```

---

## `formatError()`

Produces a single-line error message with an action hint:

```typescript
export function formatError(classified: ClassifiedError): string {
  return `Error [${classified.code}]: ${classified.message}\n  → ${classified.action}`;
}
```

Example output:

```
Error [DUST_REQUIRED]: No dust available for fee payment
  → Run `my-cli dust:register default` to generate DUST tokens.
```

---

## How BaseCommand Uses Classification

`BaseCommand.catch()` is the Oclif error handler. It classifies every error and outputs the result in the appropriate format:

```typescript
async catch(err: unknown): Promise<void> {
  const classified = classifyError(err);
  if (this.jsonEnabled) {
    this.log(
      JSON.stringify(
        { error: classified.code, message: classified.message, action: classified.action },
        null, "\t",
      ),
    );
  } else {
    this.error(formatError(classified));
  }
}
```

In JSON mode, errors are structured objects:

```json
{
  "error": "SERVICE_DOWN",
  "message": "Proof server is not reachable at localhost:6300.",
  "action": "Run `my-cli devnet:start` to start all services."
}
```

In normal mode, the `this.error()` call prints the formatted string and exits with a non-zero code.

---

## Error-to-Action Mapping

| Error Code | CLI Action |
|------------|-----------|
| `NIGHT_REQUIRED` | `wallet:fund <wallet>` |
| `DUST_REQUIRED` | `dust:status <wallet>`, then `dust:register <wallet>` or wait |
| `SERVICE_DOWN` (proof server) | `devnet:start` |
| `SERVICE_DOWN` (indexer/node) | `devnet:status` |
| `CONTRACT_NOT_FOUND` | Verify address, check `devnet:status` |
| `SYNC_TIMEOUT` | Wait and retry |
| `WALLET_NOT_FOUND` | `wallet:create <name>` |
| `INVALID_SEED` | Fix seed input (64 hex chars) |
| `STALE_UTXO` | Retry the operation |
| `UNKNOWN` | Check devnet logs |

---

## Adding New Error Classifications

To classify a new error type:

1. Add a new value to the `ErrorCode` enum
2. Add a detection block in `classifyError()` before the `UNKNOWN` fallback
3. Include a helpful `action` string that tells the user what to do

```typescript
// In errors.ts:

export enum ErrorCode {
  // ... existing codes ...
  PROOF_TIMEOUT = "PROOF_TIMEOUT",
  UNKNOWN = "UNKNOWN",
}

export function classifyError(err: unknown): ClassifiedError {
  const chain = messageChain(err).map((m) => m.toLowerCase());
  const message = messageChain(err).join("\n  caused by: ");
  const anyMessage = (test: (lower: string) => boolean) => chain.some(test);

  // ... existing patterns ...

  // Add new pattern before the UNKNOWN fallback:
  if (anyMessage((lower) => lower.includes("proof") && lower.includes("timeout"))) {
    return {
      code: ErrorCode.PROOF_TIMEOUT,
      message,
      action: "The proof server may be overloaded. Check `devnet:status` and retry.",
    };
  }

  return {
    code: ErrorCode.UNKNOWN,
    message,
    action: "Check the devnet logs for more details.",
  };
}
```

Pattern matching tips:
- Wrap each condition in `anyMessage((lower) => ...)`, which tests one lowercased message of the chain at a time
- Combine multiple conditions with `&&` for specificity (e.g., port number + "econnrefused")
- Place more specific patterns before broader ones — first match wins
