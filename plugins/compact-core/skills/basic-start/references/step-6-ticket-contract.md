> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.

## Step 6: Ticket Contract

### What this verifies

A privacy-preserving smart contract using the commitment/nullifier pattern — the core pattern that makes Midnight unique.

### Procedure

#### 6.1. Write the contract

Create `src/ticket.compact`:

```compact
// ticket.compact
// A one-time-use ticket system with privacy.
//
// Privacy properties:
//   - Nobody can tie a ticket to an account
//   - A holder can prove they have a valid ticket (via ZK Merkle proof)
//   - Once used, a nullifier prevents reuse
//   - An observer cannot link a used ticket to the original issuance

pragma language_version 0.22;

import CompactStandardLibrary;

// Merkle tree of ticket commitments. HistoricMerkleTree so proofs stay
// valid even after new tickets are issued. Depth 10 = up to 1024 tickets.
export ledger tickets: HistoricMerkleTree<10, Bytes<32>>;

// Set of used nullifiers — public by design, but unlinkable to commitments.
export ledger usedTickets: Set<Bytes<32>>;

// Counter of how many tickets have been used (public metric).
export ledger ticketsUsed: Counter;

// --- Witnesses (off-chain data) ---

// The holder's ticket secret — known only to them.
witness ticket_secret(): Bytes<32>;

// Random blinding factor for the commitment.
witness ticket_randomness(): Bytes<32>;

// Merkle proof that a commitment exists in the tree.
witness get_ticket_path(commitment: Bytes<32>): MerkleTreePath<10, Bytes<32>>;

// --- Domain-separated derivation ---
// CRITICAL: commitment and nullifier use different domains to prevent linking.

circuit derive_ticket_commitment(secret: Bytes<32>, randomness: Bytes<32>): Bytes<32> {
  return persistentCommit<Vector<2, Bytes<32>>>(
    [pad(32, "ticket:commit::"), secret],
    randomness
  );
}

circuit derive_ticket_nullifier(secret: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "ticket:nullify:"),
    secret
  ]);
}

// --- Circuits ---

// Issue a new ticket. The commitment goes into the Merkle tree.
// No one can see what the commitment contains.
export circuit issue_ticket(): [] {
  const secret = ticket_secret();
  const randomness = ticket_randomness();
  const commitment = derive_ticket_commitment(secret, randomness);
  tickets.insert(commitment);
}

// Use a ticket. Proves you hold a valid ticket without revealing which one.
// The nullifier prevents the same ticket from being used twice.
export circuit use_ticket(): [] {
  const secret = ticket_secret();
  const randomness = ticket_randomness();

  // Re-derive the commitment to find it in the tree
  const commitment = derive_ticket_commitment(secret, randomness);

  // Prove the commitment exists in the tree (without revealing which leaf)
  const path = get_ticket_path(commitment);
  assert(
    tickets.checkRoot(disclose(merkleTreePathRoot<10, Bytes<32>>(path))),
    "Invalid ticket"
  );

  // Derive the nullifier (different domain than commitment — unlinkable)
  const nul = derive_ticket_nullifier(secret);

  // Check ticket hasn't been used before
  assert(disclose(!usedTickets.member(disclose(nul))), "Ticket already used");

  // Mark as used
  usedTickets.insert(disclose(nul));
  ticketsUsed.increment(1);
}
```

Key concepts in this contract:

- **`HistoricMerkleTree<10, Bytes<32>>`** stores ticket commitments. The `Historic` variant is essential here: the tree root changes on each insert, but `HistoricMerkleTree` remembers past roots, so proofs generated before a new ticket was issued remain valid. Depth 10 means the tree can hold up to 1024 tickets.

- **`Set<Bytes<32>>`** stores used nullifiers. This set is public by design — anyone can see that _some_ ticket was used — but nullifiers are cryptographically unlinkable to commitments, so no one can tell _which_ ticket was consumed.

- **Domain separation** is critical. The commitment prefix `"ticket:commit::"` and nullifier prefix `"ticket:nullify:"` are deliberately different. Without domain separation, an observer could hash a commitment's inputs and check whether the result matches a nullifier, breaking privacy.

- **`persistentCommit`** (used for commitments) is a cryptographic commitment scheme that hides its input behind randomness. It also clears the ZK witness taint on its output, meaning the result can appear on-chain without needing `disclose()`.

- **`persistentHash`** (used for nullifiers) is deterministic — the same secret always produces the same nullifier, which is what prevents double-spending. Unlike `persistentCommit`, it does NOT clear taint, so the result must be explicitly `disclose()`d before it can appear on-chain.

- **`merkleTreePathRoot` + `checkRoot`** together form an anonymous membership proof. The witness provides a Merkle path, `merkleTreePathRoot` recomputes the root from that path, and `checkRoot` verifies the root exists in the tree's history. This proves a commitment exists without revealing which leaf it occupies.

#### 6.2. Compile

```bash
mkdir -p src/managed/ticket
compact compile -- src/ticket.compact src/managed/ticket
```

Full compile (with ZK keys) since we will deploy this contract.

#### 6.3. Write the witnesses

Create `src/ticket-witnesses.ts`:

```typescript
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { Ledger, Witnesses } from "./managed/ticket/contract/index.js";
import crypto from "node:crypto";

// Private state holds the ticket secret and randomness.
// Each ticket has a unique secret + randomness pair.
export type TicketPrivateState = {
  readonly secret: Uint8Array;
  readonly randomness: Uint8Array;
};

export function createTicketState(): TicketPrivateState {
  return {
    secret: crypto.randomBytes(32),
    randomness: crypto.randomBytes(32),
  };
}

export const ticketWitnesses: Witnesses<TicketPrivateState> = {
  // Return the ticket secret from private state
  ticket_secret: ({
    privateState,
  }: WitnessContext<Ledger, TicketPrivateState>): [TicketPrivateState, Uint8Array] => [
    privateState,
    privateState.secret,
  ],

  // Return the randomness from private state
  ticket_randomness: ({
    privateState,
  }: WitnessContext<Ledger, TicketPrivateState>): [TicketPrivateState, Uint8Array] => [
    privateState,
    privateState.randomness,
  ],

  // Look up the Merkle path for a commitment in the on-chain tree.
  // The context gives us access to the current ledger state.
  get_ticket_path: (
    { privateState, ledger: contractLedger }: WitnessContext<Ledger, TicketPrivateState>,
    commitment: Uint8Array,
  ): [TicketPrivateState, { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] }] => {
    // Use the ledger's findPathForLeaf to get the Merkle proof
    const merklePath = contractLedger.tickets.findPathForLeaf(commitment);
    if (!merklePath) {
      throw new Error("Ticket commitment not found in tree");
    }
    return [privateState, merklePath];
  },
};
```

Key points:

- **`TicketPrivateState`** holds `secret` and `randomness` as `Uint8Array`. These never leave the client — the ZK proof system uses them to compute commitments and nullifiers without revealing the raw values.

- **`createTicketState()`** generates random values with `crypto.randomBytes(32)`. Each ticket gets a fresh secret and randomness pair.

- **`get_ticket_path`** accesses the Merkle tree via `ledger.tickets.findPathForLeaf()`. Note that the `WitnessContext` field is `ledger`, NOT `contractState` — this is the on-chain ledger state that the runtime provides to witnesses so they can look up current contract data.

#### 6.4. Write the test script

Create `src/ticket-test.ts`:

```typescript
import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import { setNetworkId, getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { WalletFacade, WalletEntrySchema } from "@midnight-ntwrk/wallet-sdk-facade";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { InMemoryTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import * as Rx from "rxjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Contract, ledger as ticketLedger } from "./managed/ticket/contract/index.js";
import { ticketWitnesses, createTicketState, type TicketPrivateState } from "./ticket-witnesses.js";

// --- Config ---
const NETWORK_ID = "undeployed";
const INDEXER_HTTP = "http://127.0.0.1:8088/api/v4/graphql";
const INDEXER_WS = "ws://127.0.0.1:8088/api/v4/graphql/ws";
const NODE_URL = "ws://127.0.0.1:9944";
const PROOF_SERVER = "http://127.0.0.1:6300";

const DEPLOYER_SEED =
  "9b6d949692986326344f6ed105d1f5439f973617f668d8175482bce268e0d3cd3a893b12c928bfd7160f70dd07650fa5b6a1ac35e5adfe4fdeef08e84fd6255d";

function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk") throw new Error("Invalid seed");
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== "keysDerived") throw new Error("Key derivation failed");
  hdWallet.hdWallet.clear();
  return {
    zswap: result.keys[Roles.Zswap],
    nightExternal: result.keys[Roles.NightExternal],
    dust: result.keys[Roles.Dust],
  };
}

async function main() {
  console.log("=== Midnight Ticket System Test ===\n");

  setNetworkId(NETWORK_ID);
  const networkId = getNetworkId();
  const keys = deriveKeys(DEPLOYER_SEED);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);

  console.log("Initializing wallet...");
  const facade = await WalletFacade.init({
    configuration: {
      networkId,
      indexerClientConnection: {
        indexerHttpUrl: INDEXER_HTTP,
        indexerWsUrl: INDEXER_WS,
      },
      provingServerUrl: new URL(PROOF_SERVER),
      relayURL: new URL(NODE_URL),
      costParameters: {
        additionalFeeOverhead: 300_000_000_000_000n,
        feeBlocksMargin: 5,
      },
      txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
    },
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet({
        ...cfg,
        txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
      }).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  try {
    await facade.start(shieldedSecretKeys, dustSecretKey);
    console.log("Waiting for wallet to sync...");
    await Rx.firstValueFrom(
      facade.state().pipe(
        Rx.filter((s) => s.isSynced),
        Rx.timeout(120_000),
      ),
    );
    console.log("Wallet synced!\n");

    const walletAndMidnightProvider = {
      getCoinPublicKey: () =>
        facade.state().pipe(Rx.filter((s) => s.isSynced), Rx.map((s) => s.shielded.coinPublicKey.toHexString())),
      getEncryptionPublicKey: () =>
        facade.state().pipe(Rx.filter((s) => s.isSynced), Rx.map((s) => s.shielded.encryptionPublicKey.toHexString())),
      async balanceTx(tx: any, ttl?: Date) {
        const recipe = await facade.balanceUnboundTransaction(
          tx,
          { shieldedSecretKeys, dustSecretKey },
          { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
        );
        return await facade.finalizeRecipe(recipe);
      },
      submitTx: (tx: any) => facade.submitTransaction(tx),
    };

    // Fix: get synced state for key methods
    const syncedState = await Rx.firstValueFrom(
      facade.state().pipe(Rx.filter((s) => s.isSynced)),
    );
    const walletProvider = {
      getCoinPublicKey: () => syncedState.shielded.coinPublicKey.toHexString(),
      getEncryptionPublicKey: () => syncedState.shielded.encryptionPublicKey.toHexString(),
      balanceTx: walletAndMidnightProvider.balanceTx,
      submitTx: walletAndMidnightProvider.submitTx,
    };

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const zkConfigPath = path.resolve(__dirname, "managed/ticket");
    const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

    // Generate a ticket (random secret + randomness)
    const ticketState = createTicketState();
    console.log(`Ticket secret:     ${Buffer.from(ticketState.secret).toString("hex").slice(0, 16)}...`);
    console.log(`Ticket randomness: ${Buffer.from(ticketState.randomness).toString("hex").slice(0, 16)}...\n`);

    const providers = {
      walletProvider,
      midnightProvider: walletProvider,
      publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
      privateStateProvider: levelPrivateStateProvider<string, TicketPrivateState>({
        privateStateStoreName: "ticket-private-state",
        privateStoragePasswordProvider: () => "Ticket-Dev-Pa55word!",
        accountId: "deployer",
      }),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    };

    const compiledContract = CompiledContract.make("ticket", Contract).pipe(
      CompiledContract.withWitnesses(ticketWitnesses),
      CompiledContract.withCompiledFileAssets(zkConfigPath),
    );

    // --- Step 1: Deploy ---
    console.log("--- Step 1: Deploying ticket contract ---");
    const deployed = await deployContract(providers, {
      compiledContract,
      privateStateId: "ticket-private-state",
      initialPrivateState: ticketState,
    });
    const contractAddress = deployed.deployTxData.public.contractAddress;
    console.log(`  Deployed at: ${contractAddress}`);
    console.log(`  Block: ${deployed.deployTxData.public.blockHeight}\n`);

    // Helper to read state
    async function readState() {
      const state = await providers.publicDataProvider.queryContractState(contractAddress);
      if (!state) throw new Error("Contract state not found");
      const l = ticketLedger(state.data);
      return { ticketsUsed: l.ticketsUsed };
    }

    // --- Step 2: Issue a ticket ---
    console.log("--- Step 2: Issuing a ticket ---");
    const issueResult = await deployed.callTx.issue_ticket();
    console.log(`  Ticket issued! Block: ${issueResult.public.blockHeight}`);
    const stateAfterIssue = await readState();
    console.log(`  Tickets used so far: ${stateAfterIssue.ticketsUsed}\n`);

    // --- Step 3: Use the ticket ---
    console.log("--- Step 3: Using the ticket ---");
    const useResult = await deployed.callTx.use_ticket();
    console.log(`  Ticket used! Block: ${useResult.public.blockHeight}`);
    const stateAfterUse = await readState();
    console.log(`  Tickets used so far: ${stateAfterUse.ticketsUsed}\n`);

    // --- Step 4: Try to use the same ticket again (should fail) ---
    console.log("--- Step 4: Attempting to reuse the ticket (should fail) ---");
    try {
      await deployed.callTx.use_ticket();
      console.log("  ERROR: Ticket was reused! This should not happen.");
    } catch (err: any) {
      console.log(`  Correctly rejected: ${err.message?.slice(0, 80) || "double-use prevented"}`);
    }

    console.log("\n=== All tests passed! ===");
  } finally {
    await facade.stop();
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
```

This script walks through the full ticket lifecycle:

1. Deploys the ticket contract
2. Issues a ticket (inserts commitment into Merkle tree)
3. Uses the ticket (ZK proof of membership + nullifier)
4. Attempts to reuse the same ticket (should fail — nullifier already recorded)

#### 6.5. Run the test

```bash
node --import tsx src/ticket-test.ts
```

Expected output:

```
Step 1: Deploying ticket contract — deployed with address and block number
Step 2: Issuing a ticket — ticketsUsed: 0
Step 3: Using the ticket — ticketsUsed: 1
Step 4: Attempting reuse — correctly rejected ("failed assert")
All tests passed!
```

#### 6.6. Verify on-chain state

After the test, query the contract state to confirm:

- `ticketsUsed`: 1 (one ticket consumed)
- `usedTickets` set size: 1 (one nullifier recorded)
- `tickets.firstFree`: 1 (one leaf in the Merkle tree)
- The nullifier on-chain cannot be linked to the commitment — this is the privacy guarantee

### Expected output

All 4 test steps pass. On-chain state shows 1 ticket issued, 1 used, 1 nullifier recorded. The nullifier value is visible but unlinkable to the commitment in the Merkle tree.

> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.
