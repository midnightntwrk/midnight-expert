> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.

## Step 6: Ticket Contract

### What this verifies

A privacy-preserving smart contract using the commitment/nullifier pattern — the core pattern that makes Midnight unique.

### Procedure

#### 6.1. Write the contract

Create `contracts/ticket.compact`:

```compact
// ticket.compact
// A one-time-use ticket system with privacy.
//
// Privacy properties:
//   - Nobody can tie a ticket to an account
//   - A holder can prove they have a valid ticket (via ZK Merkle proof)
//   - Once used, a nullifier prevents reuse
//   - An observer cannot link a used ticket to the original issuance

pragma language_version 0.28;

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

  // Bind the path to THIS holder's commitment. MerkleTreePath carries its own
  // `leaf` field, which is what merkleTreePathRoot hashes -- and the path
  // comes from a witness running on the prover's machine. Without this check
  // someone can supply another holder's path and be admitted with a ticket
  // they never held. Soundness, not privacy.
  assert(path.leaf == commitment, "Merkle path is not for this ticket");

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

- **`assert(path.leaf == commitment, ...)`** is what makes that proof about _your_ ticket. `merkleTreePathRoot` hashes the `leaf` field carried inside the path, and the path comes from a witness, so on its own the pair above proves only that _some_ commitment is in the tree. Any holder's path would satisfy it. Bind the path to the value the circuit recomputed whenever a witness supplies it.

#### 6.2. Compile

```bash
compact compile contracts/ticket.compact contracts/managed/ticket
```

Full compile (with ZK keys) since we deploy this contract. `contracts/managed/ticket/keys/` should hold keys for `issue_ticket` and `use_ticket`.

#### 6.3. Write the witnesses

Create `contracts/ticket-witnesses.ts`. The secret and randomness never leave this machine; `get_ticket_path` reads the Merkle path from the current public ledger:

```typescript
import type { WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import type { Ledger, Witnesses } from "./managed/ticket/contract/index.js";
import crypto from "node:crypto";

// The ticket's secret and randomness live only in private state on this machine.
export type TicketPrivateState = {
  readonly secret: Uint8Array;
  readonly randomness: Uint8Array;
};

export function createTicketState(): TicketPrivateState {
  return { secret: crypto.randomBytes(32), randomness: crypto.randomBytes(32) };
}

export const ticketWitnesses: Witnesses<TicketPrivateState> = {
  ticket_secret: ({ privateState }: WitnessContext<Ledger, TicketPrivateState>) => [privateState, privateState.secret],

  ticket_randomness: ({ privateState }: WitnessContext<Ledger, TicketPrivateState>) => [
    privateState,
    privateState.randomness,
  ],

  // The Merkle path proving this ticket's commitment is in the `tickets` tree,
  // read from the current public ledger state.
  get_ticket_path: ({ privateState, ledger }: WitnessContext<Ledger, TicketPrivateState>, commitment: Uint8Array) => {
    const path = ledger.tickets.findPathForLeaf(commitment);
    if (!path) throw new Error("Ticket commitment not found in tree");
    return [privateState, path];
  },
};
```

Then bind the contract to its witnesses and keys in `contracts/ticket.ts`:

```typescript
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract } from "./managed/ticket/contract/index.js";
import { ticketWitnesses } from "./ticket-witnesses.js";

export { ledger } from "./managed/ticket/contract/index.js";
export { createTicketState, type TicketPrivateState } from "./ticket-witnesses.js";

export const zkConfigPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "managed", "ticket");

export const CompiledTicket = CompiledContract.make("Ticket", Contract).pipe(
  CompiledContract.withWitnesses(ticketWitnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
```

#### 6.4. Write the script

Create `src/ticket.ts`. It reuses `src/wallet.ts` and `src/providers.ts` from Steps 3-4:

```typescript
import { deployContract, submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import { GENESIS_SEED, openWallet } from "./wallet.js";
import { buildProviders } from "./providers.js";
import { CompiledTicket, createTicketState, ledger, zkConfigPath } from "../contracts/ticket.js";

const STATE_ID = "ticketState";

async function main() {
  const wallet = await openWallet(GENESIS_SEED);
  const providers = buildProviders<"issue_ticket" | "use_ticket">(wallet, zkConfigPath, `ticket-${Date.now()}`);

  // 1. Deploy, with a fresh ticket secret in private state
  const deployed = await deployContract(providers, {
    compiledContract: CompiledTicket,
    privateStateId: STATE_ID,
    initialPrivateState: createTicketState(),
  });
  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log(`Deployed at: ${contractAddress}`);

  const call = (circuitId: "issue_ticket" | "use_ticket") =>
    submitCallTx(providers, { compiledContract: CompiledTicket, contractAddress, privateStateId: STATE_ID, circuitId });
  const readState = async () => {
    const read = await providers.publicDataProvider.queryContractState(contractAddress);
    if (read === null || read.contractState.era !== "v9") throw new Error("no ledger 9 contract state");
    return ledger(read.contractState.deserialize({ v9: ContractState }).data);
  };

  // 2. Issue: only a commitment to the secret goes on-chain
  await call("issue_ticket");
  console.log(`Issued. ticketsUsed = ${(await readState()).ticketsUsed}`);

  // 3. Use: proves the commitment is in the tree and records a nullifier
  await call("use_ticket");
  const after = await readState();
  console.log(`Used. ticketsUsed = ${after.ticketsUsed}, nullifiers = ${after.usedTickets.size()}`);

  // 4. Reuse must fail: the nullifier is already recorded
  try {
    await call("use_ticket");
    console.log("ERROR: the ticket was used twice");
    process.exitCode = 1;
  } catch (e) {
    console.log(`Reuse rejected: ${String((e as Error).message).split("\n")[0].slice(0, 100)}`);
  }

  await wallet.stop();
  process.exit();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
```

A circuit that takes no arguments is called without an `args` field.

#### 6.5. Run it

```bash
node --import tsx src/ticket.ts
```

> **Expected noise.** The wallet logs some `RPC-CORE: ... disconnected ... Normal Closure` lines, and occasionally `API/INIT: Error: FATAL: Unable to initialize the API: WebSocket is not connected`. Both come from testkit's node connection being opened and closed; the script carries on and finishes. A fresh wallet syncs from genesis each run, and loading the SDK takes a while, so expect a minute or more per script.

### Expected output

```
Deployed at: <contract address>
Issued. ticketsUsed = 0
Used. ticketsUsed = 1, nullifiers = 1
Reuse rejected: <error naming the failed "Ticket already used" assert>
```

On-chain there is one commitment in `tickets`, one nullifier in `usedTickets` and `ticketsUsed` is 1. The nullifier can't be linked to the commitment: that is the privacy guarantee.

> **EPHEMERAL** — All code and files produced by this walkthrough are disposable. Do not commit, push, or retain any of it. Delete everything when done.
