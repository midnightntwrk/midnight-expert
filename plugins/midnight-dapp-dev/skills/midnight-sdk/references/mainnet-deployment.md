# Deploying to Mainnet

How to move a contract and DApp that work on `preprod` to Midnight mainnet: the deployment policy, the compiler to use, endpoints and tokens, funding, and a readiness checklist.

> **Last verified:** 2026-11-07. Sources:
> - the Midnight blog post [State of the Network – September 2026](https://midnight.network/blog/state-of-the-network-september-2026), dated 2026-09-28
> - `midnightntwrk/midnight-docs` at `72f101a`: `docs/relnotes/network.mdx`, `docs/guides/networks-and-environments.mdx` and `docs/relnotes/compact/toolchain-0.35.0.mdx`
> - `midnightntwrk/midnight-ledger` `ledger/src/semantics.rs`, where a contract deploy is rejected only if the address is already deployed
> - `midnightntwrk/midnight-ledger` `Ledger 9.1.0.0` release notes (2026-11-04), plus `midnight_ledgerVersion` and `state_getRuntimeVersion` read from the mainnet and preprod RPCs on 2026-11-07
>
> Endpoints and compiler versions change often. Re-fetch the docs pages before relying on the values here.

## Who can deploy

**Anyone can deploy contracts on mainnet.** Since 2026-09-28, according to the State of the Network post, "developers can write and deploy smart contracts directly to Midnight mainnet, without a required security review on Preprod." Applications can also deploy contracts on behalf of their users. The post recommends testing on Preprod first as a best practice, not as a requirement.

Before that date, mainnet was in a guarded launch. Public nodes dropped deploy transactions, and deployers had to request credentials from the Midnight Foundation through the [contract deployment rubric](https://github.com/midnightntwrk/midnight-improvement-proposals/blob/main/deployments/contract-deployment-rubric.md) in the MIP repository. **That process no longer applies.** As of 2026-10-09, the "Mainnet readiness checklist" in `docs/guides/networks-and-environments.mdx` still lists "Deployment authorisation is requested", and a 2026-03-30 blog post still explains how to apply. Both are out of date, so don't send users through them.

The ledger itself never restricted deployers. A node operator can still reject deploys with the opt-in `--filter-deploy-txs` flag, which is off by default. If deploys to a particular node keep getting dropped, try a different RPC endpoint.

## Compile with the compiler that matches mainnet

**Mainnet runs ledger 9.** It forked from ledger 8 at block 3,346,139 on 2026-11-06 (about 21:00 UTC), taking the upgrade directly rather than through a Preprod deployment and soak period. **Preprod still runs ledger 8.1.2**, so it is one ledger generation behind mainnet and can no longer validate ledger-9 behaviour. Both values were read from `midnight_ledgerVersion` and `state_getRuntimeVersion` on 2026-11-07; re-check them before relying on this page.

The compiler every live network has run is **Compact toolchain 0.31.x** (ledger-8 output). It is pinned in `midnight-tooling/network-supported-compiler.txt`, and `midnight-tooling:install-cli` installs it.

Toolchain 0.34.0 and later target ledger 9. Preprod rejects those contracts, because ledger 8 cannot read their initial state; mainnet, now on ledger 9, is the network they are built for. Check with `compact compile --version`, and switch with `compact update 0.31`. Pin `@midnight-ntwrk/compact-runtime` to the version that the [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix) lists for that toolchain.

On the SDK side, `midnight-js` **5.0.0** is the dual-era line: it runs contract-scoped transactions on ledger 8 and on ledger 9 from one build, and 4.1.1 cannot handle a contract compiled for ledger 9. The npm scope is split as well — `@midnightntwrk/ledger-v9`, `@midnightntwrk/wallet-sdk-facade` and `@midnightntwrk/dapp-connector-api` publish under the new scope, while `midnight-js` and `compact-runtime` still publish under the legacy `@midnight-ntwrk` scope.

## Endpoints and the Blockfrost token

Blockfrost hosts the public mainnet indexer and node RPC. The Midnight-hosted `indexer.mainnet.midnight.network` and `rpc.mainnet.midnight.network` were retired at 22:00 UTC on 30 September 2026.

| Service | URL |
|---|---|
| Node RPC | `https://rpc.midnight-mainnet.blockfrost.io` |
| Node RPC (WebSocket) | `wss://rpc.midnight-mainnet.blockfrost.io` |
| Indexer (GraphQL) | `https://midnight-mainnet.blockfrost.io/api/v0` |
| Indexer (WebSocket) | `wss://midnight-mainnet.blockfrost.io/api/v0/ws` |
| Proof server | Local only, by default `http://localhost:6300`. It handles private data and isn't a Blockfrost service. |

Create a **Midnight Mainnet** project on [blockfrost.io](https://blockfrost.io). Its project ID starts with `nightmainnet`. Append it as `?project_id=<token>` to every indexer and RPC URL, including the WebSocket URLs. A Preprod token (`nightpreprod…`) fails on mainnet with `403 Network token mismatch`. Request limits depend on your Blockfrost plan, so size the plan for your traffic, or run your own node and indexer.

```typescript
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

function withBlockfrostKey(url: string, projectId: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}project_id=${encodeURIComponent(projectId)}`;
}

export function mainnetConfig() {
  const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim();
  if (!projectId) throw new Error('BLOCKFROST_PROJECT_ID is not set.');
  return {
    networkId: 'mainnet',
    node: withBlockfrostKey('https://rpc.midnight-mainnet.blockfrost.io', projectId),
    nodeWS: withBlockfrostKey('wss://rpc.midnight-mainnet.blockfrost.io', projectId),
    indexer: withBlockfrostKey('https://midnight-mainnet.blockfrost.io/api/v0', projectId),
    indexerWS: withBlockfrostKey('wss://midnight-mainnet.blockfrost.io/api/v0/ws', projectId),
    proofServer: 'http://localhost:6300',
  } as const;
}

setNetworkId('mainnet');
const network = mainnetConfig();
```

Pass these URLs to `indexerPublicDataProvider(network.indexer, network.indexerWS)`, and pass the same Blockfrost URLs to the wallet configuration. The rest of the deploy flow is the same as on any other network; see `transaction-lifecycle.md`. `create-mn-app` doesn't offer a mainnet target, so you have to wire the providers by hand.

**Keep the token private.** It is part of every URL. SDK errors such as `request to <url> failed` and testkit-js's environment log print the full URL. Strip `project_id` before logging anything. For a browser DApp, either route indexer and RPC calls through a backend that adds the token, or use the endpoints the user's wallet provides through the DApp Connector's `getConfiguration()`.

To check the token works before deploying, run:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"system_chain","params":[]}' \
  "https://rpc.midnight-mainnet.blockfrost.io?project_id=$BLOCKFROST_PROJECT_ID"
```

The response should contain `"Midnight Mainnet"`.

## Funding the deployer

Every transaction pays its fee in DUST, and mainnet has no faucet. Most NIGHT is held on Cardano as cNIGHT. To fund a deployer wallet, use the [cNgD DApp](https://midnight-dust-mainnet.nethermind.io/) to register your Cardano reward address together with a Midnight DUST public key. Your cNIGHT then generates DUST on Midnight. The registration takes **about 12 hours** to take effect, so do it well before launch, and check that the wallet shows a DUST balance before you deploy. For wallet mechanics, see `midnight-wallet:wallet-sdk`.

## Mainnet readiness checklist

- [ ] The full deploy-and-interact flow works end to end on `preprod`.
- [ ] The contract was compiled with the network-supported toolchain (0.31.x for ledger v8), and `compact-runtime` is pinned to the matching version.
- [ ] A security review is done. It isn't required for deployment any more, but mainnet holds real value. Use `/compact-core:audit-compact`, and the docs' [pre-deployment security checklist](https://docs.midnight.network/guides/security-best-practices#pre-deployment-security-checklist).
- [ ] You have decided whether the contract can be upgraded, and who holds the maintenance authority. See the [updatability guide](https://docs.midnight.network/guides/deploy-and-operate#contract-updatability-and-the-maintenance-authority).
- [ ] The deployer wallet shows a DUST balance, and the 12-hour cNIGHT registration delay has passed.
- [ ] Every endpoint is a mainnet Blockfrost URL. No `preview` or `preprod` URL remains, and no retired `*.mainnet.midnight.network` URL either.
- [ ] Every indexer and RPC URL has a Midnight Mainnet `project_id`, read from the environment, and the token isn't shipped in browser code or written to logs.
- [ ] The Blockfrost plan covers the expected traffic, or you run your own node and indexer.
- [ ] The keys that control the contract and funds have an owner, a backup, and a rotation plan.
- [ ] You know how you'll confirm the deployment on a block explorer: [midnightexplorer.com](https://midnightexplorer.com/), [midnight.subscan.io](https://midnight.subscan.io/), or [explorer.1am.xyz](https://explorer.1am.xyz).

## Troubleshooting

For `403` token errors, `ENOTFOUND` from retired hosts, and wallet sync failures after the move to Blockfrost, see `midnight-tooling:troubleshooting`, specifically `references/environment-urls.md`.
