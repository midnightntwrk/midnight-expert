# Version Resolution

This reference documents how the devnet skill resolves Docker image versions and checks compatibility between components.

## Docker Hub Tags API

The `resolve-versions.sh` script queries the Docker Hub v2 API to find the latest stable versions of the three devnet images:

| Image | Docker Hub Repository |
|-------|----------------------|
| Node | `midnightntwrk/midnight-node` |
| Indexer | `midnightntwrk/indexer-standalone` |
| Proof Server | `midnightntwrk/proof-server` |

### API Endpoint

```
GET https://hub.docker.com/v2/repositories/{namespace}/{repo}/tags/?page_size=100&ordering=last_updated
```

The response is paginated (max 100 results per page). The script follows the `next` URL to fetch all pages.

### Stable Version Filtering

From all tags, the script selects only those matching the strict `X.Y.Z` semver pattern (three numeric segments separated by dots). This excludes:

- Release candidates: `7.0.0-rc1`, `3.1.0-rc.2`
- Pre-release: `7.0.0-alpha`, `7.0.0-beta.1`
- Architecture-specific: `7.0.0-amd64`, `7.0.0-arm64`
- Latest/other: `latest`, `nightly`, `dev`

The highest version (by numeric semver comparison) is selected for each image, subject to per-image upper bounds (below).

### Per-Image Upper Bounds

The resolver caps each image to the ledger 9 line that Mainnet, Preview and Preprod run, so a new minor or major tag on Docker Hub can't silently move the devnet onto a ledger the compiler pin and midnight-js don't match. Patch releases still come through:

| Image | Cap | Resolves to today |
|-------|-----|-------------------|
| `midnight-node` | `< 2.2.0` | `2.1.101` |
| `indexer-standalone` | `< 4.5.0` | `4.4.101` |
| `proof-server` | `< 9.1.0` | `9.0.1` |

The indexer needs a Blockfrost id since `4.3.0`; the generated compose file passes a placeholder plus the node's own URL for SPO data, so the devnet still runs key-less. Move a cap only together with the compiler pin (`plugins/midnight-tooling/network-supported-compiler.txt`), after checking the new set against midnightntwrk/midnight-examples, which runs the same images in CI.

These caps live in `resolve-versions.sh` (the `max_exclusive` column of its `IMAGES` table). To run another image deliberately, pass it explicitly via `--node-version` / `--indexer-version` / `--proof-server-version` (which skips resolution for that image).

### Verifying User-Specified Versions

When the user provides explicit versions via `--node-version`, `--indexer-version`, or `--proof-server-version`, the command checks that each specified tag actually exists on Docker Hub before generating the compose file.

To verify a tag exists:

```bash
curl -sf "https://hub.docker.com/v2/repositories/midnightntwrk/midnight-node/tags/0.21.0/" > /dev/null
```

A 200 response means the tag exists. A 404 means it does not. If a tag is not found, warn the user with the exact tag and image name. The `--no-verify` flag skips this check.

## Compatibility Matrix

The Midnight documentation repository (`midnightntwrk/midnight-docs`) publishes a support matrix that documents which versions of node, indexer, and proof server are tested together.

### Where to Find It

The compatibility information is in:
- `docs/relnotes/support-matrix.mdx` — the primary compatibility matrix
- `docs/relnotes/overview.mdx` — component version overview

These files are fetched via the octocode MCP tool (`githubGetFileContent` from `midnightntwrk/midnight-docs`).

### How to Interpret

The matrix shows which component versions have been tested together. When the resolved (or user-specified) versions don't match a known-compatible combination:

1. **Warn the user** with the specific version mismatch details
2. **Show what the matrix recommends** for the versions that do match
3. **Ask the user** whether to proceed or abort
4. **This is advisory, not blocking** — the user can always choose to continue

The compatibility matrix may lag behind Docker Hub releases. A version combination not in the matrix doesn't necessarily mean it's incompatible — it may simply be untested. Treat mismatches as "worth knowing about" not "must fix."

### Graceful Degradation

If the octocode MCP server is not available (user hasn't installed it), the command:

1. Skips the compatibility check entirely
2. Informs the user: "Compatibility matrix check skipped — octocode MCP server not available. Use `--skip-compatibility-matrix` to suppress this message."
3. Proceeds with version resolution and generation normally

The `--skip-compatibility-matrix` flag explicitly skips the check even when octocode is available.

## Script Location

The version resolution script is at `${CLAUDE_SKILL_DIR}/scripts/resolve-versions.sh`. The command invokes it via Bash and parses its `key=value` output.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `Failed to fetch tags` | Docker Hub unreachable or rate-limited | Check internet connection; retry after a few minutes |
| `No stable version found` | All tags are pre-release or non-semver | Check Docker Hub manually; use explicit `--node-version` etc. |
| Script returns stale versions | Docker Hub pagination issue | Script already handles pagination; if persistent, check API manually |
| Compatibility check fails silently | octocode MCP not installed | Install octocode MCP server or use `--skip-compatibility-matrix` |
