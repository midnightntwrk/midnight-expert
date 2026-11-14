---
name: midnight-tooling:devnet
description: Manage a local Midnight devnet — generate compose files, start/stop the network, check status and health, view logs and configuration
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, mcp__octocode-mcp__githubGetFileContent, mcp__octocode-mcp__githubViewRepoStructure
argument-hint: <generate [--directory <path>] [--node-version <X.Y.Z>] [--indexer-version <X.Y.Z>] [--proof-server-version <X.Y.Z>] [--skip-compatibility-matrix] [--no-verify] | update [--file <path>] [--skip-compatibility-matrix] | start [--pull] [--file <path>] | stop [--remove-volumes] [--name <name>] | restart [--pull] [--remove-volumes] [--file <path>] [--name <name>] | status [--name <name>] | health [--name <name>] | logs [--service <name>] [--lines <n>] [--name <name>] | config [--file <path>]>
---

Manage a local Midnight devnet via Docker Compose. Uses helper scripts for version resolution and compose file management.

## Constants

- Default project name: `midnight-devnet`
- Default global directory: `~/.midnight-expert/devnet`
- Template location: `${CLAUDE_SKILL_DIR}/templates/devnet.yml` (relative to the devnet skill)
- Scripts location: `${CLAUDE_SKILL_DIR}/scripts/` (relative to the devnet skill)

## Error Handling

If any command fails, report the error clearly and suggest:

1. Check that Docker Desktop is running and the Docker daemon is accessible (`docker info`).
2. Check that Docker Compose V2 is available (`docker compose version`).
3. See the **troubleshooting** skill for further diagnosis, or run `/midnight-tooling:doctor` for automated diagnostics.

## Step 1: Parse Subcommand from Arguments

Analyze `$ARGUMENTS` to determine the subcommand and any flags:

| Subcommand | Flags |
|---|---|
| `generate` | `--directory <path>`, `--node-version <X.Y.Z>`, `--indexer-version <X.Y.Z>`, `--proof-server-version <X.Y.Z>`, `--skip-compatibility-matrix`, `--no-verify` |
| `update` | `--file <path>`, `--skip-compatibility-matrix` |
| `start` | `--pull`, `--file <path>` |
| `stop` | `--remove-volumes`, `--name <name>` |
| `restart` | `--pull`, `--remove-volumes`, `--file <path>`, `--name <name>` |
| `status` | `--name <name>` |
| `health` | `--name <name>` |
| `logs` | `--service <name>`, `--lines <n>`, `--name <name>` |
| `config` | `--file <path>` |

If no subcommand is provided or the subcommand is not recognized, jump to **Step 10: Usage Summary**.

## Step 2: Generate — Create Compose File from Template

If the subcommand is `generate`:

1. **Resolve versions:**
   - If `--node-version`, `--indexer-version`, and `--proof-server-version` are ALL provided, use those values.
   - If ANY explicit version is missing, run `${CLAUDE_SKILL_DIR}/scripts/resolve-versions.sh` to get the latest devnet-compatible stable versions from Docker Hub. Use the resolved values for any versions not explicitly provided. The resolver caps each image to the ledger 9 line the networks run: `midnight-node` below `2.2.0`, `indexer-standalone` below `4.5.0` and `proof-server` below `9.1.0` (see `references/version-resolution.md`). To run another tag deliberately, pass it explicitly via `--node-version` / `--indexer-version` / `--proof-server-version`.

2. **Verify user-specified versions (if any explicit versions were provided and `--no-verify` is NOT set):**
   - For each user-specified version, check that the Docker Hub tag exists:
     ```bash
     curl -sf "https://hub.docker.com/v2/repositories/midnightntwrk/<image>/tags/<version>/" > /dev/null
     ```
   - If a tag does not exist, warn the user with the specific image and version. Ask whether to continue or abort.

3. **Check compatibility matrix (unless `--skip-compatibility-matrix`):**
   - Try to fetch the support matrix from `midnightntwrk/midnight-docs` using `mcp__octocode-mcp__githubGetFileContent` for `docs/relnotes/support-matrix.mdx`.
   - If octocode MCP is unavailable, inform the user and skip (behave as if `--skip-compatibility-matrix`).
   - If the resolved versions don't match a known-compatible combination, warn the user with details. Ask whether to continue or abort. This is **advisory, not blocking**.

4. **Generate the file:**
   - Determine the destination directory: use `--directory` if provided, otherwise `~/.midnight-expert/devnet`.
   - Run:
     ```bash
     bash "${CLAUDE_SKILL_DIR}/scripts/generate-devnet.sh" \
       --template "${CLAUDE_SKILL_DIR}/templates/devnet.yml" \
       --node-version <resolved> \
       --indexer-version <resolved> \
       --proof-server-version <resolved> \
       --directory <destination>
     ```

5. **Report:** Tell the user the file location, the versions used, and how to start the network.

## Step 3: Update — Refresh Versions in Existing File

If the subcommand is `update`:

1. **Find the compose file:**
   - If `--file` is specified: use that path directly. If it doesn't exist, fail with an error.
   - Otherwise: run `${CLAUDE_SKILL_DIR}/scripts/find-devnet.sh` to locate the file.

2. **Resolve latest stable versions:**
   - Run `${CLAUDE_SKILL_DIR}/scripts/resolve-versions.sh`.

3. **Check compatibility matrix** (same flow as generate step 3, unless `--skip-compatibility-matrix`).

4. **Read and update the file:**
   - Use the Read tool to read the current compose file and note the current image versions for each service.
   - If the file has no `APP__INFRA__SPO_NODE__BLOCKFROST_ID` line, it was generated before the ledger 9 template (midnight-tooling 0.5.0 or earlier). Changing only its `image:` lines would start indexer `4.3.0`+ without the settings it needs, and it exits on startup. Instead, copy the file to `devnet.yml.bak` next to it and regenerate it with `generate-devnet.sh` (same flow as generate step 4) in the same directory, using the new versions. Tell the user the old file was replaced and where the backup is.
   - Otherwise, use the Edit tool to update each `image:` line with the new versions, and update or add the `# Generated:` timestamp comment with the current UTC time.

5. **Report:** Show old version -> new version for each changed service. If no versions changed, say so.

## Step 4: Start — Start the Network

If the subcommand is `start`:

1. **Find the compose file:**
   - If `--file` is specified: use that path directly. If it doesn't exist, fail with an error.
   - Otherwise: run `${CLAUDE_SKILL_DIR}/scripts/find-devnet.sh`.
   - If no file found anywhere: inform the user and run the **generate** flow (Step 2) first, then continue with the generated file.

2. **Handle `--pull`:**
   - If `--pull` is present: run the **update** flow (Step 3) first to resolve and apply latest versions, then run:
     ```bash
     docker compose -f <path> pull
     ```

3. **Check staleness (if no `--pull`):**
   - Run `${CLAUDE_SKILL_DIR}/scripts/check-staleness.sh <path>`.
   - If `stale=true`: inform the user that the compose file is N days old and offer to update. If they accept, run the update flow. If they decline, continue.

4. **Start the network:**
   ```bash
   docker compose -f <path> up -d
   ```

5. **Report status:**
   ```bash
   docker compose -f <path> ps
   ```

## Step 5: Stop — Stop the Network

If the subcommand is `stop`:

- Parse `--name` (default: `midnight-devnet`).
- If `--remove-volumes` is present, use `AskUserQuestion` to confirm:
  > "Removing volumes will permanently delete all chain state, indexer data, and wallet data. Are you sure you want to stop the network and remove all volumes? (yes/no)"
  - If the user declines, stop without `-v`.
- Run:
  ```bash
  docker compose -p <name> down       # without --remove-volumes
  docker compose -p <name> down -v    # with --remove-volumes (after confirmation)
  ```
- Report the result.

## Step 6: Restart — Stop and Start

If the subcommand is `restart`:

- Run the **stop** flow (Step 5) with `--remove-volumes` and `--name` if specified.
- Run the **start** flow (Step 4) with `--pull` and `--file` if specified.

## Step 7: Status — Container State

If the subcommand is `status`:

- Parse `--name` (default: `midnight-devnet`).
- Run:
  ```bash
  docker compose -p <name> ps
  ```
- Display the per-service container state.

## Step 8: Health — Service Responsiveness

If the subcommand is `health`:

- Parse `--name` (default: `midnight-devnet`).
- Curl each service endpoint with timing:

  ```bash
  curl -sf -o /dev/null -w "%{http_code} %{time_total}s" http://localhost:9944/health
  curl -sf -o /dev/null -w "%{http_code} %{time_total}s" http://localhost:8088/api/v4/graphql
  curl -sf -o /dev/null -w "%{http_code} %{time_total}s" http://localhost:6300/health
  ```

- Report per-service: name, pass/fail, HTTP status code, response time.

## Step 9: Logs and Config

**logs**: Parse `--service`, `--lines`, `--name` (default: `midnight-devnet`).
```bash
docker compose -p <name> logs [<service>] [--tail <lines>]
```
Display the returned logs.

**config**: Find the compose file (using `--file` or `find-devnet.sh`). Read it and display:
- File location and age (from `# Generated:` timestamp)
- Image versions for each service
- Endpoint URLs and ports
- Network ID (`undeployed`)

## Step 10: Usage Summary

If no subcommand was provided or the subcommand is not recognized, display:

```
/midnight-tooling:devnet — Manage a local Midnight devnet

Compose file management:
  generate [--directory <path>]           Create a devnet.yml with latest stable versions
    [--node-version <X.Y.Z>]               Specify exact node image version
    [--indexer-version <X.Y.Z>]             Specify exact indexer image version
    [--proof-server-version <X.Y.Z>]        Specify exact proof server image version
    [--skip-compatibility-matrix]            Skip version compatibility check
    [--no-verify]                            Skip Docker Hub tag verification
  update [--file <path>]                  Update image versions in an existing devnet.yml
    [--skip-compatibility-matrix]            Skip version compatibility check

Network lifecycle:
  start [--pull] [--file <path>]          Start the devnet (update + pull latest with --pull)
  stop [--remove-volumes] [--name <name>] Stop the devnet (remove chain data with --remove-volumes)
  restart [--pull] [--remove-volumes]     Restart the devnet
    [--file <path>] [--name <name>]

Observability:
  status [--name <name>]                  Show per-service container state
  health [--name <name>]                  Run health checks with response times
  logs [--service <name>] [--lines <n>]   View service logs
    [--name <name>]
  config [--file <path>]                  Show endpoint URLs, versions, and file info
```
