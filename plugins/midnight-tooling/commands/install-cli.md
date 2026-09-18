---
name: midnight-tooling:install-cli
description: Install, update, or configure the Compact CLI tool. Supports global installation and per-project configuration with automatic environment setup.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
argument-hint: "[install for this project | update | --directory <path>]"
---

Install or update the Compact CLI tool, with intelligent handling of global vs. project-local installations.

## Terminology Reminder

- **Compact CLI** (`compact`): The management tool installed globally
- **Compact compiler**: The compiler managed by the CLI, stored in the artifact directory
- These are separate. Installing the CLI is separate from downloading a compiler version.

## Step 0: Resolve the Network-Supported Compiler Version

> ⚠️ **"Latest available" is not "latest supported".** A bare `compact update` downloads the newest *published* compiler, which can be ahead of what any live network accepts. Every `compact update` in this command must pass an explicit version. See the compact-cli skill's [version-management reference](../skills/compact-cli/references/version-management.md).

The network-supported version is pinned in one place so it can be bumped without editing this command:

```bash
cat "${CLAUDE_PLUGIN_ROOT}/network-supported-compiler.txt"
```

Store the result (a single semver string, e.g. `0.31.1`) as `NETWORK_COMPILER` and use it in every `compact update` below. Shell variables do not persist between tool calls, so substitute the literal value (e.g. `compact update 0.31.1`) when you run the commands; `"$NETWORK_COMPILER"` in this file is a placeholder for that value.

If `CLAUDE_PLUGIN_ROOT` is not set or the file is not found there, use the `midnight-plugin-utils:find-claude-plugin-root` skill to locate the `midnight-tooling` plugin root and read `network-supported-compiler.txt` from that path. If the file still cannot be read, stop and tell the user: do not fall back to a bare `compact update`.

## Step 1: Parse Intent from Arguments

Analyze `$ARGUMENTS` to determine what the user wants:

**Project-local installation** if arguments contain phrases like:
- "for this project", "project only", "local", "project-local"
- "only for this project", "in this directory"
- An explicit `--directory` path

**Global installation/update** if:
- No arguments provided
- Arguments say "update", "upgrade", "install"
- No mention of "project" or "local"

## Step 2: Check Current State

```bash
which compact 2>&1
compact --version 2>&1
compact compile --version 2>&1
```

Determine whether the CLI is already installed and what versions are present.

## Step 3A: Global Installation (CLI Not Installed)

If `compact` is not found on PATH:

1. Inform the user that the Compact CLI is not installed
2. Install via the official installer:

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

3. After installation, check if PATH needs to be updated. Read the shell profile to see if the installer added the PATH entry:

```bash
grep "compact" ~/.zshrc 2>/dev/null || grep "compact" ~/.bashrc 2>/dev/null
```

4. If the PATH entry is missing, offer to add it:

```bash
echo 'export PATH="$HOME/.compact/bin:$PATH"' >> ~/.zshrc
```

Adjust for the user's shell (check `$SHELL` to determine zsh vs bash).

5. Remind the user to reload their shell or open a new terminal.

6. Download the network-supported compiler (not the latest):

```bash
compact update "$NETWORK_COMPILER"
```

7. Verify:

```bash
compact --version
compact compile --version
```

Then run the check in Step 3D.

## Step 3B: Global Update (CLI Already Installed)

If `compact` is already on PATH:

1. Report current versions:
   - CLI version: `compact --version`
   - Compiler version: `compact compile --version`

2. Check for updates:

```bash
compact self check 2>&1
compact check 2>&1
```

3. Report findings:
   - If CLI update available: offer to run `compact self update`
   - If `compact check` reports a compiler newer than `$NETWORK_COMPILER`: tell the user it is published but **not yet network-supported**, and do not offer to install it. Link the [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix).
   - If the current default compiler (`compact compile --version`) differs from `$NETWORK_COMPILER`: offer to run `compact update "$NETWORK_COMPILER"`
   - If the default compiler already equals `$NETWORK_COMPILER` and no CLI update is available: report that everything is current

4. If updates are applied, verify the new versions, then run the check in Step 3D.

## Step 3C: Project-Local Installation

When the user wants a project-specific toolchain:

1. Determine the target directory:
   - Default: `$PWD/.compact` (the project root)
   - Or use the explicit `--directory` path from arguments, resolved to an absolute path

   Always pass `--directory` an **absolute** path. With a relative path (`./.compact`) the CLI changes into the version directory and then looks for `artifact.zip` by the same relative path again, so extraction fails (`unzip: cannot find or open ./.compact/versions/<ver>/<target>/artifact.zip`). The absolute form works. This is a CLI bug, tracked separately in midnightntwrk/compact.

2. Install the network-supported compiler into the project directory:

```bash
compact --directory "$PWD/.compact" update "$NETWORK_COMPILER"
```

If the CLI is not installed globally, install it first (Step 3A), then proceed with the project-local setup.

3. **Configure environment automatically.** Check which environment tools are present and offer to configure them:

### Check for existing tools

```bash
# Check for direnv
which direnv 2>/dev/null
ls .envrc 2>/dev/null

# Check for mise
which mise 2>/dev/null
ls .mise.toml 2>/dev/null

# Check for dotenv
ls .env 2>/dev/null
ls package.json 2>/dev/null

# Check for Claude settings
ls .claude/settings.json 2>/dev/null
ls .claude/settings.local.json 2>/dev/null
```

### Configure detected tools

For each tool found, offer to add `COMPACT_DIRECTORY` configuration:

**direnv** (if `direnv` is on PATH or `.envrc` exists):

Check if `.envrc` already contains `COMPACT_DIRECTORY`. If not, append:

```bash
export COMPACT_DIRECTORY="${PWD}/.compact"
```

Then run `direnv allow`.

**mise** (if `mise` is on PATH or `.mise.toml` exists):

Check if `.mise.toml` already contains `COMPACT_DIRECTORY`. If not, add:

```toml
[env]
COMPACT_DIRECTORY = "{{config_root}}/.compact"
```

**Claude Code settings** (always offer):

Check if `.claude/settings.json` exists and already has `COMPACT_DIRECTORY` in the `env` field. If not, create or update the file:

```json
{
  "env": {
    "COMPACT_DIRECTORY": "./.compact"
  }
}
```

Use AskUserQuestion if the file already exists and has other settings, to confirm merging. If `.claude/settings.json` does not exist, create the `.claude/` directory and write the file.

4. **Update .gitignore:**

Check if `.gitignore` exists and contains `.compact/`. If not, offer to add it:

```
.compact/
```

Compiler binaries and proving keys should not be committed to version control.

5. **Verify the setup:**

```bash
compact --directory "$PWD/.compact" list --installed
compact --directory "$PWD/.compact" compile --version
```

Then run the check in Step 3D against the project-local compiler.

6. **Report what was configured:**

Summarize all changes made:
- Compiler version installed in `./.compact/`
- Environment files updated (list which ones)
- `.gitignore` updated
- How to use: just run `compact compile` normally (env var handles the directory)

## Step 3D: Confirm the Installed Compiler Is Network-Supported

Run this after any install or update, global or project-local:

```bash
compact compile --version
# project-local:
compact --directory "$PWD/.compact" compile --version
```

Compare the reported compiler version to `$NETWORK_COMPILER`.

- **Match:** report "compiler `<version>` is the current network-supported version".
- **Mismatch:** warn clearly. The installed compiler may not be accepted by Preview, Preprod, or Mainnet, and contracts compiled with it can pass every local check yet fail at deploy. Offer to run `compact update "$NETWORK_COMPILER"` (with `--directory` for project-local installs) and link the [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix).

Do not skip this step because the install "succeeded"; a successful download of the wrong version is exactly the case it exists to catch.

## Step 4: Final Summary

Present a summary of what was done:
- Installation status (new install, updated, or already current)
- CLI version
- Compiler version, and whether it matches the network-supported version from Step 0
- If project-local: directory and configured environment tools
- Any manual steps the user still needs to take (e.g., reload shell)
