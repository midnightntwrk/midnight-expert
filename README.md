<p align="center">
  <img src="assets/banner.png" alt="midnight expert" width="100%" />
</p>

**midnight-expert** is a marketplace of [Claude Code plugins](https://docs.anthropic.com/en/docs/claude-code/plugins) for developers building on the [Midnight Network](https://midnight.network/). The plugins help you write and review Compact smart contracts, scaffold and wire up DApp frontends, mechanically verify claims about your code and the SDK, manage the local toolchain and devnet, and look up whichever error code just spoiled your afternoon — all from inside Claude Code, without leaving your editor or stitching together half a dozen browser tabs.

This project extends the Midnight Network with additional developer tooling.

**[midnightntwrk.expert](https://midnightntwrk.expert/)** — documentation, guides, and resources for Midnight developers.

## At a glance

- **13** Plugins
- **87** Skills / Slash commands
- **17** Agents
- **~37,700** Lines of reference documentation
- **~21,800** Lines of example code

## Prerequisites

Some plugins in this marketplace (`compact-core`, `midnight-verify`) reference skills and agents from the **`devs`** plugin, which lives in a separate marketplace — [`aaronbassett/agent-foundry`](https://github.com/aaronbassett/agent-foundry). Install it before or alongside the midnight-expert plugins to avoid broken cross-references:

```bash
claude plugin marketplace add aaronbassett/agent-foundry
claude plugin install devs@agent-foundry
```

> [!NOTE]
> The Claude Code plugin schema does not currently have a `dependencies` field, so cross-marketplace dependencies cannot be declared in `plugin.json`. The `midnight-expert:doctor` command will flag missing `devs` references and show you the fix commands if this step is skipped.

## Install

> [!IMPORTANT]
> **Platform support: macOS and Linux.** Midnight Expert is developed and tested on macOS and Linux only. Native Windows (PowerShell, CMD, Git Bash/MSYS2, Cygwin) is **untested and unsupported** — the plugins' hooks and shell scripts assume a POSIX environment and are known to misbehave there (for example, a bare `compact` resolving to the unrelated Windows `compact.exe`, and path/encoding handling breaking under Git Bash).
>
> **Windows users should run everything inside [WSL](https://learn.microsoft.com/windows/wsl/) (WSL2 recommended).** Install a Linux distribution, then install Node.js, the Compact toolchain, Claude Code, and Midnight Expert *inside* the WSL environment — not on the Windows host. Under WSL the plugins behave exactly as they do on native Linux.

### Automatic install for Claude Code

Run this in your terminal and follow the prompts:

```bash
curl -fsSL midnightntwrk.expert/install.sh | bash
```

The installer detects your Claude Code setup, registers the marketplace, and walks you through picking which plugins to enable.

### Install from within Claude Code

You can ask Claude itself to handle the install for you. From any session:

> Please fetch <https://midnightntwrk.expert> and follow the instructions for installing Midnight Expert.

Or do it manually with the built-in plugin manager:

1. Run `/plugin` to open the plugin manager.
2. Choose **Add marketplace** and paste `https://midnightntwrk.expert`.
3. Use **Browse plugins** to pick which plugins from the marketplace you want enabled.

### Install using the Claude CLI

If you prefer working from a terminal, register the marketplace and then install plugins individually:

```bash
claude plugin marketplace add https://midnightntwrk.expert
```

Install the meta-plugin first and run its diagnostics to confirm your environment is ready:

```bash
claude plugin install --scope user midnight-expert@midnight-expert
```

```
/midnight-expert:doctor
```

> [!NOTE]
> Slash commands (like `/midnight-expert:doctor`) from a plugin installed mid-session only register after you **restart Claude Code**. Skills and agents activate right away, but the slash-command list is read at startup — if a command isn't found immediately after installing, restart and try again.

> [!IMPORTANT]
> Use `--scope user` to install the plugin **globally for your user** (available in every project), `--scope project` to install only for the current project, or `--scope local` for an unmanaged local install.

> [!TIP]
> Updates are published to [`midnightntwrk.expert`](https://midnightntwrk.expert/) **3–5 days after they're merged into the GitHub repository**. The delay gives the community time for public testing and feedback. If you'd rather live on the bleeding edge, use the GitHub repo directly as your marketplace address — substitute `devrelaicom/midnight-expert` for `https://midnightntwrk.expert/` anywhere it appears in the manual install instructions above.

## Plugins

You can install any plugin from inside Claude Code with `/plugin`, or from the terminal with `claude plugin install --scope user <plugin>@midnight-expert`.

### Smart Contract Development

<table>
  <thead>
    <tr><th width="60"></th><th>Plugin</th><th>Description</th></tr>
  </thead>
  <tbody>
  <tr>
    <td><img src="plugins/compact-core/assets/mascot.png" /></td>
    <td><strong><a href="plugins/compact-core/">compact-core</a></strong></td>
    <td>Core knowledge for writing Compact — contract structure, data types, ledger declarations, circuits, witnesses, privacy/disclosure rules, tokens, circuit costs, debugging, and code review.<pre lang="bash">claude plugin install --scope user compact-core@midnight-expert</pre></td>
  </tr>
  <tr>
    <td><img src="plugins/compact-examples/assets/mascot.png" /></td>
    <td><strong><a href="plugins/compact-examples/">compact-examples</a></strong></td>
    <td>Compilable Compact examples — beginner contracts, reusable modules, token implementations, and full applications with witnesses and tests, all at <code>pragma language_version >= 0.22</code>.<pre lang="bash">claude plugin install --scope user compact-examples@midnight-expert</pre></td>
  </tr>
  <tr>
    <td><img src="plugins/compact-cli-dev/assets/mascot.png" /></td>
    <td><strong><a href="plugins/compact-cli-dev/">compact-cli-dev</a></strong></td>
    <td>Scaffold and develop Oclif CLIs for Compact contracts — wallet management, contract deployment, devnet control, plus an agent for ongoing CLI work.<pre lang="bash">claude plugin install --scope user compact-cli-dev@midnight-expert</pre></td>
  </tr>
  </tbody>
</table>
### DApp Development

<table>
  <thead>
    <tr><th width="60"></th><th>Plugin</th><th>Description</th></tr>
  </thead>
  <tbody>
  <tr>
    <td><img src="plugins/midnight-dapp-dev/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-dapp-dev/">midnight-dapp-dev</a></strong></td>
    <td>Scaffold and build Midnight DApp frontends — Vite + React 19 + shadcn + Tailwind v4 templates, wallet integration, provider architecture, and a development agent for ongoing UI work.<pre lang="bash">claude plugin install --scope user midnight-dapp-dev@midnight-expert</pre></td>
  </tr>
  </tbody>
</table>
### Testing & Code Quality

<table>
  <thead>
    <tr><th width="60"></th><th>Plugin</th><th>Description</th></tr>
  </thead>
  <tbody>
  <tr>
    <td><img src="plugins/midnight-cq/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-cq/">midnight-cq</a></strong></td>
    <td>Code quality tooling for Midnight projects — linting, formatting, type checking, contract/DApp/ledger/wallet testing, Git hooks, and CI workflows.<pre lang="bash">claude plugin install --scope user midnight-cq@midnight-expert</pre></td>
  </tr>
  <tr>
    <td><img src="plugins/midnight-verify/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-verify/">midnight-verify</a></strong></td>
    <td>Verification framework for Midnight claims — compile + execute Compact, type-check SDK code, run ZKIR through the WASM checker, cross-check witness implementations, and inspect compiler/ledger/wallet source. Multi-agent pipeline behind <code>/verify</code>.<pre lang="bash">claude plugin install --scope user midnight-verify@midnight-expert</pre></td>
  </tr>
  <tr>
    <td><img src="plugins/midnight-fact-check/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-fact-check/">midnight-fact-check</a></strong></td>
    <td>Fact-checking pipeline for Midnight content — extracts testable claims from markdown, code, PDFs, URLs or GitHub repos, classifies them by domain, verifies each via <code>midnight-verify</code>, and produces structured reports.<pre lang="bash">claude plugin install --scope user midnight-fact-check@midnight-expert</pre></td>
  </tr>
  </tbody>
</table>
### Toolchain & Infrastructure

<table>
  <thead>
    <tr><th width="60"></th><th>Plugin</th><th>Description</th></tr>
  </thead>
  <tbody>
  <tr>
    <td><img src="plugins/midnight-tooling/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-tooling/">midnight-tooling</a></strong></td>
    <td>Install, configure, and manage the Compact CLI, the local devnet (node, indexer, proof server), compiler version switching, diagnostics, and ecosystem release notes.<pre lang="bash">claude plugin install --scope user midnight-tooling@midnight-expert</pre></td>
  </tr>
  <tr>
    <td><img src="plugins/midnight-wallet/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-wallet/">midnight-wallet</a></strong></td>
    <td>Wallet SDK reference, test-wallet management patterns, and SDK regression checking for Midnight Network development.<pre lang="bash">claude plugin install --scope user midnight-wallet@midnight-expert</pre></td>
  </tr>
  <tr>
    <td><img src="plugins/midnight-status-codes/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-status-codes/">midnight-status-codes</a></strong></td>
    <td>Catalog and lookup for every Midnight error code, status code, and tagged error across the node, ledger, indexer, wallet, SDK, compiler, proof server, and DApp connector.<pre lang="bash">claude plugin install --scope user midnight-status-codes@midnight-expert</pre></td>
  </tr>
  </tbody>
</table>
### Knowledge & Education

<table>
  <thead>
    <tr><th width="60"></th><th>Plugin</th><th>Description</th></tr>
  </thead>
  <tbody>
  <tr>
    <td><img src="plugins/core-concepts/assets/mascot.png" /></td>
    <td><strong><a href="plugins/core-concepts/">core-concepts</a></strong></td>
    <td>Conceptual foundations for the Midnight Network — architecture, data models, privacy patterns, protocols (Kachina, Zswap), tokenomics, and zero-knowledge proofs.<pre lang="bash">claude plugin install --scope user core-concepts@midnight-expert</pre></td>
  </tr>
  </tbody>
</table>
### Meta

<table>
  <thead>
    <tr><th width="60"></th><th>Plugin</th><th>Description</th></tr>
  </thead>
  <tbody>
  <tr>
    <td><img src="plugins/midnight-expert/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-expert/">midnight-expert</a></strong></td>
    <td>Ecosystem diagnostics — health-checks plugin installation, MCP server connectivity, external CLI tools, cross-plugin references, and NPM registry access in one report.<pre lang="bash">claude plugin install --scope user midnight-expert@midnight-expert</pre></td>
  </tr>
  <tr>
    <td><img src="plugins/midnight-plugin-utils/assets/mascot.png" /></td>
    <td><strong><a href="plugins/midnight-plugin-utils/">midnight-plugin-utils</a></strong></td>
    <td>Audits and resolves Claude plugin dependencies — validates installed plugins against <code>extends-plugin.json</code> declarations and resolves install paths with fuzzy matching.<pre lang="bash">claude plugin install --scope user midnight-plugin-utils@midnight-expert</pre></td>
  </tr>
  </tbody>
</table>
## Example Prompts

Most of the time you don't need to remember a slash command — once a plugin is installed, its skills activate based on what you're asking for. A few starting points:

- "Is my local Midnight proof server healthy, and is the indexer caught up to the node?"
- "Review `contracts/Report.compact` for potential privacy leaks before I push."
- "Why is my proof generation failing with status code `0x4b`?"
- "Scaffold a Vite + React DApp wired to my counter contract and connect it to the Lace wallet."
- "Fact-check this Midnight blog post against the current SDK and tell me what's drifted."
- "Set up `alice`, `bob`, and `charlie` as funded test wallets on the local devnet, with DUST registered for each."
- "Compile `MyToken.compact`, simulate a mint + transfer + burn, and show me the resulting ledger state."
- "Write a Compact contract for a sealed-bid voting system and walk me through the disclosure rules."
- "I'm getting `Implicit disclosure of witness value` — what does that mean and how do I fix it?"

Slash commands are also available when you want to invoke a specific workflow directly:

```
/midnight-verify:verify "Compact tuples are 0-indexed"
/midnight-tooling:devnet start
/midnight-status-codes:lookup 0x4b
/midnight-fact-check:check path/to/article.md
/midnight-expert:doctor
```

## License

[MIT](LICENSE) — Copyright (c) 2026 Aaron Bassett
