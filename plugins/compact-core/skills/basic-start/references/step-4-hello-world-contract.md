> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.

## Step 4: Hello World Contract

### What this verifies

The full Compact contract lifecycle works: write, compile, deploy to the devnet, call a circuit, and read the on-chain state back.

> This mirrors the hello-world example in [midnightntwrk/midnight-examples](https://github.com/midnightntwrk/midnight-examples): the wallet comes from testkit's `FluentWalletBuilder`, and deploy and call go through `deployContract` / `submitCallTx`. It uses the pre-funded genesis wallet (seed `0000…0001`), so it doesn't depend on the deployer from Step 3.

### Procedure

**4.1. Write the contract.** Create `contracts/hello-world.compact`:

```compact
pragma language_version 0.28;

export ledger message: Opaque<"string">;

export circuit storeMessage(newMessage: Opaque<"string">): [] {
  message = disclose(newMessage);
}
```

- `ledger message` is a public, persistent on-chain state variable holding a string.
- `storeMessage` is a circuit that writes its argument into the ledger.
- Circuit parameters are **private by default**; `disclose()` marks the value as safe to store publicly. Without it, assigning `newMessage` to the ledger is a compile error.

**4.2. Compile** (with ZK keys, since we deploy it):

```bash
compact compile contracts/hello-world.compact contracts/managed/hello-world
```

`contracts/managed/hello-world/keys/` should now hold `storeMessage.prover` and `storeMessage.verifier`.

**4.3. Bind the compiled contract.** Create `contracts/hello-world.ts`. It wraps the generated `Contract` class in a `CompiledContract` with its keys and (no) witnesses:

```typescript
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract } from "./managed/hello-world/contract/index.js";

export { Contract, ledger } from "./managed/hello-world/contract/index.js";

export const zkConfigPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "managed", "hello-world");

// Binds the compiled contract to its keys and (no) witnesses.
export const CompiledHelloWorld = CompiledContract.make("HelloWorld", Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
```

**4.4. Write the providers helper.** Create `src/providers.ts`. midnight-js needs these to deploy and call a contract, and Step 6 reuses it:

```typescript
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import type { MidnightWalletProvider } from "@midnight-ntwrk/testkit-js";
import { env } from "./wallet.js";

// The providers midnight-js needs to deploy and call a contract. The wallet
// provider both balances (pays DUST fees for) and submits transactions.
// K is the contract's circuit names, e.g. "storeMessage".
export function buildProviders<K extends string>(wallet: MidnightWalletProvider, zkConfigPath: string, storeName: string) {
  const zkConfigProvider = new NodeZkConfigProvider<K>(zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider<string, any>({
      privateStateStoreName: storeName,
      privateStoragePasswordProvider: () => "Basic-Start-Local-Password",
      accountId: wallet.getCoinPublicKey(),
    }),
    publicDataProvider: indexerPublicDataProvider(env.indexer, env.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(env.proofServer, zkConfigProvider),
    walletProvider: wallet,
    midnightProvider: wallet,
    config: { networkId: env.networkId, ttlSeconds: 3600 },
  };
}
```

**4.5. Deploy, call and read back.** Create `src/hello-world.ts`:

```typescript
import { deployContract, submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import { GENESIS_SEED, openWallet } from "./wallet.js";
import { buildProviders } from "./providers.js";
import { CompiledHelloWorld, ledger, zkConfigPath } from "../contracts/hello-world.js";

async function main() {
  // Alice, the pre-funded genesis wallet: no funding step needed here.
  const alice = await openWallet(GENESIS_SEED);
  const providers = buildProviders<"storeMessage">(alice, zkConfigPath, `hello-world-${Date.now()}`);

  const deployed = await deployContract(providers, {
    compiledContract: CompiledHelloWorld,
    privateStateId: "helloWorldState",
    initialPrivateState: {},
  });
  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log(`Deployed at: ${contractAddress}`);

  const call = await submitCallTx(providers, {
    compiledContract: CompiledHelloWorld,
    contractAddress,
    privateStateId: "helloWorldState",
    circuitId: "storeMessage",
    args: ["Hello World!"],
  });
  console.log(`storeMessage tx: ${call.public.txId}`);

  // Read the ledger back from the indexer.
  const read = await providers.publicDataProvider.queryContractState(contractAddress);
  if (read === null || read.contractState.era !== "v9") throw new Error("no ledger 9 contract state");
  console.log(`On-chain message: ${ledger(read.contractState.deserialize({ v9: ContractState }).data).message}`);

  await alice.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
```

**4.6. Run it:**

```bash
node --import tsx src/hello-world.ts
```

> **Expected noise.** The wallet logs some `RPC-CORE: ... disconnected ... Normal Closure` lines, and occasionally `API/INIT: Error: FATAL: Unable to initialize the API: WebSocket is not connected`. Both come from testkit's node connection being opened and closed; the script carries on and finishes. A fresh wallet syncs from genesis each run, and loading the SDK takes a while, so expect a minute or more per script. Proving the deploy and the call adds a little more.

### Expected output

```
Deployed at: <contract address>
storeMessage tx: <transaction id>
On-chain message: Hello World!
```

> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.
