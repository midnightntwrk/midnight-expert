# Compiler Version Management

The Compact CLI supports multiple compiler versions installed side-by-side. One version is the "default" used when `compact compile` is invoked without a `+VERSION` specifier.

## Installing Compiler Versions

### Update to Latest

```bash
compact update
```

Downloads the latest compiler version and sets it as default. If already installed, no download occurs.

Example output:
```
compact: aarch64-darwin -- 0.31.1 -- already installed
```

> ⚠️ **The newest *published* compiler can outpace live-network support.** `compact update` / `compact check` report the absolute latest (currently `0.34.0`), but **`0.34.0` is not yet supported on any live network**. Pin to the latest **network-supported** version (currently `0.31.1`) for anything you intend to deploy — "latest available" is not the same as "latest supported".

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

→ 0.31.1 - x86_macos, aarch64_macos, x86_linux, aarch64_linux
  0.30.0 - x86_macos, aarch64_macos, x86_linux, aarch64_linux
  0.29.0 - x86_macos, aarch64_macos, x86_linux, aarch64_linux
```

The arrow (`→`) indicates the current default. Each version lists available platform builds.

### Installed Versions (Local)

```bash
compact list --installed
```

Example output:
```
compact: installed versions

→ 0.31.1
  0.30.0
  0.29.0
```

## Checking for Updates

```bash
compact check
```

Queries the remote server and reports whether a newer compiler version is available. Does not download anything.

Example output:
```
compact: aarch64-darwin -- Up to date -- 0.31.1
```

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

```bash
compact clean --cache
```

Removes the GitHub API response cache (`github_cache.json`). The cache has a 15-minute TTL and is used by `list`, `check`, and `update` to avoid redundant API calls. Clear it if you suspect stale results after a new release.

## Common Workflows

### Switch Between Compiler Versions

```bash
# Install both versions
compact update 0.31.1
compact update 0.30.0

# Now 0.30.0 is default (most recently updated)
# Compile with default
compact compile src/contract.compact build/

# Compile with a specific version without changing default
compact compile +0.31.1 src/contract.compact build/

# Switch default back
compact update 0.31.1
```

### Pin a Project to a Specific Version

```bash
# Install into project-local directory
compact --directory ./.compact update 0.29.0

# Set COMPACT_DIRECTORY so all commands use it
export COMPACT_DIRECTORY=./.compact

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
