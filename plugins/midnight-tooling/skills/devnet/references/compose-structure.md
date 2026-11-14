# Compose File Structure

This reference documents every field in the generated `devnet.yml` file. Use this to understand the compose file anatomy, debug startup failures, and reason about bespoke user modifications.

## Header Comments

```yaml
# Midnight Local Development Network
# Generated: 2026-03-27T12:00:00Z
# Generator: midnight-tooling plugin
```

- **Generated**: ISO 8601 UTC timestamp of when the file was created or last regenerated. Used by `check-staleness.sh` to determine file age. The `update` subcommand refreshes this timestamp when it modifies image versions.
- **Generator**: Identifies that the file was produced by this plugin. Files without this marker are user-created — `update` still works on them but won't add the header.

## Project Name

```yaml
name: midnight-devnet
```

Sets the Docker Compose project name. All containers, networks, and volumes are namespaced under this name. Commands that operate on running containers (`stop`, `status`, `logs`, `health`) use `-p midnight-devnet` to target this project. Users can override with the `--name` flag.

## Services

### Node (`midnight-node`)

```yaml
node:
  image: midnightntwrk/midnight-node:X.Y.Z
  container_name: midnight-node
  ports:
    - '9944:9944'
  # Healthy only once block 1 exists, not just once /health answers: the
  # indexer exits with "block number 1 not found" if it starts at block 0.
  healthcheck:
    test:
      - 'CMD-SHELL'
      - >-
        curl -sf -H 'Content-Type: application/json'
        -d '{"id":1,"jsonrpc":"2.0","method":"chain_getHeader","params":[]}'
        http://localhost:9944 | grep -q '"number":"0x[1-9a-f]'
    interval: 2s
    timeout: 5s
    retries: 30
    start_period: 5s
  environment:
    CFG_PRESET: 'dev'
    SIDECHAIN_BLOCK_BENEFICIARY: '04bcf7ad3be7a5c790460be82a713af570f22e0f801f6659ab8e84a52be6969e'
```

| Field | Purpose |
|-------|---------|
| `image` | The Midnight Substrate-based blockchain node. Version must be a stable `X.Y.Z` tag from Docker Hub `midnightntwrk/midnight-node`. |
| `container_name` | Fixed name `midnight-node`. Other services reference this via Docker internal DNS. |
| `ports` | Exposes Substrate JSON-RPC on host port 9944. DApps connect here for chain interactions. |
| `healthcheck` | Asks the node for its latest header every 2 seconds and passes only once block 1 exists. The indexer's `depends_on` waits for this, because the indexer exits with `block number 1 not found` if it starts while the chain is still at block 0. |
| `CFG_PRESET` | `dev` preset configures fast block times and instant finality for local development. |
| `SIDECHAIN_BLOCK_BENEFICIARY` | Public key that receives block rewards. This is the genesis beneficiary for the dev preset. |

### Indexer (`midnight-indexer`)

```yaml
indexer:
  image: midnightntwrk/indexer-standalone:X.Y.Z
  container_name: midnight-indexer
  restart: on-failure
  ports:
    - '8088:8088'
  environment:
    RUST_LOG: 'indexer=info,chain_indexer=info,indexer_api=info,wallet_indexer=info,indexer_common=info,fastrace_opentelemetry=off,info'
    APP__APPLICATION__NETWORK_ID: 'undeployed'
    APP__INFRA__NODE__URL: 'ws://node:9944'
    APP__INFRA__STORAGE__PASSWORD: 'indexer'
    APP__INFRA__PUB_SUB__PASSWORD: 'indexer'
    APP__INFRA__LEDGER_STATE_STORAGE__PASSWORD: 'indexer'
    APP__INFRA__SECRET: '303132333435363738393031323334353637383930313233343536373839303132'
    APP__INFRA__SPO_NODE__URL: 'ws://node:9944'
    APP__INFRA__SPO_NODE__BLOCKFROST_ID: 'local-devnet-placeholder'
  healthcheck:
    test: ['CMD-SHELL', 'cat /var/run/indexer-standalone/running']
    interval: 10s
    timeout: 5s
    retries: 20
    start_period: 10s
  depends_on:
    node:
      condition: service_healthy
```

| Field | Purpose |
|-------|---------|
| `image` | The Midnight standalone indexer. Version from `midnightntwrk/indexer-standalone`. |
| `container_name` | Fixed name `midnight-indexer`. |
| `ports` | Exposes GraphQL API on port 8088. Both HTTP (`/api/v4/graphql`) and WebSocket (`/api/v4/graphql/ws`) endpoints are served here. |
| `RUST_LOG` | Controls Rust log verbosity. Default enables info-level logs for indexer modules and disables noisy telemetry. |
| `APP__APPLICATION__NETWORK_ID` | Must be `undeployed` for local devnet. This matches the Lace wallet extension defaults so Lace connects without custom configuration. |
| `APP__INFRA__NODE__URL` | WebSocket connection to the node. Uses Docker internal DNS name `node` (the service name), not `localhost`. |
| `APP__INFRA__STORAGE__PASSWORD`, `PUB_SUB__PASSWORD`, `LEDGER_STATE_STORAGE__PASSWORD` | Internal service passwords. These are dev defaults — all set to `indexer`. Only relevant inside the container. |
| `APP__INFRA__SECRET` | Internal encryption secret for the indexer. Dev default — hex-encoded bytes. |
| `APP__INFRA__SPO_NODE__URL`, `APP__INFRA__SPO_NODE__BLOCKFROST_ID` | Since `4.3.0` the indexer also indexes SPO data and exits without a Blockfrost id. On the local devnet it reads that data from the node, so the id is a placeholder. |
| `restart` | `on-failure` retries a startup crash instead of failing `docker compose up --wait`. |
| `healthcheck` | Checks for the existence of `/var/run/indexer-standalone/running` — a process-presence sentinel file created by the entrypoint script before launching the indexer binary, and removed on container exit. Its presence indicates the container is alive and the indexer process has been started. Longer `interval` (10s) and `start_period` (10s) because the indexer takes longer to initialize than the node. |
| `depends_on` | Waits for the node's healthcheck to pass before starting. This ensures the node's RPC endpoint is ready before the indexer tries to connect. |

### Proof Server (`midnight-proof-server`)

```yaml
proof-server:
  image: midnightntwrk/proof-server:X.Y.Z
  container_name: midnight-proof-server
  command: ['midnight-proof-server -v']
  ports:
    - '6300:6300'
  environment:
    RUST_BACKTRACE: 'full'
```

| Field | Purpose |
|-------|---------|
| `image` | The Midnight zero-knowledge proof server. Version from `midnightntwrk/proof-server`. |
| `container_name` | Fixed name `midnight-proof-server`. |
| `command` | Runs the proof server binary with verbose (`-v`) output. |
| `ports` | Exposes the proof generation API on port 6300. DApps send proof requests here. |
| `RUST_BACKTRACE` | `full` enables detailed Rust backtraces for debugging proof generation errors. |

The proof server has no `depends_on` — it operates independently of the node and indexer. It also has no healthcheck in the compose file; use `curl http://localhost:6300/health` to check its status manually.

## Dependency Ordering

```
node (starts first, has healthcheck)
  └── indexer (waits for node healthcheck)
proof-server (starts independently)
```

The node must be healthy before the indexer starts, because the indexer immediately tries to connect to `ws://node:9944`. The proof server is independent — it generates proofs on demand and doesn't maintain a chain connection.

## Port Summary

| Port | Service | Protocol | DApp Configuration Key |
|------|---------|----------|----------------------|
| 9944 | Node | HTTP (JSON-RPC) / WebSocket | `nodeUrl` or `relayURL` |
| 8088 | Indexer | HTTP (GraphQL) / WebSocket (subscriptions) | `indexerUrl` / `indexerWsUrl` |
| 6300 | Proof Server | HTTP | `provingServerUrl` |

If any port is already in use on the host, the corresponding service will fail to start. Use `lsof -i :<port>` to identify the conflicting process.

## Network ID

The network ID for the local devnet is `undeployed`. This is set in the indexer's `APP__APPLICATION__NETWORK_ID` environment variable and matches the node's dev preset. Use this value when configuring DApp providers and wallet connections.

## Making Bespoke Modifications

Users can edit the generated `devnet.yml` freely. Common modifications:

- **Change ports**: Edit the `ports` mapping (e.g., `'9945:9944'` to expose the node on host port 9945). Remember to update DApp configs to match.
- **Add volumes**: Add named or bind-mount volumes for persistent data across restarts without Docker volumes.
- **Adjust resources**: Add `deploy.resources.limits` for memory/CPU caps.
- **Change log levels**: Modify `RUST_LOG` for more or less verbose indexer output.
- **Change project name**: Edit the top-level `name` field. Use `--name` flag with commands to match.

When running `/midnight-tooling:devnet update`, the agent reads the file and edits only the image tags — all other bespoke modifications are preserved. The `# Generated:` timestamp is also refreshed. If the file lacks a `# Generated:` comment, the agent adds one.
