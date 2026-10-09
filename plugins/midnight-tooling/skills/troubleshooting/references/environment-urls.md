# Incorrect URLs and Wrong Environment

Resolve issues caused by incorrect endpoint URLs, missing Blockfrost tokens, or connecting to the wrong Midnight network environment.

## Midnight Network Environments

Midnight follows Cardano's naming convention for network environments. The testnet is called **preprod** (pre-production), not "testnet".

Reference: https://book.world.dev.cardano.org/env-preprod.html

Environment names (these are also the SDK network IDs):
- **undeployed** - A local devnet running in Docker
- **preview** - The early-stage public test network
- **preprod** - The public test network closest to mainnet (equivalent to "testnet" in other ecosystems)
- **mainnet** - The production network

**Critical rule:** Do not mix URLs from different environments. All endpoints (node, indexer, proof server, etc.) must point to the same network environment.

## Fetch Current Environment URLs

The per-network endpoints are listed in the "Environments and endpoints" release-notes page. Fetch it for the current URLs:

```
githubGetFileContent(
  owner: "midnightntwrk",
  repo: "midnight-docs",
  path: "docs/relnotes/network.mdx",
  fullContent: true
)
```

For the Blockfrost token, migration errors, and the mainnet checklist, fetch the networks guide, `docs/guides/networks-and-environments.mdx`, from the same repository.

## Current Endpoints (snapshot)

> **Last verified:** 2026-10-09, against `midnightntwrk/midnight-docs` `docs/relnotes/network.mdx` at `72f101a`. The fetched page is authoritative if it disagrees.

| Network | Node RPC | Indexer (GraphQL) | Indexer (WebSocket) |
|---|---|---|---|
| preview | `https://rpc.preview.midnight.network` | `https://indexer.preview.midnight.network/api/v4/graphql` | `wss://indexer.preview.midnight.network/api/v4/graphql/ws` |
| preprod | `https://rpc.midnight-preprod.blockfrost.io` | `https://midnight-preprod.blockfrost.io/api/v0` | `wss://midnight-preprod.blockfrost.io/api/v0/ws` |
| mainnet | `https://rpc.midnight-mainnet.blockfrost.io` | `https://midnight-mainnet.blockfrost.io/api/v0` | `wss://midnight-mainnet.blockfrost.io/api/v0/ws` |

The node RPC also accepts WebSocket connections on the same host (`wss://`). The proof server is never hosted: it always runs locally, by default on `http://localhost:6300`.

### Blockfrost tokens (preprod and mainnet)

Blockfrost hosts the public Preprod and Mainnet indexer and node RPC. The Midnight-hosted endpoints are retired:

- `indexer.mainnet.midnight.network` and `rpc.mainnet.midnight.network` were retired at 22:00 UTC on 30 September 2026.
- `indexer.preprod.midnight.network` and `rpc.preprod.midnight.network` shut down from 22:00 UTC on 9 October 2026.

Each request needs a project token. Create a project for each network on [blockfrost.io](https://blockfrost.io). A **Midnight Preprod** project ID starts with `nightpreprod`, and a **Midnight Mainnet** project ID starts with `nightmainnet`.

Append `?project_id=<token>` to every indexer and RPC URL, including the WebSocket URLs. The Midnight SDK's providers and the wallet SDK take plain URLs, and browser WebSockets can't set headers, so use the query parameter rather than a header.

The token is part of the URL. Keep it out of browser code and logs, because SDK errors such as `request to <url> failed` print the full URL.

## Diagnosing URL Issues

### Symptoms

- Connection refused, timeout, or `getaddrinfo ENOTFOUND` errors when calling Midnight APIs
- HTTP `403` from an indexer or RPC endpoint
- Unexpected data or empty responses from endpoints
- "Network mismatch" or "wrong network" errors in DApp logs
- Transactions submitted but never confirmed
- Wallet shows wrong balance or no balance, or wallet sync never finishes

### Diagnostic Steps

1. **Collect all configured URLs** - Check environment variables, `.env` files, config files, and hardcoded values for any Midnight endpoint URLs
2. **Fetch current URLs** (above) - Compare the user's configured URLs against the official current URLs
3. **Verify environment consistency** - Ensure all URLs belong to the same environment, and that the Blockfrost token belongs to that network too
4. **Test connectivity** - For Blockfrost endpoints, the node should return the network name (for example `"Midnight Mainnet"`), and the indexer should return a block height:
   ```bash
   curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"system_chain","params":[]}' \
     "https://rpc.midnight-mainnet.blockfrost.io?project_id=$BLOCKFROST_PROJECT_ID"

   curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"query":"{ block { height } }"}' \
     "https://midnight-mainnet.blockfrost.io/api/v0?project_id=$BLOCKFROST_PROJECT_ID"
   ```
   Replace `mainnet` with `preprod` in both hosts for Preprod.
5. **Check for stale URLs** - Midnight may update endpoint URLs between releases. If the user's URLs don't match the current docs, they need to update.

### Common Errors

| Symptom | Cause and fix |
|---|---|
| `getaddrinfo ENOTFOUND indexer.mainnet.midnight.network`, or `fetch failed` | The config still points at a retired Midnight-hosted endpoint. Replace it with the Blockfrost URL from the table above. |
| Requests to `*.preprod.midnight.network` fail | The config still points at the Midnight-hosted Preprod endpoints, which shut down from 22:00 UTC on 9 October 2026. Replace them with the Blockfrost Preprod URLs. |
| `403` with `Missing project token. Please include project_id in your request.` | Append `?project_id=<token>` to every indexer and RPC URL, including WebSocket URLs. |
| `403` with `Invalid project token.` | Blockfrost doesn't recognize the token. Check that the whole project ID was copied. |
| `403` with `Network token mismatch. Are you using token for the correct network?` | A `nightpreprod…` token is on a Mainnet URL, or a `nightmainnet…` token is on a Preprod URL. Use a token from a project for the target network. |
| `Response not successful: Received status code 403` from Midnight.js | One of the `403` errors above. Midnight.js hides the message, so run the `curl` check in step 4 to see which one it is. |
| Wallet sync never finishes, with `values inserted non-linearly into dust generation tree` (or `zswap commitment tree`, `dust commitment tree`) | Saved sync state from the old Midnight-hosted indexer doesn't carry over to Blockfrost. Discard it and sync from genesis. A full Preprod sync takes over an hour. |
| `TypeError: Invalid URL` when building a wallet | The wallet's relay URL is empty or a placeholder. Set it to the full `wss://` Blockfrost RPC URL with the token. |

### Common Mistakes

- Copying a URL from a tutorial written for a different environment, or from before the move to Blockfrost
- Mixing preprod node URL with mainnet indexer URL
- Using a Preprod Blockfrost token on mainnet, or the other way round
- Using an old URL that was valid in a previous release but has since changed
- Hardcoding URLs instead of using environment variables (makes switching environments error-prone)

## If Issues Persist

1. Search for URL or environment-related issues: `gh search issues "URL environment org:midnightntwrk" --state=open --limit=20 --sort=updated --json "title,url,updatedAt,commentsCount"`
2. Check `references/checking-release-notes.md` for endpoint URL changes in recent releases
3. If versions may also be mismatched, see `references/version-mismatch.md` for compatibility matrix and version diagnosis
