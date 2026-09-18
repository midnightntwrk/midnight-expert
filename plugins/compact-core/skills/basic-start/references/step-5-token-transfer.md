> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.

## Step 5: Token Transfer

### What this verifies

Programmatic NIGHT token transfers between wallets using the `WalletFacade` SDK.

This step reuses the project and dependencies from Steps 3-4 (`@midnightntwrk/wallet-sdk-*` and `@midnightntwrk/wallet-sdk-address-format` are already installed) and the deployer seed saved in Step 3.

### Procedure

1. **Write a small wallet-info script** you can reuse to create a wallet and to read balances. Create `src/wallet-info.ts`:

   ```typescript
   import WebSocket from "ws";
   (globalThis as any).WebSocket = WebSocket;

   import { Buffer } from "buffer";
   import { HDWallet, Roles, generateRandomSeed } from "@midnightntwrk/wallet-sdk-hd";
   import {
     WalletFacade,
     WalletEntrySchema,
     type DefaultConfiguration,
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
   import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";

   // Optional seed arg. With no arg, generates a fresh wallet and prints the seed.
   let seedHex = process.argv[2];
   if (!seedHex) {
     seedHex = Buffer.from(generateRandomSeed()).toString("hex");
     console.log(`New wallet seed (save this): ${seedHex}`);
   }

   function buildKeysFromSeed(hex: string) {
     const hd = HDWallet.fromSeed(Buffer.from(hex, "hex"));
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

   const configuration: DefaultConfiguration = {
     networkId: "undeployed",
     costParameters: { feeBlocksMargin: 5 },
     relayURL: new URL("ws://localhost:9944"),
     provingServerUrl: new URL("http://localhost:6300"),
     indexerClientConnection: {
       indexerHttpUrl: "http://localhost:8088/api/v4/graphql",
       indexerWsUrl: "ws://localhost:8088/api/v4/graphql/ws",
     },
     txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
   };

   async function main() {
     const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
     const keys = buildKeysFromSeed(seedHex);
     const wallet = await WalletFacade.init({
       configuration,
       shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(keys.shieldedSecretKeys),
       unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keys.unshieldedKeystore)),
       dust: (cfg) => DustWallet(cfg).startWithSecretKey(keys.dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
     });
     try {
       await wallet.start(keys.shieldedSecretKeys, keys.dustSecretKey);
       const state = await wallet.waitForSyncedState();
       const address = MidnightBech32m.encode("undeployed", state.unshielded.address).asString();
       const night = state.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
       const dust = state.dust.balance(new Date());
       console.log(`Address:       ${address}`);
       console.log(`NIGHT balance: ${Number(night) / 1_000_000}`);
       console.log(`DUST balance:  ${dust}`);
     } finally {
       await wallet.stop();
     }
   }
   main().catch((e) => { console.error("Failed:", e); process.exit(1); });
   ```

2. **Create a second wallet (`alice`)** by running the script with no seed argument. **Save the printed seed and address** — you need alice's address as the transfer recipient:

   ```bash
   node --import tsx src/wallet-info.ts
   ```

3. **Check the deployer's balance** by running the same script with the deployer seed from Step 3:

   ```bash
   node --import tsx src/wallet-info.ts <deployer-seed>
   ```

   It should show roughly 10000 NIGHT and a positive DUST balance.

4. **Write the transfer script.** Create `src/transfer.ts`:

   ```typescript
   import WebSocket from "ws";
   (globalThis as any).WebSocket = WebSocket;

   import { Buffer } from "buffer";
   import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
   import {
     WalletFacade,
     WalletEntrySchema,
     type DefaultConfiguration,
     type CombinedTokenTransfer,
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
   import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk-address-format";

   const SENDER_SEED = process.argv[2];
   const RECIPIENT_ADDRESS = process.argv[3];
   const AMOUNT = process.argv[4];
   if (!SENDER_SEED || !RECIPIENT_ADDRESS || !AMOUNT) {
     console.error("Usage: node --import tsx src/transfer.ts <sender-seed> <recipient-address> <amount-night>");
     process.exit(1);
   }
   const amountMicroNight = BigInt(Math.round(parseFloat(AMOUNT) * 1_000_000));

   function buildKeysFromSeed(hex: string) {
     const hd = HDWallet.fromSeed(Buffer.from(hex, "hex"));
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

   const configuration: DefaultConfiguration = {
     networkId: "undeployed",
     // The sender spends, so additionalFeeOverhead keeps the fee non-zero on the
     // idle devnet (a zero fee is rejected as NotNormalized, error 117).
     costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 300_000_000_000_000n },
     relayURL: new URL("ws://localhost:9944"),
     provingServerUrl: new URL("http://localhost:6300"),
     indexerClientConnection: {
       indexerHttpUrl: "http://localhost:8088/api/v4/graphql",
       indexerWsUrl: "ws://localhost:8088/api/v4/graphql/ws",
     },
     txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
   };

   async function main() {
     const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
     const keys = buildKeysFromSeed(SENDER_SEED);
     const wallet = await WalletFacade.init({
       configuration,
       shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(keys.shieldedSecretKeys),
       unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keys.unshieldedKeystore)),
       dust: (cfg) => DustWallet(cfg).startWithSecretKey(keys.dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
     });
     try {
       await wallet.start(keys.shieldedSecretKeys, keys.dustSecretKey);
       const state = await wallet.waitForSyncedState();
       const balance = state.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
       console.log(`Sender NIGHT balance: ${Number(balance) / 1_000_000}`);
       if (balance < amountMicroNight) throw new Error("Insufficient balance for transfer");

       // Bech32m addresses must be decoded before passing to transferTransaction
       const recipient = MidnightBech32m.parse(RECIPIENT_ADDRESS).decode(UnshieldedAddress, "undeployed");
       const outputs: CombinedTokenTransfer[] = [{
         type: "unshielded",
         outputs: [{ type: NIGHT_TOKEN_TYPE, receiverAddress: recipient, amount: amountMicroNight }],
       }];

       // Flow: transferTransaction -> signRecipe -> finalizeRecipe -> submitTransaction
       const recipe = await wallet.transferTransaction(
         outputs,
         { shieldedSecretKeys: keys.shieldedSecretKeys, dustSecretKey: keys.dustSecretKey },
         { ttl: new Date(Date.now() + 60 * 60 * 1000), payFees: true },
       );
       const signed = await wallet.signRecipe(recipe, (p) => keys.unshieldedKeystore.signData(p));
       const txId = await wallet.submitTransaction(await wallet.finalizeRecipe(signed));
       console.log(`Transfer submitted: ${txId}`);
     } finally {
       await wallet.stop();
     }
   }
   main().catch((e) => { console.error("Transfer failed:", e); process.exit(1); });
   ```

   Key points:
   - Bech32m addresses are decoded before use: `MidnightBech32m.parse(address).decode(UnshieldedAddress, "undeployed")`.
   - Transfer amounts are micro-NIGHT (1 NIGHT = 1,000,000) as `bigint`.
   - The sender needs `additionalFeeOverhead` set (the deployer registered DUST in Step 3, so it can pay the fee).

5. **Run the transfer** (replace `<deployer-seed>` with the seed from Step 3, and `<alice-address>` with alice's address from sub-step 2):

   ```bash
   node --import tsx src/transfer.ts <deployer-seed> <alice-address> 25
   ```

   Use `node --import tsx` not `npx tsx` — some `@midnightntwrk/wallet-sdk-*` packages have ESM export issues with tsx's CJS loader.

6. **Verify both balances** with the wallet-info script — once with the deployer seed (down by ~25 plus fees) and once with alice's seed (now holds 25 NIGHT):

   ```bash
   node --import tsx src/wallet-info.ts <deployer-seed>
   node --import tsx src/wallet-info.ts <alice-seed>
   ```

### Expected output

A transfer tx id is printed. The deployer's NIGHT balance has decreased by 25 (plus fees), and alice's NIGHT balance is 25.

> **If anything errors,** your first stop is `/midnight-status-codes:lookup <code>`. A `1010: Custom error: 117` on submission means the fee computed to zero — confirm the sender's `additionalFeeOverhead` is set and the sender has accrued DUST.

> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.
