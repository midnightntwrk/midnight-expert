# Embedded Wallets (Email / Social Login)

How a user goes from an email address to a Midnight transaction with no extension
install and no local proof server. This page covers **Dynamic's embedded Midnight
wallet** (`@dynamic-labs/midnight`), the only shipped Wallet-as-a-Service path on
Midnight as of 2026-10-22.

> **Not the Wallet SDK.** This is a *hosted* wallet: keys are TSS-MPC shares, the
> prover runs in the provider's wallet client, and your app never sees a seed. If
> your process must own the keys, use `midnight-wallet:wallet-sdk` (this skill) or
> `midnight-wallet:managing-test-wallets` instead.

## Status (verified 2026-10-22, `@dynamic-labs/midnight@5.12.2`)

| Fact | Evidence |
|---|---|
| Package is real and actively released | first publish 2026-04-03, 93 stable versions, `5.12.2` published 2026-10-21T20:10Z |
| Implements the official connector contract | depends on `@midnight-ntwrk/dapp-connector-api@4.0.1` |
| Wallet logic is **not** in this package | no `@midnightntwrk/wallet-sdk-*` dependency; signing/proving proxies to `@dynamic-labs-wallet/browser-wallet-client` over an authenticated call (`authToken` + MFA token + signed session) |
| Adoption at time of writing | 564 npm downloads in the week to 2026-10-18 |

Midnight's own documentation still lists Dynamic as unsupported ("as of June 2026").
That page is stale — the package, its API surface, and Dynamic's docs (last modified
2026-09-16) all exist. Probe npm before repeating the docs' claim.

## Wiring

```bash
npm i @dynamic-labs/sdk-react-core @dynamic-labs/midnight
```

Two console settings are required before any call works:

1. **Chains & Networks → enable Midnight.**
2. **Embedded Wallets → Security → enable Private Key Exports.** Midnight key
   derivation runs through the export path; without this every call (`getFormattedBalances`,
   `signMessage`, transfers) fails with **403**. Read that again before you promise
   users "your keys never leave your control" — the setting is a standing requirement,
   not an edge case.

```tsx
import { DynamicContextProvider, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { DynamicWaasMidnightConnectors, isMidnightWallet } from '@dynamic-labs/midnight';

<DynamicContextProvider
  settings={{
    environmentId: 'YOUR_ENVIRONMENT_ID',
    walletConnectors: [DynamicWaasMidnightConnectors], // WaaS = email/social
  }}
>
  <DynamicWidget />
</DynamicContextProvider>
```

For an extension wallet (1AM, Lace) use `MidnightWalletConnectors` from the same
package — that path is a thin wrapper over `window.midnight`.

## The wallet is three surfaces, not one address

| Surface | What it holds | Where it is |
|---|---|---|
| Unshielded | public address + public state | `wallet.address` |
| Shielded | private address, separate token pool | `wallet.additionalAddresses` where `type === WalletAddressType.MidnightShielded` |
| DUST | fee-generation state (not a token you receive) | `wallet.additionalAddresses` where `type === WalletAddressType.MidnightDust` |

NIGHT exists in **both** pools with different token types — the unshielded key is
64 zeros; the shielded key is a hash. They are not two views of one balance, and
**cross-pool transfers are not supported** by this connector:

> To fund a new user's shielded balance, someone must send to their `mn_shield…`
> address from a shielded-capable wallet. Your app cannot convert unshielded → shielded
> through Dynamic.

## Balances

```typescript
const { unshieldedBalance, shieldedTokenCount, dustBalance, dustSyncing } =
  await wallet.getFormattedBalances();

// raw, bigint, keyed by token type
const { shielded, unshielded, dust } = await wallet.getBalances();
```

- `dustSyncing: true` means the fee surface is still folding — the first read on a
  device does a cold sync. Poll until false before offering Send.
- **DUST units:** `dust.balance` is in **Specks** (1 DUST = 10¹⁵ Specks) while
  `dust.cap` uses the 10⁶ atomic scale shared with NIGHT. Formatting them with one
  divisor shows a balance 10⁹× wrong.
- Unshielded NIGHT uses 6 decimals in the connector's atomic representation.

## Sending: one call or three

```typescript
// one-shot — routes to the pool implied by the recipient prefix
await wallet.sendBalance({ toAddress: 'mn_shield1…', amount: '100000000' });

// or explicit: build → sign+prove → submit
const { serializedTransaction } = await wallet.createTransferTransaction({
  transfers: [{ type: 'shielded', recipientAddress: 'mn_shield1…', amount: '100000000' }],
});
const finalized = await wallet.signTransaction(serializedTransaction); // signs AND ZK-proves
const { txHash } = await wallet.submitTransaction(finalized);
```

`type: 'unshielded'` signs through MPC; `type: 'shielded'` produces a proof. Both run
in the provider's wallet client, so a shielded transfer's witness is handled on the
provider side — that is the security trade the hosted model makes. If the model is
wrong for your threat model, use a self-custody wallet.

Stuck inputs after a build you never submitted:

```typescript
await wallet.revertTransaction(serializedTransaction); // one tx
await wallet.revertAllPending();                       // everything unsubmitted
await wallet.resetWalletCache();                       // last resort: full re-sync
```

## Fees: registration is not minting

```typescript
const { status } = await wallet.registerDust();
// 'registered' | 'already_registered' | 'already_has_dust' | 'no_utxos'
```

- Registration designates **unshielded NIGHT** for DUST generation. No NIGHT → `no_utxos`.
- DUST then accrues over time (Midnight docs: ~12 hours on mainnet). A zero balance
  immediately after registering is expected, not a bug.
- **No fee sponsorship on Midnight** through Dynamic: their gasless feature is scoped
  to EVM and Solana. Every user needs their own DUST, or your app pre-funds and
  pre-registers on their behalf and waits.

## Trap: network detection in the connector

The shipped WaaS connector decides network identity from the **network name string**:

```javascript
// @dynamic-labs/midnight — WaasMidnightWalletConnector.js (5.12.2)
getNetworkId() {
  const name = (this.getSelectedNetwork()?.name ?? '').toLowerCase();
  return name.includes('testnet') ? 0 : 1; // 0 = testnet, else mainnet
}
isTestnet() { return /* same includes('testnet') test */; }
```

Midnight's real networks are `mainnet`, `preview`, `preprod`, `undeployed`, and the
package's own `MIDNIGHT_NETWORKS` constant only names `midnight:mainnet` and
`midnight:testnet` (its comment maps them the opposite way round from the function
above — do not trust either, read the value).

**Consequence:** a console network named `Preview` or `Preprod` does not contain
`"testnet"`, so `isTestnet()` returns `false` and `getNetworkId()` returns `1`
(mainnet). Ship a testnet app that gates on `isTestnet()` and it will believe it is on
mainnet.

Do this instead:

```typescript
// Derive the network from the data you control, not from a name heuristic.
const networkId = await wallet.getNetworkId();          // log it once, in every env
const isTest = networkId === 0 && /* your own env flag */ process.env.CHAIN === 'preview';
```

and assert in CI that the staging build reports the staging network before any
transaction is signed.

## Contract calls

```typescript
const provider = await wallet.getWalletProvider(); // midnight-js compatible
```

The embedded wallet acts as the **settlement half** of a call — balancing, paying
DUST, signing, submitting — while your app runs the circuit and generates the proof,
all inside the wallet iframe. If the client build is old you get
`midnight_wallet_provider_unsupported_client` naming the missing RPCs; upgrade
`@dynamic-labs-wallet/browser-wallet-client` rather than working around it.

## Onboarding checklist

- [ ] Enable Midnight **and** Private Key Exports in the console (403 otherwise).
- [ ] Surface **both** the unshielded and shielded address; label which pool a deposit lands in.
- [ ] Fund shielded via a shielded sender — no in-app conversion exists.
- [ ] Register DUST from unshielded NIGHT, then wait (~12h mainnet); show a countdown, not an error.
- [ ] Never gate behavior on `isTestnet()`; resolve the network explicitly and assert it.
- [ ] Poll `dustSyncing` before enabling Send.
- [ ] Price the provider: the free tier is real, but "free to 10,000 MAU" is an
      early-stage program — confirm the rate card in writing before launch.

## Sources

- `npm view @dynamic-labs/midnight` (versions, publish dates, deps) — run it, do not trust this page.
- Dynamic docs: `docs/…/using-wallets/midnight/midnight-embedded-wallets` and `…/using-midnight-wallets` (last modified 2026-09-16).
- Midnight docs: `sdks/community/wallets/community-wallets-integration` (proving models, DUST timing) and `…-reference` (wallet matrix — Dynamic row is stale).
