---
name: midnight-tooling:proof-server
description: This skill should be used when the user asks about the Midnight proof server in any context — local, testnet, or mainnet. Includes "start the proof server", "restart the proof server", "stop the proof server", "proof server not working", "proof server logs", "check if proof server is running", "proof server port 6300", "proof server version", "proof server image tag", "proof server health check", "proof server API endpoints", "Docker container for proofs", "set up Docker for the proof server", or "proof server endpoint". Covers proof server concepts, version selection, API endpoints, standalone Docker usage, and troubleshooting. For local development setup, see the devnet skill.
---

# Midnight Proof Server

The Midnight proof server generates zero-knowledge proofs for Midnight transactions. It can run locally as a Docker container or be accessed as a remote service on testnet/mainnet. The server exposes an HTTP API (default port 6300) that DApps use to request proof generation at runtime.

## Local Development

For local development, use the devnet which manages a proof server alongside a node and indexer. Run `/midnight-tooling:devnet start` to start the full local network. See the `devnet` skill for details.

The rest of this skill covers working with proof servers directly — useful when connecting to testnet/mainnet or running a standalone instance.

## Looking Up Environment Endpoints

Current proof server addresses for testnet and mainnet are published in the Midnight documentation. To look up the latest endpoints:

Use the `octocode` MCP to fetch the `relnotes/overview` page from the `midnightntwrk/midnight-docs` repository:

```
githubGetFileContent(
  owner: "midnightntwrk",
  repo: "midnight-docs",
  path: "docs/relnotes/overview.mdx",
  fullContent: true
)
```

This page contains the current network environment details including proof server URLs, node endpoints, and indexer endpoints for all active environments.

## Terminology

| Term | What It Is | How It Runs |
|------|-----------|-------------|
| **Proof server** | A service that generates zero-knowledge proofs for Midnight transactions | Docker container (`midnightntwrk/proof-server`) listening on port 6300 |
| **Docker Desktop** | The container runtime required to run the proof server | System application, must be running before starting the proof server |

The proof server is **not** the same as the Compact compiler. The compiler produces ZK circuits from Compact source code; the proof server uses those circuits to generate proofs at runtime. See the **compact-cli** skill for compiler installation, compilation commands, and output file details.

## Prerequisites

Docker Desktop must be installed and running before the proof server can start.

| Check | Command | Expected |
|-------|---------|----------|
| Docker installed | `docker --version` | Version string |
| Docker daemon running | `docker info` | System info (no connection errors) |

If Docker is not installed, download it from [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/).

If Docker is installed but not running, start Docker Desktop and wait for it to be ready before proceeding.

## Image Version & Tag Selection

The proof server image is published to Docker Hub as `midnightntwrk/proof-server` with semver-based tags.

### Available Tag Types

| Tag Pattern | Example | Type |
|-------------|---------|------|
| `X.Y.Z` | `7.0.2` | Stable release |
| `X.Y.Z-rc.N` | `8.0.0-rc.4` | Release candidate (prerelease) |
| `X.Y.Z-<suffix>` | `8.0.0-performance.1` | Other prerelease |
| `X.Y.Z-arm64` / `X.Y.Z-amd64` | `7.0.2-arm64` | Architecture-specific (ignore — Docker selects automatically) |
| `latest` | `latest` | Points to the most recent push (may be a prerelease) |

### Listing Available Versions

Fetch available tags from the Docker Hub registry API:

```bash
curl -s "https://registry.hub.docker.com/v2/repositories/midnightntwrk/proof-server/tags/?page_size=100&ordering=last_updated" \
  | grep -o '"name": *"[^"]*"' \
  | sed 's/"name": *"//;s/"$//'
```

### Resolving the Latest Stable Version

Filter to tags matching strict semver (`X.Y.Z` only — no prerelease suffixes, no architecture suffixes), sort numerically, and select the highest:

```bash
curl -s "https://registry.hub.docker.com/v2/repositories/midnightntwrk/proof-server/tags/?page_size=100&ordering=last_updated" \
  | grep -o '"name": *"[^"]*"' \
  | sed 's/"name": *"//;s/"$//' \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -t. -k1,1n -k2,2n -k3,3n \
  | tail -1
```

The `grep -E '^[0-9]+\.[0-9]+\.[0-9]+$'` pattern excludes:
- Prerelease tags (`8.0.0-rc.4`, `8.0.0-performance.1`)
- Architecture-specific tags (`7.0.2-arm64`, `7.0.2-amd64`)
- Non-semver tags (`latest`)

### Version Selection Defaults

| Scenario | Tag Used |
|----------|----------|
| User specifies `--version 8.0.0-rc.4` | `8.0.0-rc.4` (exact) |
| User specifies `--version latest` | `latest` |
| No version specified | Latest stable (`X.Y.Z` without prerelease suffix) |
| No stable versions found | Fall back to `latest` with a warning |
| Docker Hub API unreachable | Fall back to `latest` with a warning |

## Running the Proof Server

The proof server is memory-intensive. Ensure Docker has at least 4 GB RAM allocated. See `references/docker-setup.md` for resource configuration.

Start the proof server in detached mode so it runs in the background (replace `<tag>` with the resolved version):

```bash
docker run -d --name midnight-proof-server -p 6300:6300 midnightntwrk/proof-server:<tag> -- midnight-proof-server -v
```

For example, with version 8.1.0:

```bash
docker run -d --name midnight-proof-server -p 6300:6300 midnightntwrk/proof-server:8.1.0 -- midnight-proof-server -v
```

| Flag / Argument | Purpose |
|------|---------|
| `-d` | Run in detached (background) mode |
| `--name midnight-proof-server` | Assign a predictable container name for management |
| `-p 6300:6300` | Map host port 6300 to container port 6300 |
| `--` | Separates Docker options from the container command |
| `midnight-proof-server` | The binary to run inside the container |
| `-v` | Enable verbose logging inside the proof server |

### Verifying the Server

After starting, verify the server is healthy:

```bash
# Check container is running
docker ps --filter "name=midnight-proof-server" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Health check — returns {"status":"ok","timestamp":"..."}
curl -sf http://localhost:6300/health

# Check server version
curl -sf http://localhost:6300/version

# Readiness check — returns {"status":"ok","jobsProcessing":N,"jobsPending":N,"jobCapacity":N,...}
curl -sf http://localhost:6300/ready

# View recent logs
docker logs --tail 20 midnight-proof-server
```

The server is ready when `/health` returns `{"status":"ok",...}` and `/ready` returns status `"ok"` with HTTP 200. If `/ready` returns HTTP 503 with status `"busy"`, the server is running but its job queue is full.

For a one-shot probe of the proof server (and the rest of the devnet) from inside a script, use the `midnight-tooling:devnet-health` skill — its `health.sh` calls `/version` on the proof server with a 5 s timeout.

## Stopping the Proof Server

```bash
docker stop midnight-proof-server
```

To remove the stopped container (required before starting a new one with the same name):

```bash
docker rm midnight-proof-server
```

## Restarting / Replacing the Proof Server

If a container named `midnight-proof-server` already exists (running or stopped), remove it before starting a new one:

```bash
docker rm -f midnight-proof-server 2>/dev/null
docker run -d --name midnight-proof-server -p 6300:6300 midnightntwrk/proof-server:<tag> -- midnight-proof-server -v
```

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `docker: command not found` | Docker not installed | Install Docker Desktop |
| `Cannot connect to the Docker daemon` | Docker Desktop not running | Start Docker Desktop, wait for it to be ready |
| `port is already allocated` on 6300 | Another process using port 6300 | Stop the conflicting process or use a different port mapping (e.g., `-p 6301:6300`) |
| `Conflict. The container name "/midnight-proof-server" is already in use` | Stopped container with same name exists | Run `docker rm midnight-proof-server` then retry |
| Container starts but exits immediately | Image issue or resource constraints | Check logs with `docker logs midnight-proof-server` |
| `curl: (7) Failed to connect to localhost port 6300` | Server not ready or not running | Wait a few seconds for startup; check `docker ps` for container status |

## API Endpoints

The proof server exposes the following HTTP endpoints on port 6300:

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/` | GET | Health check (alias for `/health`) | `{"status":"ok","timestamp":"..."}` |
| `/health` | GET | Health check | `{"status":"ok","timestamp":"..."}` |
| `/version` | GET | Server version | Plain text, e.g. `8.0.0-rc.4` |
| `/ready` | GET | Readiness and worker pool utilization | `{"status":"ok","jobsProcessing":N,"jobsPending":N,"jobCapacity":N,"timestamp":"..."}` |
| `/proof-versions` | GET | Supported proof versions | Plain text, e.g. `["V2"]` |

The `/ready` endpoint returns HTTP 200 when ready and HTTP 503 when the job queue is full (status `"busy"`).

## Reference Files

| Reference | Content | When to Read |
|-----------|---------|-------------|
| **`references/docker-setup.md`** | Standalone Docker proof server setup; cross-references the devnet skill's Docker guide for installation and troubleshooting | Running a proof server outside the devnet (e.g., testnet/mainnet) |

For local development Docker setup (node, indexer, and proof server together), see the **devnet** skill and its `references/docker-setup.md`.
