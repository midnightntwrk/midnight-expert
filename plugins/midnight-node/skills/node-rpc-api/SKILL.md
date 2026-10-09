---
name: midnight-node:node-rpc-api
description: Midnight node RPC API, WebSocket, port 9944, midnight_contractState, midnight_zswapStateRoot, midnight_ledgerStateRoot, midnight_apiVersions, midnight_ledgerVersion, systemParameters RPC, sidechain RPC, system_health, chain_getBlock, state_getStorage, author_submitExtrinsic, grandpa_roundState, beefy RPC, mmr RPC, rpc.discover, OpenRPC, subscribe, subscription, query contract state, submit transaction to node, connect to Midnight RPC, subscribe to block headers, check node sync status.
version: 0.1.0
---

# Node RPC API

The Midnight node exposes a JSON-RPC API over WebSocket on port 9944. The API provides 68 methods (16 custom + 52 standard Substrate) across multiple modules for querying chain state, submitting transactions, and accessing Midnight-specific data.

This skill summarises the API. For the **complete** per-method reference at node 1.0.0 — exact params and return types — see `references/custom-rpcs.md` (the 16 custom methods) and `references/substrate-rpcs.md` (the 52 standard Substrate methods).

## Connection

| Protocol | Default Port | URL |
|----------|-------------|-----|
| WebSocket | 9944 | `ws://localhost:9944` |

### Network Endpoints

| Network | WebSocket URL |
|---------|---------------|
| Local / Dev | `ws://localhost:9944` |
| Preview | `wss://rpc.preview.midnight.network` |
| Preprod | `wss://rpc.midnight-preprod.blockfrost.io?project_id=<token>` |
| Mainnet | `wss://rpc.midnight-mainnet.blockfrost.io?project_id=<token>` |

Blockfrost hosts the public Preprod and Mainnet node RPC, so each needs the project ID of a Blockfrost project for that network (a Midnight Preprod ID starts with `nightpreprod`, a Midnight Mainnet ID with `nightmainnet`). Without a valid token for the network, requests fail with HTTP `403`. The Midnight-hosted `rpc.mainnet.midnight.network` and `rpc.preprod.midnight.network` are retired. The `https://` form of each host serves the same JSON-RPC over HTTP. For the current list, fetch `docs/relnotes/network.mdx` from `midnightntwrk/midnight-docs`.

## API Discovery

The node supports OpenRPC discovery for machine-readable API specification:

```bash
# Retrieve the full OpenRPC spec
wscat -c ws://localhost:9944 -x '{"jsonrpc":"2.0","id":1,"method":"rpc.discover","params":[]}'
```

The `rpc.discover` method returns a complete OpenRPC document describing all available methods, their parameters, and return types.

## Midnight-Specific RPCs

These methods are unique to the Midnight node and access ZK ledger state and Midnight-specific data.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `midnight_contractState` | `contract_address: String` (hex), `block_hash?: Hash` | Hex-encoded `String` | Query the state of a deployed Compact contract |
| `midnight_zswapStateRoot` | `block_hash?: Hash` | `Vec<u8>` (byte array) | Zswap state Merkle root at a given block |
| `midnight_ledgerStateRoot` | `block_hash?: Hash` | `Vec<u8>` (byte array) | Ledger state root at a given block |
| `midnight_apiVersions` | none | `Vec<u32>` (currently `[2]`) | Supported RPC protocol version(s) — distinct from the runtime API version |
| `midnight_ledgerVersion` | `block_hash?: Hash` | `String` | Ledger implementation version string |

### Example: Query Contract State

```bash
wscat -c ws://localhost:9944 -x '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "midnight_contractState",
  "params": ["0x<contract_address>"]
}'
```

### Example: Get Zswap State Root

```bash
wscat -c ws://localhost:9944 -x '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "midnight_zswapStateRoot",
  "params": []
}'
```

## System Parameters RPCs

These methods query on-chain governance parameters managed by the `pallet_system_parameters`.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `systemParameters_getTermsAndConditions` | `block_hash?: Hash` | Terms & Conditions data | Current terms and conditions set by governance |
| `systemParameters_getDParameter` | `block_hash?: Hash` | D-parameter value | Current D-parameter controlling validator selection |
| `systemParameters_getAriadneParameters` | `epoch_number: McEpochNumber`, `d_parameter_at?: Hash` | Ariadne parameters | Staking and delegation parameters (mandatory mainchain epoch; optional block hash sources the D-parameter) |

### Example: Get D-Parameter

```bash
wscat -c ws://localhost:9944 -x '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "systemParameters_getDParameter",
  "params": []
}'
```

## Partner Chain RPCs

These methods interact with the Cardano partner chain integration.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `sidechain_getParams` | none | Sidechain parameters | Partner chain configuration |
| `sidechain_getEpochCommittee` | `epoch: u64` | Committee members | Validator committee for a specific epoch |
| `sidechain_getStatus` | none | Status object | Partner chain synchronization status |
| `sidechain_getRegistrations` | `mc_epoch_number: McEpochNumber`, `mc_public_key: StakePoolPublicKey` | Registrations | Validator registrations for a mainchain epoch and stake-pool public key |
| `sidechain_getAriadneParameters` | `epoch_number: McEpochNumber` | Ariadne parameters | Staking and delegation parameters (deprecated — use `systemParameters_getAriadneParameters` instead) |

## Peer Reputation RPCs

These methods inspect and manage peer reputation, under the `network` namespace.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `network_peerReputations` | none | Peer reputation info | Reputation data for all known peers |
| `network_peerReputation` | `peer_id: String` | Peer reputation info | Reputation data for a specific peer |
| `network_unbanPeer` | `peer_id: String` | none | Lift a ban on a specific peer |

## Standard Substrate RPCs

### System Module

| Method | Description |
|--------|-------------|
| `system_name` | Node implementation name |
| `system_version` | Node version string |
| `system_chain` | Chain name from the chain spec |
| `system_chainType` | Chain type (Development, Local, Live) |
| `system_health` | Node health — peers, syncing status, should-have-peers |
| `system_properties` | Chain properties — token symbol, decimals, SS58 prefix |
| `system_peers` | Connected peer information |
| `system_localPeerId` | Local node's libp2p peer ID |
| `system_localListenAddresses` | Local node's listening multiaddresses |
| `system_syncState` | Sync progress — starting block, current block, highest block |
| `system_nodeRoles` | Roles this node is running (Full, Authority) |

### Chain Module

| Method | Description |
|--------|-------------|
| `chain_getHeader` | Block header by hash (latest if omitted) |
| `chain_getBlock` | Full block (header + extrinsics) by hash |
| `chain_getBlockHash` | Block hash by number |
| `chain_getFinalizedHead` | Hash of the latest finalized block |
| `chain_subscribeNewHeads` | Subscribe to new block headers |
| `chain_subscribeFinalizedHeads` | Subscribe to finalized block headers |
| `chain_subscribeAllHeads` | Subscribe to all block headers (including non-finalized) |

### State Module

| Method | Description |
|--------|-------------|
| `state_getStorage` | Read a storage value by key at a given block |
| `state_getStorageHash` | Hash of a storage value |
| `state_getStorageSize` | Size of a storage value in bytes |
| `state_getMetadata` | Runtime metadata (SCALE-encoded) |
| `state_getRuntimeVersion` | Runtime version — spec name, spec version, impl version |
| `state_queryStorageAt` | Query multiple storage keys at a block |
| `state_getKeys` | List storage keys with a given prefix |
| `state_getKeysPaged` | Paginated storage key listing |
| `state_call` | Execute a runtime API call |
| `state_subscribeStorage` | Subscribe to storage changes |
| `state_subscribeRuntimeVersion` | Subscribe to runtime version changes |

### Author Module

| Method | Description |
|--------|-------------|
| `author_submitExtrinsic` | Submit a signed extrinsic (transaction) |
| `author_pendingExtrinsics` | List pending extrinsics in the transaction pool |
| `author_insertKey` | Insert a key into the node's keystore |
| `author_hasKey` | Check if a key exists in the keystore |
| `author_rotateKeys` | Generate new session keys |
| `author_submitAndWatchExtrinsic` | Submit and subscribe to extrinsic status changes |

### GRANDPA Module

| Method | Description |
|--------|-------------|
| `grandpa_roundState` | Current GRANDPA round state |
| `grandpa_proveFinality` | Generate a finality proof for a block |
| `grandpa_subscribeJustifications` | Subscribe to GRANDPA justifications |

### MMR Module

| Method | Description |
|--------|-------------|
| `mmr_root` | MMR root hash at a given block |
| `mmr_generateProof` | Generate an MMR proof for given block numbers |

### BEEFY Module

| Method | Description |
|--------|-------------|
| `beefy_getFinalizedHead` | Latest BEEFY-finalized block hash |
| `beefy_subscribeJustifications` | Subscribe to BEEFY justifications |

> **Full catalog:** `references/substrate-rpcs.md` enumerates all **52** standard Substrate methods (system, chain, state, author, grandpa, mmr, beefy) with their params, derived from `docs/openrpc.json`.

## Subscription Usage Example

Subscriptions use WebSocket to push updates to the client. The following example subscribes to new block headers via `chain_subscribeNewHeads`.

```bash
# Subscribe to new block headers
wscat -c ws://localhost:9944 -x '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "chain_subscribeNewHeads",
  "params": []
}'
```

The node returns a subscription ID, then pushes notifications as new blocks arrive:

```json
{
  "jsonrpc": "2.0",
  "method": "chain_newHead",
  "params": {
    "subscription": "<subscription_id>",
    "result": {
      "parentHash": "0x...",
      "number": "0x1a2b",
      "stateRoot": "0x...",
      "extrinsicsRoot": "0x...",
      "digest": {
        "logs": ["0x..."]
      }
    }
  }
}
```

To unsubscribe, send `chain_unsubscribeNewHeads` with the subscription ID.

## References

| Name | Description | When used |
|------|-------------|-----------|
| `references/custom-rpcs.md` | The 16 Midnight-specific RPC methods (`midnight_`/`systemParameters_`/`sidechain_`/`network_`) with exact params and return types | When calling a custom RPC or checking its exact signature |
| `references/substrate-rpcs.md` | The 52 standard Substrate RPC methods grouped by module | When using a standard `system_`/`chain_`/`state_`/`author_` etc. method |

## Examples

| Name | Description | When used |
|------|-------------|-----------|
| `examples/custom-rpc-calls.md` | Executed `midnight_*` / `systemParameters_*` / `sidechain_*` calls with real captured output, plus the `rpc.discover` version difference | When constructing a custom RPC request or verifying a return type |

## Cross-References

- `midnight-indexer:indexer-graphql-api` — Higher-level GraphQL API for querying indexed chain data
- `midnight-node:node-governance` — The governance parameters behind `systemParameters_*` RPCs
- `midnight-node:node-validator` — How `systemParameters_getAriadneParameters` and the D-parameter drive committee selection
- `midnight-dapp-dev:midnight-sdk` — DApp provider configuration using node RPC endpoints
