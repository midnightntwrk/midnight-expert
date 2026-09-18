> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.

## Step 3: Wallet Setup

### What this verifies

Wallet creation, NIGHT token funding from the genesis wallet, and DUST registration all work on the local devnet — driven entirely by the Midnight SDK (no extra tooling required).

### Procedure

1. Verify the indexer is synced before proceeding. Use the block-height comparison from Step 1:

   Node height:

   ```bash
   curl -sf -X POST http://localhost:9944 \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"chain_getHeader","params":[]}' \
     | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result']['number'],16))"
   ```

   Indexer height:

   ```bash
   curl -sf -X POST http://localhost:8088/api/v4/graphql \
     -H "Content-Type: application/json" \
     -d '{"query": "{ block { height } }"}' \
     | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['block']['height'])"
   ```

   Heights should be within 1-2 blocks. If not, wait and re-check.

2. **Set up the Node.js project.** This project is shared by Steps 3-6, so install everything once now. From the working directory (`/tmp/midnight-basic-start`):

   Create `package.json`:

   ```json
   {
     "name": "midnight-basic-start",
     "version": "0.1.0",
     "type": "module",
     "scripts": {
       "setup": "node --import tsx src/setup-deployer.ts"
     },
     "dependencies": {
       "@midnight-ntwrk/compact-js": "2.5.1",
       "@midnight-ntwrk/compact-runtime": "0.16.0",
       "@midnight-ntwrk/ledger-v8": "8.1.0",
       "@midnight-ntwrk/midnight-js-contracts": "4.1.1",
       "@midnight-ntwrk/midnight-js-http-client-proof-provider": "4.1.1",
       "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "4.1.1",
       "@midnight-ntwrk/midnight-js-level-private-state-provider": "4.1.1",
       "@midnight-ntwrk/midnight-js-network-id": "4.1.1",
       "@midnight-ntwrk/midnight-js-node-zk-config-provider": "4.1.1",
       "@midnight-ntwrk/midnight-js-types": "4.1.1",
       "@midnightntwrk/wallet-sdk-abstractions": "2.1.0",
       "@midnightntwrk/wallet-sdk-address-format": "3.1.2",
       "@midnightntwrk/wallet-sdk-dust-wallet": "4.1.0",
       "@midnightntwrk/wallet-sdk-facade": "4.0.1",
       "@midnightntwrk/wallet-sdk-hd": "3.0.2",
       "@midnightntwrk/wallet-sdk-shielded": "3.0.1",
       "@midnightntwrk/wallet-sdk-unshielded-wallet": "3.1.0",
       "rxjs": "^7.8.0",
       "ws": "^8.18.0"
     },
     "devDependencies": {
       "@types/ws": "^8.5.0",
       "tsx": "^4.0.0",
       "typescript": "^5.5.0"
     }
   }
   ```

   Install:

   ```bash
   mkdir -p src
   npm install
   ```

3. **Write the setup script.** Create `src/setup-deployer.ts`. In one run it generates a fresh "deployer" wallet, funds it with 10,000 NIGHT from the local genesis wallet, registers its NIGHT for DUST generation, and prints the seed + address + balances:

   ```typescript
   import WebSocket from "ws";
   (globalThis as any).WebSocket = WebSocket;

   import { Buffer } from "buffer";
   import {
     HDWallet,
     Roles,
     generateRandomSeed,
   } from "@midnightntwrk/wallet-sdk-hd";
   import {
     WalletFacade,
     WalletEntrySchema,
     type DefaultConfiguration,
     type CombinedTokenTransfer,
     type UtxoWithMeta,
   } from "@midnightntwrk/wallet-sdk-facade";
   import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
   import {
     UnshieldedWallet,
     createKeystore,
     PublicKey,
   } from "@midnightntwrk/wallet-sdk-unshielded-wallet";
   import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
   import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
   import * as ledger from "@midnight-ntwrk/ledger-v8";
   import {
     MidnightBech32m,
     UnshieldedAddress,
   } from "@midnightntwrk/wallet-sdk-address-format";
   import { firstValueFrom } from "rxjs";
   import { filter, timeout } from "rxjs/operators";

   // The local-devnet genesis seed. The dev preset pre-mints NIGHT to the wallet
   // derived from this seed.
   const GENESIS_SEED_HEX =
     "0000000000000000000000000000000000000000000000000000000000000001";
   const FUND_AMOUNT = 10_000_000_000n; // 10,000 NIGHT in micro-NIGHT
   const BALANCE_WAIT_MS = 120_000;

   function buildKeysFromSeed(seed: Uint8Array) {
     const hd = HDWallet.fromSeed(seed);
     if (hd.type !== "seedOk") throw new Error(`HDWallet.fromSeed failed: ${hd.type}`);
     const derived = hd.hdWallet
       .selectAccount(0)
       .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust] as const)
       .deriveKeysAt(0);
     if (derived.type !== "keysDerived") throw new Error(`deriveKeysAt failed: ${derived.type}`);
     hd.hdWallet.clear();
     const k = derived.keys as Record<number, Uint8Array>;
     return {
       shieldedSecretKeys: ledger.ZswapSecretKeys.fromSeed(k[Roles.Zswap]),
       dustSecretKey: ledger.DustSecretKey.fromSeed(k[Roles.Dust]),
       unshieldedKeystore: createKeystore(k[Roles.NightExternal], "undeployed"),
     };
   }

   // `additionalFeeOverhead` keeps the fee non-zero on the idle devnet so a spend
   // is not rejected as NotNormalized (error 117). Pass it for a wallet that
   // SPENDS (the genesis sender). The deployer only registers DUST, which is
   // self-funding, so it needs no overhead.
   function buildConfiguration(additionalFeeOverhead?: bigint): DefaultConfiguration {
     const costParameters: DefaultConfiguration["costParameters"] = { feeBlocksMargin: 5 };
     if (additionalFeeOverhead !== undefined) costParameters.additionalFeeOverhead = additionalFeeOverhead;
     return {
       networkId: "undeployed",
       costParameters,
       relayURL: new URL("ws://localhost:9944"),
       provingServerUrl: new URL("http://localhost:6300"),
       indexerClientConnection: {
         indexerHttpUrl: "http://localhost:8088/api/v4/graphql",
         indexerWsUrl: "ws://localhost:8088/api/v4/graphql/ws",
       },
       txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
     };
   }

   async function initWallet(
     configuration: DefaultConfiguration,
     shieldedSecretKeys: ledger.ZswapSecretKeys,
     dustSecretKey: ledger.DustSecretKey,
     unshieldedKeystore: ReturnType<typeof createKeystore>,
   ): Promise<WalletFacade> {
     const wallet = await WalletFacade.init({
       configuration,
       shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
       unshielded: (cfg) =>
         UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
       dust: (cfg) =>
         DustWallet(cfg).startWithSecretKey(
           dustSecretKey,
           ledger.LedgerParameters.initialParameters().dust,
         ),
     });
     await wallet.start(shieldedSecretKeys, dustSecretKey);
     return wallet;
   }

   async function main() {
     const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;

     // 1. Generate the deployer wallet seed
     const deployerSeed = generateRandomSeed();
     const deployerSeedHex = Buffer.from(deployerSeed).toString("hex");
     console.log(`Deployer seed (save this): ${deployerSeedHex}`);

     // 2. Build + sync the deployer wallet (no fee overhead — it only registers DUST)
     const deployer = buildKeysFromSeed(deployerSeed);
     console.log("Initializing deployer wallet...");
     const deployerWallet = await initWallet(
       buildConfiguration(),
       deployer.shieldedSecretKeys,
       deployer.dustSecretKey,
       deployer.unshieldedKeystore,
     );
     console.log("Syncing deployer wallet...");
     const deployerInit = await deployerWallet.waitForSyncedState();
     const deployerAddress = MidnightBech32m.encode("undeployed", deployerInit.unshielded.address).asString();
     console.log(`Deployer unshielded address: ${deployerAddress}`);

     // 3. Build the genesis wallet (it SPENDS, so it needs a fee overhead) and
     //    transfer 10,000 NIGHT to the deployer
     console.log("Initializing genesis wallet...");
     const genesis = buildKeysFromSeed(Buffer.from(GENESIS_SEED_HEX, "hex"));
     const genesisWallet = await initWallet(
       buildConfiguration(300_000_000_000_000n),
       genesis.shieldedSecretKeys,
       genesis.dustSecretKey,
       genesis.unshieldedKeystore,
     );
     await genesisWallet.waitForSyncedState();

     const recipient = MidnightBech32m.parse(deployerAddress).decode(UnshieldedAddress, "undeployed");
     const outputs: CombinedTokenTransfer[] = [{
       type: "unshielded",
       outputs: [{ type: NIGHT_TOKEN_TYPE, receiverAddress: recipient, amount: FUND_AMOUNT }],
     }];
     console.log(`Transferring ${Number(FUND_AMOUNT) / 1_000_000} NIGHT to deployer...`);
     const recipe = await genesisWallet.transferTransaction(
       outputs,
       { shieldedSecretKeys: genesis.shieldedSecretKeys, dustSecretKey: genesis.dustSecretKey },
       { ttl: new Date(Date.now() + 60 * 60 * 1000), payFees: true },
     );
     const signed = await genesisWallet.signRecipe(recipe, (p) => genesis.unshieldedKeystore.signData(p));
     const fundTxId = await genesisWallet.submitTransaction(await genesisWallet.finalizeRecipe(signed));
     console.log(`Fund transaction ID: ${fundTxId}`);
     await genesisWallet.stop();

     // 4. Wait for the deployer to receive the NIGHT
     console.log("Waiting for deployer to receive NIGHT...");
     let nightBalance = 0n;
     try {
       const funded = await firstValueFrom(
         deployerWallet.state().pipe(
           filter((s) => (s.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n) >= FUND_AMOUNT),
           timeout(BALANCE_WAIT_MS),
         ),
       );
       nightBalance = funded.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
     } catch {
       nightBalance = (await deployerWallet.waitForSyncedState()).unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
     }
     console.log(`Deployer NIGHT balance: ${Number(nightBalance) / 1_000_000} NIGHT`);

     // 5. Register the deployer's NIGHT UTXOs for DUST generation
     const fresh = await deployerWallet.waitForSyncedState();
     const nightUtxos: readonly UtxoWithMeta[] = fresh.unshielded.availableCoins.filter(
       (coin) => coin.utxo.type === NIGHT_TOKEN_TYPE && coin.meta.registeredForDustGeneration === false,
     );
     console.log(`NIGHT UTXOs to register: ${nightUtxos.length}`);
     if (nightUtxos.length === 0) {
       console.error("No NIGHT UTXOs available for DUST registration.");
       await deployerWallet.stop();
       process.exit(1);
     }
     const regRecipe = await deployerWallet.registerNightUtxosForDustGeneration(
       nightUtxos,
       deployer.unshieldedKeystore.getPublicKey(),
       (p) => deployer.unshieldedKeystore.signData(p),
     );
     const dustTxId = await deployerWallet.submitTransaction(await deployerWallet.finalizeRecipe(regRecipe));
     console.log(`DUST registration TX: ${dustTxId}`);

     // 6. Wait for DUST to accrue
     console.log("Waiting for DUST balance > 0...");
     let dustBalance = 0n;
     try {
       const dustState = await firstValueFrom(
         deployerWallet.state().pipe(
           filter((s) => s.dust.balance(new Date()) > 0n),
           timeout(BALANCE_WAIT_MS),
         ),
       );
       dustBalance = dustState.dust.balance(new Date());
     } catch {
       console.log("Note: DUST balance still 0 after timeout. It may accrue as more blocks are produced.");
     }

     console.log("============================================================");
     console.log(`Deployer seed hex:    ${deployerSeedHex}`);
     console.log(`Deployer address:     ${deployerAddress}`);
     console.log(`NIGHT balance:        ${Number(nightBalance) / 1_000_000} NIGHT`);
     console.log(`DUST balance:         ${dustBalance}`);
     console.log("============================================================");

     await deployerWallet.stop();
     process.exit(0);
   }

   main().catch((e) => { console.error("Fatal error:", e); process.exit(1); });
   ```

4. **Run the setup script:**

   ```bash
   node --import tsx src/setup-deployer.ts
   ```

   Use `node --import tsx` not `npx tsx` — some `@midnightntwrk/wallet-sdk-*` packages have ESM export issues with tsx's CJS loader.

5. **Save the printed `Deployer seed hex`.** You will paste it into the deploy and transfer scripts in Steps 4 and 5. The wallet's funds live on-chain, so re-deriving from this seed reconnects to the same funded wallet.

### Expected output

The script prints a deployer seed and address, a fund transaction ID, a DUST registration transaction ID, and a summary showing `NIGHT balance: 10000` with a positive `DUST balance`.

> **If anything errors,** your first stop is `/midnight-status-codes:lookup <code>`. A node rejection like `1010: Custom error: 117` means the fee computed to zero — confirm `additionalFeeOverhead` is set on the spending (genesis) wallet. DUST registration is self-funding and needs no overhead.

> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.
