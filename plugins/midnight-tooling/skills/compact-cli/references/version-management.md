# Compiler Version Management

> **Last verified:** 2026-11-12 against `compact` CLI 0.5.1 / compiler 0.36.0 (latest available 0.36.1); command output below last run 2026-09-17 against 0.31.1, versions updated — `update`/`list`/`check`/`clean` behaviour verified against the installed toolchain.

The Compact CLI supports multiple compiler versions installed side-by-side. One version is the "default" used when `compact compile` is invoked without a `+VERSION` specifier.

## Installing Compiler Versions

### Update to Latest

```bash
compact update
```

Downloads the latest compiler version and sets it as default. If already installed, no download occurs.

Example output (the newest published compiler is 0.36.1):
```
compact: x86_64-apple-darwin -- 0.36.1 -- installed
compact: x86_64-apple-darwin -- 0.36.1 -- default.
```

Running it again when that version is already installed skips the download and prints only the `default.` line.

> ⚠️ **The newest *published* compiler can outpace live-network support.** `compact update` / `compact check` report the absolute latest (currently `0.36.1`), which can be ahead of what the networks accept. Pin to the **network-supported** version (currently `0.36.0`, on Mainnet, Preview and Preprod since ledger 9) for anything you intend to deploy — "latest available" is not the same as "latest supported". A later patch of the pinned version (`0.36.1` here) keeps the same language and runtime versions, so it's fine to use; a new minor version isn't until the matrix lists it.

### Where the network-supported version is pinned

The operational pin is `plugins/midnight-tooling/network-supported-compiler.txt` (a single semver line). `install-cli` and the CI example-compile workflows read it, so bumping the supported version is a one-line change there. Source of truth for what the networks accept is the [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix); update the pin when the matrix moves. Prose mentions of the version in this skill (like the note above) are documentation and should be refreshed at the same time.

### Install a Specific Version

The `update` command accepts three version formats:

| Format | Example | Matches |
|--------|---------|---------|
| Full semver | `compact update 0.29.0` | Exact version |
| Major.minor | `compact update 0.29` | Latest patch of 0.29.x |
| Major only | `compact update 0` | Latest minor.patch of 0.x.x |

By default, `update` sets the newly installed version as the default.

### Install Without Setting Default

```bash
compact update 0.29.0 --no-set-default
```

Downloads the version but keeps the current default. Useful for installing a version to test with `compact compile +0.29.0` without disrupting your main workflow.

## Listing Versions

### Available Versions (Remote)

```bash
compact list
```

Example output:
```
compact: available versions

  0.36.1 - x86_macos, aarch64_macos, x86_linux, aarch64_linux
→ 0.36.0 - x86_macos, aarch64_macos, x86_linux, aarch64_linux
  0.35.0 - x86_macos, aarch64_macos, x86_linux, aarch64_linux
  0.34.0 - x86_macos, aarch64_macos, x86_linux, aarch64_linux
```

The arrow (`→`) indicates the current default. Each version lists available platform builds.

### Installed Versions (Local)

```bash
compact list --installed
```

Example output:
```
compact: installed versions

  0.36.1
→ 0.36.0
```

## Checking for Updates

```bash
compact check
```

Queries the remote server and reports whether a newer compiler version is available. Does not download anything.

Example output, on the pinned 0.36.0 with 0.36.1 published:
```
compact: x86_64-apple-darwin -- Update Available -- 0.36.0
compact: Latest version available: 0.36.1.
```

On the newest version it prints `compact: x86_64-apple-darwin -- Up to date -- 0.36.1`.

## Cleaning Up

### Remove All Versions

```bash
compact clean
```

Removes all installed compiler versions. After this, `compact compile` will fail until a version is reinstalled.

### Keep Current Default

```bash
compact clean --keep-current
```

Removes all versions except the current default.

### Clear the API Cache

> ⚠️ `compact clean` **removes all installed compiler versions**; `--cache` only *adds* the cache directory to what is deleted. To clear the cache without wiping your compilers, keep the current one:

```bash
compact clean --keep-current --cache
```

`--cache` removes the cached API responses (the cache directory under `$HOME/.compact`). The cache has a 15-minute TTL and is used by `list`, `check`, and `update` to avoid redundant API calls. Clear it if you suspect stale results after a new release. Plain `compact clean --cache` (without `--keep-current`) deletes every installed version as well, so you would then need to `compact update` to reinstall.

## Common Workflows

### Switch Between Compiler Versions

```bash
# Install both versions
compact update 0.36.0
compact update 0.30.0

# Now 0.30.0 is default (most recently updated)
# Compile with default
compact compile src/contract.compact build/

# Compile with a specific version without changing default
compact compile +0.36.0 src/contract.compact build/

# Switch default back
compact update 0.36.0
```

### Pin a Project to a Specific Version

```bash
# Install into project-local directory (use an absolute path: with a
# relative --directory the CLI fails to extract the downloaded artifact)
compact --directory "$PWD/.compact" update 0.29.0

# Set COMPACT_DIRECTORY so all commands use it
export COMPACT_DIRECTORY="$PWD/.compact"

# Now compile uses the project-local version
compact compile src/contract.compact build/
```

### Audit and Clean Up

```bash
compact list --installed     # See what's installed
compact clean --keep-current # Remove old versions
compact list --installed     # Verify
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Couldn't find version X` | Requested version doesn't exist remotely | Run `compact list` to see available versions |
| `compact list` shows stale results | 15-minute API cache | Run `compact clean --cache` then `compact list` |
| `compact update` hangs or times out | Network/proxy issue or GitHub API down | Check connectivity to github.com; try setting `GITHUB_TOKEN` |
| `compact list` shows versions but `compact update X` fails | Platform not available for that version | Check the platform list in `compact list` output |
| Version installed but not used | Default not changed | Run `compact update <VERSION>` to set default, or use `+VERSION` |
