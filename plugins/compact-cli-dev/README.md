# compact-cli-dev

<p align="center">
  <img src="assets/mascot.png" alt="compact-cli-dev mascot" width="200" />
</p>

Scaffold and develop Oclif CLIs for Midnight Compact smart contracts. Includes a complete CLI template with wallet management, contract deployment, devnet control, and an AI agent for ongoing development.

## Skills

### compact-cli-dev:core

Covers patterns for building Oclif CLIs that interact with Midnight Compact smart contracts on a local devnet. Provides a full project template with wallet management, contract deployment, circuit invocation, state queries, devnet lifecycle control, and extensibility patterns.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [oclif-patterns](skills/core/references/oclif-patterns.md) | Command structure, BaseCommand, --json support, and topic grouping | When understanding how commands are structured and organized |
| [wallet-management](skills/core/references/wallet-management.md) | seed derivation, WalletFacade, seed format, persistence, and key functions | When working with wallet creation, storage, or derivation |
| [provider-setup](skills/core/references/provider-setup.md) | The provider bundle, createProviders(), and network config | When connecting to a Midnight network |
| [contract-lifecycle](skills/core/references/contract-lifecycle.md) | CompiledContract, deploy, join, calling circuits, and querying state | When deploying or interacting with contracts from the CLI |
| [error-handling](skills/core/references/error-handling.md) | Error classification, ErrorCode enum, formatError, and adding new codes | When handling or extending CLI error reporting |

## Commands

### compact-cli-dev:init

Scaffolds a new Oclif CLI package for a Midnight Compact smart contract using the built-in template engine. Accepts optional arguments for directory, project name, contract name, and contract path, inferring missing values from the project context.

#### Output

A fully scaffolded CLI project with installed dependencies, git hooks, and a summary showing the created files and next steps (wallet creation, funding, and deployment commands).

#### Invokes

No skills or agents are invoked. The command runs the template engine directly and performs post-scaffold setup (npm install, husky init).

## Agents

### dev

CLI developer agent that scaffolds new CLIs from the template, adds commands, fixes bugs, and extends library modules for Midnight Compact contracts.

#### When to use

When you need to create a new CLI for a contract, add commands to an existing CLI, fix CLI bugs, modify wallet or contract interaction code, or customize CLI behavior. The agent detects whether a CLI already exists and either scaffolds a new one or works with the existing codebase.
