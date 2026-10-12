---
name: midnight-cast
description: Diagnose Midnight blockchain problems with the read-only midnight-cast CLI. Decodes Midnight errors (1010 rejections, Custom(N) ledger codes, pallet and JSON-RPC errors, toolkit and Blockfrost messages), checks network health and versions on preview, preprod and mainnet, and looks up transactions, contracts, DUST registration and DUST events. Use when a Midnight error, transaction, contract or network is involved.
license: Apache-2.0
compatibility: Needs Node.js 20 or later and network access; mainnet needs a Blockfrost project ID.
---

# midnight-cast

midnight-cast is a read-only CLI for the Midnight networks (preview, preprod, mainnet, local). It needs no wallet or keys, so its commands are safe to run without asking. Use it instead of guessing when a Midnight error, transaction, contract or network is involved. It needs midnight-cast 0.2.0 or later (`npx -y midnight-cast@latest`).

**Always add `--json`.** Every command then prints one envelope: `ok`, `data`, `error` (`message`, `kind`, `hint`), `warnings` and `next`. Read `error.hint` before deciding what's wrong, and follow `next`: each step is a command an expert would run next. Exit codes are 0 for success, 1 for a failed check or request, and 2 for a usage error.

**Debug ladder**

1. The user has an error message: `midnight-cast decode --raw "<the whole message>" --json`, with `--network <network>` if known. It recognises 1010 rejections, `Custom(N)` ledger codes, pallet errors, JSON-RPC codes and messages from current tooling (old toolkit versions, Blockfrost tokens, Compact builds for ledger 9). Decode before explaining an error; don't rely on memory.
2. The network might be the problem rather than the code: `midnight-cast health <network> --json`, then `ping` or `tip` to narrow it down. Its `data.examples` says whether Midnight's own examples pass on the node that network runs; if they pass and the network is healthy, look at the user's code or setup first.
3. Versions might not match: `midnight-cast versions <network> --project-dir <project> --json` compares the live network and the project's Midnight packages with the support matrix.
4. Something happened on chain: `tx <hash>` for a transaction, `contract <address>` for a deployed contract (latest action, circuit, deploy block), `dust-status <cardano-reward-address>` when a wallet has no DUST, `dust-event <id>` and `dust-events` for DUST ledger events.
5. Setting up, or stuck before the first transaction on preprod or preview: `midnight-cast preflight <network> --address <the wallet's mn_addr_… address> --json` checks the network, the proof server and that the wallet holds NIGHT registered for DUST, and quotes how long a first wallet sync takes so it isn't mistaken for a hang.
6. Writing Midnight code: `midnight-cast examples "<what it should do>" --json` returns the official examples that show it (midnightntwrk/midnight-examples, compiled and tested in CI), with file paths, line ranges, pinned links and the code. Start from those rather than from memory.
7. Background on a topic: `midnight-cast explain dust|1010|versions|transcript|sync` (`sync` for a wallet that seems stuck syncing). `midnight-cast explain --json` lists every command, option, exit code and error kind.

Preprod and mainnet go through Blockfrost, with a project ID per network: set `BLOCKFROST_PREPROD_PROJECT_ID` to a Midnight Preprod project ID and `BLOCKFROST_MAINNET_PROJECT_ID` to a Midnight Mainnet one. Preview needs none. midnight-cast never prints them.

**In this plugin.** The plugin runs the midnight-cast MCP server, so call its tools instead of the shell. Each command above is a tool of the same name, with `dust_event`, `dust_events` and `dust_status` for the hyphenated ones; they take the same arguments and return the same envelope. For preprod and mainnet the user enters a Blockfrost project ID for each in the plugin's options (`/plugin`, then midnight-cast, then Configure options), or exports `BLOCKFROST_PREPROD_PROJECT_ID` or `BLOCKFROST_MAINNET_PROJECT_ID` before starting Claude Code.
