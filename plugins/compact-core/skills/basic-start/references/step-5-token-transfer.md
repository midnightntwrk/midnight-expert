> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.

## Step 5: Token Transfer

### What this verifies

A NIGHT transfer between two wallets, built and submitted with the wallet SDK's `WalletFacade`.

This step reuses the project from Steps 3-4 and the deployer seed saved in Step 3.

### Procedure

1. **Write a wallet-info script** that creates a wallet or reads one's balances. Create `src/wallet-info.ts`:

   ```typescript
import { randomBytes } from "node:crypto";
import { NIGHT, openWallet } from "./wallet.js";

// Usage: node --import tsx src/wallet-info.ts [seed]
// With a seed, prints that wallet's address and balances. Without one, creates a new wallet.
async function main() {
  const seed = process.argv[2] ?? randomBytes(32).toString("hex");
  if (!process.argv[2]) console.log(`New wallet seed (save this): ${seed}`);
  const wallet = await openWallet(seed);
  const state = await wallet.wallet.waitForSyncedState();
  console.log(`Address: ${wallet.unshieldedKeystore.getBech32Address()}`);
  console.log(`NIGHT:   ${Number(state.unshielded.balances[NIGHT] ?? 0n) / 1e6}`);
  console.log(`DUST:    ${state.dust.balance(new Date())} specks`);
  await wallet.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
   ```

2. **Create a second wallet (the recipient)** by running it with no seed. Save the printed seed and `Address`:

   ```bash
   node --import tsx src/wallet-info.ts
   ```

3. **Write the transfer script.** Create `src/transfer.ts`:

   ```typescript
import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk";
import { NIGHT, openWallet, waitFor } from "./wallet.js";

// Usage: node --import tsx src/transfer.ts <sender-seed> <recipient-address> <amount-in-NIGHT>
async function main() {
  const [seed, recipient, amount] = process.argv.slice(2);
  if (!seed || !recipient || !amount) throw new Error("usage: transfer.ts <sender-seed> <recipient-address> <amount>");
  const micro = BigInt(Math.round(Number(amount) * 1e6));

  const sender = await openWallet(seed);
  // A bech32m address string has to be decoded into an UnshieldedAddress first.
  const receiverAddress = UnshieldedAddress.codec.decode("undeployed", MidnightBech32m.parse(recipient));

  // The fee is paid in DUST, so the sender needs some (Step 3 registered it).
  await waitFor(sender, (s) => s.dust.availableCoins.length > 0, "DUST");
  const recipe = await sender.wallet.transferTransaction(
    [{ type: "unshielded", outputs: [{ type: NIGHT, receiverAddress, amount: micro }] }],
    { ttl: new Date(Date.now() + 30 * 60 * 1000) },
  );
  const signed = await sender.wallet.signRecipe(recipe, sender.unshieldedKeystore.signDataAsync);
  const txId = await sender.wallet.submitTransaction(await sender.wallet.finalizeRecipe(signed));
  console.log(`Transferred ${amount} NIGHT. Transaction: ${txId}`);
  await sender.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
   ```

   A bech32m address string (`mn_addr_undeployed1…`) has to be decoded into an `UnshieldedAddress` before it goes into `transferTransaction`. The fee is paid in DUST, which is why Step 3 registered the deployer's NIGHT.

4. **Send 25 NIGHT** from the deployer to the recipient:

   ```bash
   node --import tsx src/transfer.ts <deployer-seed> <recipient-address> 25
   ```

5. **Check both balances:**

   ```bash
   node --import tsx src/wallet-info.ts <deployer-seed>
   node --import tsx src/wallet-info.ts <recipient-seed>
   ```

> **Expected noise.** The wallet logs some `RPC-CORE: ... disconnected ... Normal Closure` lines, and occasionally `API/INIT: Error: FATAL: Unable to initialize the API: WebSocket is not connected`. Both come from testkit's node connection being opened and closed; the script carries on and finishes. A fresh wallet syncs from genesis each run, and loading the SDK takes a while, so expect a minute or more per script.

### Expected output

The transfer prints a transaction id. The deployer shows `NIGHT:   9975` (fees come out of DUST, not NIGHT) and the recipient shows `NIGHT:   25`.

> **If anything errors,** your first stop is `/midnight-status-codes:lookup <code>`.

> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.
