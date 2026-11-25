---
name: midnight-cast:diagnose
description: Diagnose a Midnight network or a failed transaction with the read-only midnight-cast tools
argument-hint: "<network> [transaction-hash or error message]"
---

Diagnose a Midnight problem. The network, and any transaction hash or error message, are in: $ARGUMENTS

If no network is named, ask which one: preview, preprod, mainnet or local.

Use this plugin's midnight-cast MCP tools, following the midnight-cast skill's debug ladder:

1. If an error message was given, decode it first with `decode` (pass the whole message and the network).
2. Check the network with `health`. If anything fails, narrow it down with `ping` or `tip`.
3. Compare versions with `versions`, passing the project directory so the project's Midnight packages are checked too.
4. If a transaction hash was given, look it up with `tx`, and follow its DUST events with `dust_event`.

Follow each result's `next` steps; when a step has a tool call, make exactly that call. Finish with what's wrong, the evidence for it from the tool output, and what to do about it. If the network is healthy and the error decodes to a problem in the user's code or setup, say so plainly.
