# Network Lifecycle

This reference covers generating, starting, stopping, and monitoring the Midnight local development network (devnet). All operations use Docker Compose via bash commands.

## Compose File Lifecycle

### Generate (First Time)

The `generate` subcommand creates a `devnet.yml` from the plugin's template:

1. Resolves latest stable image versions from Docker Hub (or uses user-specified versions)
2. Optionally checks the compatibility matrix for version mismatches (advisory)
3. Runs the generator script to substitute versions into the template
4. Writes `devnet.yml` to the target directory (default: `~/.midnight-expert/devnet/`)

If `/midnight-tooling:devnet start` is run and no compose file exists, the generate flow runs automatically.

### Update (Existing File)

The `update` subcommand refreshes image versions in an existing `devnet.yml`:

1. Locates the existing file (project-local or global)
2. Resolves latest stable versions from Docker Hub
3. Optionally checks the compatibility matrix
4. Edits the image tags directly in the file (preserving all other content), or, for a generated file that predates the ledger 9 template, regenerates it with a timestamped backup (see below)
5. Refreshes the `# Generated:` timestamp

On a file that's already on the ledger 9 template, update only modifies the three `image:` lines for Midnight services, and versions you pinned above the caps stay as they are. A generated file from before that template (no SPO/Blockfrost settings, block-1 healthcheck or indexer restart policy) is regenerated instead, because the 4.4 indexer exits without those settings; the old file is kept as `<file>.<timestamp>.bak`, and you should `stop --remove-volumes` before starting, since the old chain data doesn't fit the new images. A hand-written file missing those settings is left alone, and update tells you what's missing.

### Staleness Checking

Generated compose files include a `# Generated: <timestamp>` header comment. The `check-staleness.sh` script parses this and reports the file's age.

When `/midnight-tooling:devnet start` runs (without `--pull`), it checks staleness:
- **Under 5 days**: Proceeds normally
- **5 days or older**: Pauses, informs the user of the file's age, and offers to run an update
- **No timestamp found**: Notes this and proceeds (user-created files won't have the header)

## Starting the Network

`/midnight-tooling:devnet start [--pull] [--file <path>]`

1. Locates `devnet.yml` via the finder script (or `--file`). If not found, runs the generate flow.
2. If `--pull`: runs the update flow first (resolves latest versions, edits the file), then runs `docker compose pull` to fetch the new images.
3. If no `--pull`: checks staleness and offers to update if the file is stale.
4. Runs `docker compose -f <path> up -d`.
5. Reports container status.

### What "Ready" Means

The network is fully ready when:
- The node is accepting RPC connections on port 9944 (healthcheck passing)
- The indexer is responding to GraphQL queries on port 8088 (healthcheck passing)
- The proof server health endpoint returns OK on port 6300

Use `/midnight-tooling:devnet health` to verify all of these conditions.

## Stopping the Network

`/midnight-tooling:devnet stop [--remove-volumes] [--name <project-name>]`

1. If `--remove-volumes`: confirms with the user (destructive operation).
2. Runs `docker compose -p <name> down` (adds `-v` if removing volumes).

By default, Docker volumes are preserved. Chain state, indexer data, and other persistent data survive a stop/start cycle.

Default project name: `midnight-devnet`.

### Removing Volumes (Clean Slate)

The `--remove-volumes` flag also deletes Docker volumes when stopping. This removes all chain state for a completely fresh network on the next start.

Use `--remove-volumes` when:
- Chain state is corrupted or causing unexpected errors
- You want to reset all account balances and contract deployments
- You are switching between incompatible devnet image versions
- You want a guaranteed clean starting point

Do **not** use `--remove-volumes` when:
- You have deployed contracts you want to keep testing against
- You have funded accounts with specific balances you need to preserve

## Restarting the Network

`/midnight-tooling:devnet restart [--pull] [--remove-volumes] [--file <path>] [--name <project-name>]`

Stops the network (with `--remove-volumes` if specified), then starts it (with `--pull` if specified). A restart with `--remove-volumes` is the most reliable way to return to a known-good state.

## Status vs Health

Two subcommands check the network, each serving a different purpose:

| Subcommand | What It Checks | Speed | Use When |
|------------|---------------|-------|----------|
| `status` | Docker container state (running, stopped, exited) | Fast | Quick check: "are the containers up?" |
| `health` | HTTP endpoints on each service with response times | Slower | Thorough check: "are the services actually responding?" |

**Use `status`** for a quick look at whether containers are running. This runs `docker compose -p <name> ps` and does not touch the services themselves.

**Use `health`** when you need to confirm the services are actually responsive. This curls each service endpoint and reports per-service pass/fail with response time.

A container can be "running" (per Docker) but not yet ready to accept requests — for example, if the indexer is still syncing. The health check catches this; the status check does not.

### Health Endpoints

| Service | Endpoint | Method |
|---------|----------|--------|
| Node | `http://localhost:9944/health` | HTTP GET |
| Indexer | `http://localhost:8088/api/v4/graphql` | HTTP GET |
| Proof Server | `http://localhost:6300/health` | HTTP GET |

## Getting Network Configuration

`/midnight-tooling:devnet config [--file <path>]`

Reads the `devnet.yml` file and displays:
- Image versions for each service
- Endpoint URLs and ports
- Network ID (`undeployed`)
- File location
- File age (from the `# Generated:` timestamp)

### Network Endpoints

Use these endpoints when configuring DApps or tools to connect to the local devnet:

| Endpoint | URL | Protocol |
|----------|-----|----------|
| Node RPC | `http://127.0.0.1:9944` | HTTP (JSON-RPC) |
| Node WebSocket | `ws://127.0.0.1:9944` | WebSocket |
| Indexer GraphQL | `http://127.0.0.1:8088/api/v4/graphql` | HTTP (GraphQL) |
| Indexer WebSocket | `ws://127.0.0.1:8088/api/v4/graphql/ws` | WebSocket (subscriptions) |
| Proof Server | `http://127.0.0.1:6300` | HTTP |

The network ID for the local devnet is `undeployed`. This value is used in DApp provider configurations and wallet connections.

## Viewing Logs

`/midnight-tooling:devnet logs [--service <name>] [--lines <n>] [--name <project-name>]`

Retrieves log output from devnet containers via `docker compose -p <name> logs`. Use this to diagnose startup failures, connection issues, or unexpected service behavior.

- Without `--service`: shows logs from all three services (interleaved).
- With `--service node` (or `indexer`, `proof-server`): shows logs from that service only.
- `--lines` limits the number of recent log lines shown.

## Compose File Locations

The finder script searches for `devnet.yml` in this priority order:

| Priority | Location | Use Case |
|----------|----------|----------|
| 1 | `./devnet.yml` | Project-specific devnet in current directory |
| 2 | `./.midnight/devnet.yml` | Project-specific devnet in .midnight subdirectory |
| 3 | `~/.midnight-expert/devnet/devnet.yml` | Global shared devnet (default for `generate`) |

When `--file <path>` is specified, it is used directly. If the specified file does not exist, the command **fails** — it does not fall back to searching other locations.

## Project Naming

Generated compose files include `name: midnight-devnet`. Commands that target running containers (`stop`, `restart`, `status`, `logs`, `health`) use `-p midnight-devnet` by default. If the user has changed the project name in their compose file, they must pass `--name <custom-name>` to these commands.

## Typical Workflows

### First-time setup

1. Ensure Docker Desktop is installed and running (see `docker-setup.md`)
2. Run `/midnight-tooling:devnet start` — this generates the compose file (resolving latest versions), pulls images, and starts services
3. Run `/midnight-tooling:devnet health` to confirm everything is ready

### Daily development

1. Run `/midnight-tooling:devnet start` to bring up the network
2. Develop and test against the local endpoints
3. Run `/midnight-tooling:devnet stop` when done (state is preserved for next time)

### Updating to latest versions

1. Run `/midnight-tooling:devnet update` to resolve and apply the latest stable image versions
2. Run `/midnight-tooling:devnet start --pull` to pull the new images and restart

### Starting fresh

1. Run `/midnight-tooling:devnet stop --remove-volumes` to wipe all state
2. Run `/midnight-tooling:devnet start` to restart with a clean chain
