# Oclif Patterns Reference

Covers how Oclif commands work in this CLI template, the BaseCommand class, topic grouping, `--json` support, and patterns for adding new commands.

---

## How Oclif Commands Work

Every command is a class that extends `Command` (or our `BaseCommand`). The framework discovers commands by scanning the `src/commands/` directory. Each command class defines:

- `static description` — help text shown in `--help` output
- `static args` — positional arguments (via `Args.string()`, `Args.integer()`, etc.)
- `static flags` — named flags (via `Flags.string()`, `Flags.boolean()`, etc.)
- `run()` — the async method that executes when the command is invoked

```typescript
import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";

export default class Deploy extends BaseCommand {
  static override description = "Deploy the compiled contract to devnet";

  static override flags = {
    ...BaseCommand.baseFlags,
    wallet: Flags.string({
      description: "Wallet name to use for deployment",
      default: "default",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Deploy);
    // Implementation here
  }
}
```

---

## BaseCommand

All commands in this template extend `BaseCommand` instead of the raw Oclif `Command`. It provides:

### Inherited Behavior

| Feature | Description |
|---------|-------------|
| `--json` flag | Enabled with `static override enableJsonFlag = true`; read it with `this.jsonEnabled()` |
| JSON-mode spinners | Spinners are silenced when `--json` is active |
| Welcome banner | Shown once per project (tracked via `.dapp-state/.initialized`) |
| Error classification | `catch()` is overridden to classify errors and format output |
| `outputResult()` | Outputs structured JSON when `--json` is enabled |

### Source

```typescript
export abstract class BaseCommand extends Command {
  // Opt in to oclif's built-in `--json` flag. In @oclif/core v4 `jsonEnabled`
  // is a method on the base Command, so call it: `this.jsonEnabled()`.
  static override enableJsonFlag = true;

  override async init(): Promise<void> {
    await super.init();
    setJsonMode(this.jsonEnabled());
    this.showWelcomeBanner();
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
          null, "\t",
        ),
      );
    } else {
      this.error(formatError(classified));
    }
  }
}
```

### Using `--json` in Commands

Always check `this.jsonEnabled()` before logging human-readable output. Call `this.outputResult(data)` to emit JSON when the flag is set:

```typescript
async run(): Promise<void> {
  const result = { contractAddress: "0xabc...", txId: "0x123..." };

  if (!this.jsonEnabled()) {
    this.log(`  Contract deployed!`);
    this.log(`  Address: ${result.contractAddress}`);
  }

  this.outputResult(result);
}
```

---

## Topic Grouping via Directory Structure

Oclif maps the `src/commands/` directory tree to colon-separated command topics:

| File Path | Command |
|-----------|---------|
| `src/commands/balance.ts` | `balance` |
| `src/commands/deploy.ts` | `deploy` |
| `src/commands/wallet/create.ts` | `wallet:create` |
| `src/commands/wallet/list.ts` | `wallet:list` |
| `src/commands/devnet/start.ts` | `devnet:start` |

To add a new topic, create a directory under `src/commands/`. Each `.ts` file in that directory becomes a subcommand.

---

## Pattern for Adding a New Command

1. Create a file under `src/commands/` (use subdirectories for topic grouping)
2. Export a default class that extends `BaseCommand`
3. Define `static description`, `static args`, and `static flags`
4. Spread `...BaseCommand.baseFlags` into your flags to inherit `--json`
5. Implement `run()` — use `this.parse()` to access args and flags
6. Guard human output with `if (!this.jsonEnabled())` and call `this.outputResult()` for JSON

```typescript
import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";

export default class WalletCreate extends BaseCommand {
  static override description = "Generate a new wallet with a random seed";

  static override args = {
    name: Args.string({
      description: "Name for the wallet",
      default: "default",
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(WalletCreate);
    const name = args.name;

    // ... wallet creation logic ...

    if (!this.jsonEnabled()) {
      this.log(`Wallet "${name}" created.`);
      this.log(`  Address: ${address}`);
    }

    this.outputResult({ name, address, seed });
  }
}
```

---

## Progress Feedback

The `progress.ts` module provides spinner helpers that automatically respect JSON mode:

```typescript
import { withSpinner } from "../lib/progress.js";

// Wraps an async operation with an ora spinner.
// In JSON mode, the spinner is silenced.
const result = await withSpinner("Deploying contract...", async () => {
  return await deploy(providers, {});
});
```

Use `withSpinner` for any operation that takes more than a few seconds (wallet sync, deployment, DUST registration).
