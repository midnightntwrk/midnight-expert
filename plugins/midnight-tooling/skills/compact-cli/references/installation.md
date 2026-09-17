# Installing the Compact CLI

> **Last verified:** 2026-09-17 against `compact` CLI 0.5.1 — version-output examples confirmed against the installed toolchain (PATH/install-location claims not re-tested).

## Prerequisites

- A Unix-like environment (macOS, Linux, WSL)
- `curl` available on the system
- A shell that supports PATH configuration (zsh, bash)

No Node.js, Docker, or other tools are required to install the Compact CLI itself.

## Install via the Installer Script

Run the official installer to download pre-built binaries:

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

The installer downloads the `compact` binary and places it in a local bin directory (typically `~/.local/bin/` or `~/.compact/bin/`). It also attempts to update the shell profile to add this directory to PATH.

## PATH Configuration

The installer script automatically modifies the shell profile (`~/.zshrc`, `~/.bashrc`, etc.) to add the Compact binary directory to PATH. However, the running shell session does not pick up these changes automatically.

### Reload the Shell

After installation, reload the shell configuration:

```bash
# For zsh (default on macOS)
source ~/.zshrc

# For bash
source ~/.bashrc
```

Alternatively, open a new terminal window.

### Manual PATH Configuration

If `compact` is still not found after reloading, add the binary directory to PATH manually. Check the installer output for the exact path, then add to the shell profile:

```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$HOME/.compact/bin:$PATH"
```

Then reload the shell configuration.

### Verify PATH

Confirm the binary is accessible:

```bash
which compact
# Expected output: /Users/<username>/.local/bin/compact
# or: /Users/<username>/.compact/bin/compact
```

## First-Time Setup: Download a Compiler

The CLI tool alone cannot compile contracts. After installing the CLI, download a compiler version:

```bash
compact update
```

This downloads the latest compiler version and sets it as the default.

## What Gets Installed

The installer places the `compact` binary in `~/.local/bin/` or `~/.compact/bin/`. When a compiler is downloaded via `compact update`, it creates:

```
~/.compact/
├── bin/                    # Symlinks to the default compiler version
│   ├── compactc            # Shell wrapper → compactc.bin
│   ├── format-compact      # Formatter binary
│   └── fixup-compact       # Fixup binary
└── versions/
    └── 0.31.1/
        └── aarch64-darwin/
            ├── compactc        # Shell wrapper
            ├── compactc.bin    # Actual compiler binary
            ├── format-compact
            ├── fixup-compact
            ├── zkir
            ├── zkir-v3
            ├── artifact.zip
            └── toolchain-0.31.1.md  # Release notes
```

The `bin/` directory symlinks point to the current default version. Changing the default with `compact update <VERSION>` updates these symlinks.

## Verification

Run these commands to confirm everything is working:

```bash
# Check CLI tool version
compact --version
# Example output: compact 0.5.1

# Check compiler version
compact compile --version
# Example output: 0.31.1

# Check installation path
which compact
# Example output: /Users/<username>/.local/bin/compact

# List installed compiler versions
compact list --installed
# Example output:
# compact: installed versions
# → 0.31.1
```

The arrow (`→`) next to a version indicates it is the current default.

## Uninstalling

The Compact CLI does not provide an uninstall command. To remove it:

1. Delete the binary: `rm $(which compact)`
2. Delete the artifact directory: `rm -rf $HOME/.compact`
3. Remove the PATH entry from the shell profile (`~/.zshrc` or `~/.bashrc`)
4. Reload the shell: `source ~/.zshrc`

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `compact: command not found` | CLI not on PATH | Add `$HOME/.compact/bin` (or `$HOME/.local/bin`) to PATH, reload shell |
| `compact: command not found` after install | Shell session not reloaded | Run `source ~/.zshrc` (or `~/.bashrc`), or open a new terminal |
| `No default compiler set` after install | CLI installed but no compiler downloaded | Run `compact update` to download a compiler |
| `which compact` shows wrong path | Multiple installations | Check for duplicates in PATH, remove the unwanted one |
