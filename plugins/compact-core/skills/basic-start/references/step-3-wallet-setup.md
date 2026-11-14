> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.

## Step 3: Wallet Setup

### What this verifies

Wallet creation, NIGHT funding from the genesis wallet, and DUST registration all work on the local devnet, using the Midnight SDK (midnight-js 5, wallet SDK 2.0.0, testkit).

### Procedure

1. Verify the indexer is synced before proceeding. Use the block-height comparison from Step 1 and check the heights are within 1-2 blocks.

2. **Set up the Node.js project.** Steps 3-6 share this one project, so install everything once now. From the working directory (`/tmp/midnight-basic-start`), create `package.json`:

   ```json
{
  "name": "midnight-basic-start",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@midnight-ntwrk/midnight-js-contracts": "5.0.0",
    "@midnight-ntwrk/midnight-js-http-client-proof-provider": "5.0.0",
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "5.0.0",
    "@midnight-ntwrk/midnight-js-level-private-state-provider": "5.0.0",
    "@midnight-ntwrk/midnight-js-node-zk-config-provider": "5.0.0",
    "@midnight-ntwrk/midnight-js-protocol": "5.0.0",
    "@midnight-ntwrk/midnight-js-types": "5.0.0",
    "@midnight-ntwrk/midnight-js-utils": "5.0.0",
    "@midnight-ntwrk/testkit-js": "5.0.0",
    "@midnightntwrk/wallet-sdk": "2.0.0",
    "pino": "^9.0.0",
    "rxjs": "^7.8.2",
    "ws": "^8.14.2"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.9",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
   ```

   Install:

   ```bash
   mkdir -p src contracts
   npm install
   ```

   These are the versions the networks' support matrix lists for ledger 9 (Mainnet, Preview and Preprod). midnight-js 5 refuses to deploy a contract whose ledger doesn't match the network's, so keep them together.

3. **Write the shared wallet helper.** Create `src/wallet.ts`. Every later step imports it: it holds the devnet endpoints, builds and syncs a wallet from a seed, and waits for a balance.

   ```typescript
import { WebSocket } from "ws";
(globalThis as any).WebSocket = WebSocket;

import {
  FluentWalletBuilder,
  MidnightWalletProvider,
  logger as testkitLogger,
  syncWallet,
  type EnvironmentConfiguration,
} from "@midnight-ntwrk/testkit-js";
import { unshieldedToken } from "@midnight-ntwrk/midnight-js-protocol/v9";
import type { FacadeState } from "@midnightntwrk/wallet-sdk";
import pino from "pino";
import * as Rx from "rxjs";

testkitLogger.level = "warn";

// The local devnet started in Step 1. Its network id is "undeployed".
export const env: EnvironmentConfiguration = {
  walletNetworkId: "undeployed",
  networkId: "undeployed",
  indexer: "http://127.0.0.1:8088/api/v4/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
  node: "http://127.0.0.1:9944",
  nodeWS: "ws://127.0.0.1:9944",
  proofServer: process.env.MIDNIGHT_PROOF_SERVER ?? "http://127.0.0.1:6300",
  faucet: undefined,
};

// The dev preset pre-mints NIGHT (with DUST already generating) to this seed.
export const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";

// NIGHT's raw token type, the key of every NIGHT balance and coin.
export const NIGHT = unshieldedToken().raw;

const WAIT_MS = 180_000;
const logger = pino({ level: "warn" });

// Build, start and sync a wallet from a 32-byte hex seed.
export async function openWallet(seed: string): Promise<MidnightWalletProvider> {
  const { wallet, seeds, keystore } = await FluentWalletBuilder.forEnvironment(env)
    .withSeed(seed)
    .buildWithoutStarting();
  const provider = await MidnightWalletProvider.withWallet(logger, env, wallet, seeds, keystore);
  await provider.start(false);
  await syncWallet(provider.wallet, 0, WAIT_MS);
  return provider;
}

// Resolve with the first wallet state that satisfies `ok`.
export function waitFor(wallet: MidnightWalletProvider, ok: (s: FacadeState) => boolean, what: string) {
  return Rx.firstValueFrom(
    wallet.wallet.state().pipe(
      Rx.filter(ok),
      Rx.take(1),
      Rx.timeout({ each: WAIT_MS, with: () => Rx.throwError(() => new Error(`timed out waiting for ${what}`)) }),
    ),
  );
}
   ```

   If your proof server isn't on port 6300, set `MIDNIGHT_PROOF_SERVER`, e.g. `MIDNIGHT_PROOF_SERVER=http://127.0.0.1:6301`.

4. **Write the setup script.** Create `src/setup-deployer.ts`. In one run it creates a fresh "deployer" wallet, sends it 10,000 NIGHT from the genesis wallet, registers that NIGHT for DUST generation, and waits until DUST is spendable:

   ```typescript
import { randomBytes } from "node:crypto";
import { UnshieldedAddress } from "@midnightntwrk/wallet-sdk";
import { GENESIS_SEED, NIGHT, openWallet, waitFor } from "./wallet.js";

const FUND_AMOUNT = 10_000_000_000n; // 10,000 NIGHT in micro-NIGHT

async function main() {
  // 1. A fresh deployer wallet
  const deployerSeed = randomBytes(32).toString("hex");
  const deployer = await openWallet(deployerSeed);
  console.log(`Deployer address: ${deployer.unshieldedKeystore.getBech32Address()}`);

  // 2. Send it 10,000 NIGHT from the genesis wallet:
  //    transferTransaction -> signRecipe -> finalizeRecipe -> submitTransaction
  const genesis = await openWallet(GENESIS_SEED);
  const receiverAddress = UnshieldedAddress.codec.decode("undeployed", deployer.unshieldedKeystore.getBech32Address());
  const recipe = await genesis.wallet.transferTransaction(
    [{ type: "unshielded", outputs: [{ type: NIGHT, receiverAddress, amount: FUND_AMOUNT }] }],
    { ttl: new Date(Date.now() + 30 * 60 * 1000) },
  );
  const signed = await genesis.wallet.signRecipe(recipe, genesis.unshieldedKeystore.signDataAsync);
  console.log(`Fund transaction: ${await genesis.wallet.submitTransaction(await genesis.wallet.finalizeRecipe(signed))}`);
  await genesis.stop();

  const funded = await waitFor(deployer, (s) => (s.unshielded.balances[NIGHT] ?? 0n) >= FUND_AMOUNT, "NIGHT");

  // 3. Register the deployer's NIGHT for DUST generation. Registration pays its
  //    own fee from the DUST it starts generating, so the wallet needs no DUST yet.
  const night = funded.unshielded.availableCoins.filter(
    (coin) => coin.utxo.type === NIGHT && !coin.meta.registeredForDustGeneration,
  );
  const reg = await deployer.wallet.registerNightUtxosForDustGeneration(
    night,
    deployer.unshieldedKeystore.getPublicKey(),
    deployer.unshieldedKeystore.signDataAsync,
  );
  console.log(`DUST registration: ${await deployer.wallet.submitTransaction(await deployer.wallet.finalizeRecipe(reg))}`);

  // 4. Wait for a spendable DUST coin
  const ready = await waitFor(deployer, (s) => s.dust.availableCoins.length > 0, "DUST");

  console.log("============================================================");
  console.log(`Deployer seed:  ${deployerSeed}`);
  console.log(`NIGHT balance:  ${Number(ready.unshielded.balances[NIGHT]) / 1e6}`);
  console.log(`DUST balance:   ${ready.dust.balance(new Date())} specks`);
  console.log("============================================================");
  await deployer.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
   ```

   A transfer always goes `transferTransaction` → `signRecipe` → `finalizeRecipe` → `submitTransaction`. The wallet holds its own keys once started, so none of these calls take secret keys; signing uses the keystore's `signDataAsync`.

5. **Run it:**

   ```bash
   node --import tsx src/setup-deployer.ts
   ```

6. **Save the printed `Deployer seed`.** Step 5 uses it. The funds live on-chain, so the same seed always reopens the same funded wallet.

> **Expected noise.** The wallet logs some `RPC-CORE: ... disconnected ... Normal Closure` lines, and occasionally `API/INIT: Error: FATAL: Unable to initialize the API: WebSocket is not connected`. Both come from testkit's node connection being opened and closed; the script carries on and finishes. A fresh wallet syncs from genesis each run, and loading the SDK takes a while, so expect a minute or more per script.

### Expected output

A fund transaction id, a DUST registration transaction id, then a summary with the deployer seed, `NIGHT balance:  10000` and a positive `DUST balance`.

> **If anything errors,** your first stop is `/midnight-status-codes:lookup <code>`.

> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.
