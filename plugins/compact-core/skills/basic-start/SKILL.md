---
name: compact-core:basic-start
description: This skill should be used when the user asks to "build my first Midnight DApp", "getting started from scratch", "verify my environment", "basic DApp tutorial", "test my Midnight setup", "hello world walkthrough", "new to Midnight", "first contract", "walk me through building a contract", or wants a step-by-step guide to creating and deploying a simple Compact smart contract on a local devnet.
version: 0.1.0
---

> **EPHEMERAL — Everything produced by this skill is disposable.** This walkthrough generates code solely to verify your environment works and to build familiarity with Midnight development. Do not commit, push, or retain any generated code. Delete the working directory when done.

# Basic Start: Your First Midnight DApp

A step-by-step procedural guide that takes you from zero to a working Midnight DApp on a local devnet. Each step builds on the previous one, verifying your environment works correctly along the way.

## Prerequisites

Before starting, ensure:
- **Docker** is running (`docker info` should succeed)
- **Node.js 22+** is installed (`node --version`)
- **Compact CLI** is installed (`compact --version`) — if not, use `/midnight-tooling:install-cli`

Run `/midnight-tooling:doctor` to check all prerequisites at once.

## Working Directory

Create a temporary directory for this walkthrough. All generated files go here.

```bash
mkdir -p /tmp/midnight-basic-start && cd /tmp/midnight-basic-start
```

## Steps

Work through each step in order. Each step's reference file contains the full procedure.

| Step | Title | What It Verifies | Reference |
|------|-------|-----------------|-----------|
| 1 | Devnet Setup | Docker, node, indexer, proof server all running | `references/step-1-devnet-setup.md` |
| 2 | Compact CLI | Compiler and CLI installed and up to date | `references/step-2-compact-cli.md` |
| 3 | Wallet Setup | Wallet creation, NIGHT airdrop, DUST registration | `references/step-3-wallet-setup.md` |
| 4 | Hello World Contract | Write, compile, deploy, and call a smart contract | `references/step-4-hello-world-contract.md` |
| 5 | Token Transfer | Programmatic NIGHT transfer between wallets | `references/step-5-token-transfer.md` |
| 6 | Ticket Contract | Privacy-preserving contract with commitments and nullifiers | `references/step-6-ticket-contract.md` |

## When something errors

**Your first stop for any error code or message is `/midnight-status-codes:lookup`.**
It decodes node rejections (e.g. `1010: Custom error: 117`), SDK/Effect errors,
Compact compiler diagnostics, proof-server and indexer errors, and more — telling
you what produced the error and how to fix it.

```
/midnight-status-codes:lookup 117      # a numeric node/ledger code
/midnight-status-codes:lookup NotNormalized   # an error name
```

Common early ones on a fresh devnet: **117** (NotNormalized — set a small
`additionalFeeOverhead`, see step 4/5) and **1010** (the Substrate envelope that
wraps the real `Custom(N)` cause). For environment problems, run
`/midnight-tooling:doctor`.

## When You're Done

Delete the temporary working directory:

```bash
rm -rf /tmp/midnight-basic-start
```

Stop the devnet if you no longer need it:

```
/midnight-tooling:devnet stop --remove-volumes
```
