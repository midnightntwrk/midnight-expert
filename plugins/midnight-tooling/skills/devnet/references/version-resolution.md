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

Some published image tags are not usable for a self-contained local devnet, so the resolver caps each image below a known-bad version rather than blindly taking the newest tag:

| Image | Cap | Why |
|-------|-----|-----|
| `midnight-node` | `< 1.0.0` (stays on the `0.22.x` line) | `1.0.0` is the mainnet GA node; this resolver keeps the shared devnet on the `0.22.x` line (`CFG_PRESET=dev`) for stability, with `0.22.5` as a known-good pin. |
| `indexer-standalone` | `< 4.3.0` | From `4.3.0` the standalone indexer requires a Blockfrost API key and exits with code 1 without one; capping below it keeps the devnet runnable key-less, with `4.2.1` as a known-good pin. |

> Follow-up (not yet reconciled): the `compact-core:compact-init-project` scaffold's bundled
> `compose.yml` runs `midnight-node:1.0.0` (`CFG_PRESET=dev`) and `indexer-standalone:4.3.3` locally —
> the latter supplied a dummy `BLOCKFROST_ID` so it runs key-less. Those newer pins work for a
> self-contained project network but sit above these resolver caps. Revisit whether this resolver
> should raise its caps once `1.0.0` / `4.3.x` are validated for the shared devnet.
| `proof-server` | none | The latest stable proof-server tag is usable for the local devnet. |

These caps live in `resolve-versions.sh` (the `max_exclusive` column of its `IMAGES` table). To run a capped image deliberately, pass it explicitly via `--node-version` / `--indexer-version` (which skips resolution for that image).

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
