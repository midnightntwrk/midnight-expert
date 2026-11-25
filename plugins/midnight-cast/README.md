# midnight-cast

Live-network diagnosis for Midnight. The plugin runs the read-only
[midnight-cast](https://github.com/Kanasjnr/midnight-cast) MCP server, so an agent can check
what preview, preprod or mainnet is actually doing instead of guessing: is the network
healthy, what does this error mean, did the transaction land, is the wallet ready, and
what does working code for this look like. It complements the rest of Midnight Expert,
which helps write and verify code, with the live side of debugging.

Nothing it does signs, submits or needs a wallet or keys. Every tool only reads.

## Install

```bash
claude plugin marketplace add midnightntwrk/midnight-expert
claude plugin install --scope user midnight-cast@midnight-expert
```

## MCP server

The plugin starts `npx -y midnight-cast@0.2.0 mcp` (Node.js 20 or later). Every tool
returns the same JSON envelope (`ok`, `data`, a structured `error`, `warnings`, and
`next`, the follow-up steps an expert would take), so an agent can follow a diagnosis
step by step.

| Tool | What it does |
|------|--------------|
| `health` | Full check of a network: RPC and indexer reachability, indexer sync against the node, live versions against the support matrix, and whether Midnight's own examples pass on the node the network runs |
| `ping` | RPC, indexer and proof server reachability |
| `tip` | Node and indexer heights, and whether the indexer is keeping up |
| `versions` | Live versions, and a project's Midnight packages, against the support matrix |
| `preflight` | Whether a network, the proof server and a wallet are ready for a first transaction |
| `decode` | Explains a Midnight error: 1010 rejections, `Custom(N)` ledger codes, pallet errors, JSON-RPC codes and known tooling and Blockfrost messages, with links to working code that fixes it |
| `explain` | Background on `dust`, `1010`, `versions`, `transcript` and `sync` |
| `examples` | Working, CI-tested code from midnightntwrk/midnight-examples for a topic, with file paths, line ranges and pinned links |
| `tx` | A transaction by hash: status, fees, segments, actions and DUST events |
| `contract` | A deployed contract: latest action, circuit, deploy block and balances |
| `block` | A block header, latest or at a height |
| `dust_status` | DUST registration, NIGHT balance and generation for Cardano reward addresses |
| `dust_event`, `dust_events` | DUST ledger events from the indexer |

`decode`, `explain` and `examples` work offline from data bundled with midnight-cast.
Tools that reach a network are rate limited, 30 calls a minute by default.

## Skills

### midnight-cast:midnight-cast

When and how to use midnight-cast: the debug ladder (decode an error first, then
`health`, `versions`, the chain lookups and `preflight`), starting from Midnight's
official examples instead of writing Midnight code from memory, and how to follow each
result's `next` steps.

## Commands

### /midnight-cast:diagnose

```
/midnight-cast:diagnose <network> [transaction-hash or error message]
```

Runs the debug ladder against a network: decodes the error if one is given, checks the
network, compares versions with the project's packages, follows a transaction and its
DUST events, and finishes with what's wrong, the evidence for it and what to do.

## Configuration

Preview needs nothing. Preprod and mainnet are served by Blockfrost and need a free
project ID for each network from [blockfrost.io](https://blockfrost.io): a Midnight
Preprod project for preprod, a Midnight Mainnet one for mainnet. When the plugin is
enabled, Claude Code asks for both as optional, sensitive options and keeps them in
secure storage; change them later with `/plugin`, then midnight-cast, then Configure
options. Left empty, an exported `BLOCKFROST_PREPROD_PROJECT_ID` or
`BLOCKFROST_MAINNET_PROJECT_ID` is used. The IDs are sent only to Blockfrost and are
redacted from every result, so the model never sees them.

`MIDNIGHT_CAST_NETWORKS` (for example `preview,preprod`) limits the networks the agent
may query.

## Evals

`evals/` holds five `claude plugin eval` cases with mocked tools: an old toolkit on the
current runtime, a missing Blockfrost project ID, indexer lag, a DUST validity-window
rejection, and working code for DUST sponsorship. Each checks that the agent calls the
right midnight-cast tool and reaches the right answer.

```bash
claude plugin eval plugins/midnight-cast
```

## Source

midnight-cast is developed at [Kanasjnr/midnight-cast](https://github.com/Kanasjnr/midnight-cast),
where its CLI, standalone binaries and full command reference live. It is also listed in
the MCP Registry as `io.github.Kanasjnr/midnight-cast`, for agents outside Claude Code.
Report midnight-cast bugs there; report problems with this plugin's packaging here.
