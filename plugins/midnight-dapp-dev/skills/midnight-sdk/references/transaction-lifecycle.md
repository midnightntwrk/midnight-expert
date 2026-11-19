# Transaction Lifecycle

Complete reference for the Midnight transaction lifecycle: from circuit call construction through ZK proving, balancing, submission, and on-chain finalization. For package-level API details, see `references/package-reference.md`. For the high-level deployment workflow, see `midnight-dapp-dev:midnight-sdk`.

## Pipeline Overview

Every contract interaction follows a five-stage pipeline. Midnight.js 5 passes the transaction between stages as a handle tagged with its ledger era (`v9` on every network today), and checks before it starts that the proof, wallet and midnight providers all list that era in `supportedEras`:

```
1. Build         2. Prove          3. Balance        4. Submit         5. Finalize
   |                |                 |                 |                 |
   v                v                 v                 v                 v
   createUnproven   proofProvider     walletProvider    midnightProvider  publicDataProvider
   CallTx()         .proveTx()        .balanceTx()      .submitTx()       (indexer confirms)
   |                |                 |                 |                 |
   v                v                 v                 v                 v
   UnprovenTx  ->  UnboundTx    ->  FinalizedTx  ->  TransactionId ->  FinalizedTxRead
```

### Stage 1: Build (Create Unproven Transaction)

Constructs the transaction by executing the circuit logic and witness functions locally:

```typescript
import { createUnprovenCallTx } from "@midnight-ntwrk/midnight-js-contracts";

const unproven = await createUnprovenCallTx(providers, {
  compiledContract,               // the CompiledContract
  contractAddress,
  circuitId: "myCircuit",         // must match the Compact export
  args: [arg1, arg2],             // omitted for a circuit with no arguments
  privateStateId: PRIVATE_STATE_ID,
});
```

During this stage:
- The current contract state and ledger parameters are read from the indexer
- The circuit's Compact code is evaluated locally
- Witness functions are called to supply private inputs
- The private state is read through `privateStateProvider.forContract(contractAddress)` and potentially updated
- An unproven transaction is constructed with all inputs and outputs

The unproven transaction contains the full transaction structure but no ZK proof yet.

### Stage 2: Prove (Generate ZK Proof)

The proof server (`midnightntwrk/proof-server:9.0.2` or later), or the connected wallet, generates a zero-knowledge proof that the circuit was executed correctly:

```typescript
// Happens automatically in callTx, or manually:
const unbound = await providers.proofProvider.proveTx(unprovenTx);
```

During this stage:
- The unproven transaction and its witness data are sent to the proof server
- The proof server loads the circuit's ZKIR and proving keys
- A ZK-SNARK proof is generated
- The proof is attached to the transaction

This is the most computationally expensive stage. Proof generation time depends on circuit complexity and can range from seconds to minutes.

### Stage 3: Balance (Add Fee Inputs/Outputs)

The wallet adds fee inputs and change outputs to make the transaction valid:

```typescript
// Happens automatically in callTx, or manually:
const finalized = await providers.walletProvider.balanceTx(
  unboundTx,  // the proven (unbound) transaction from proveTx
  ttl,        // Date; the framework passes providers.config.ttlSeconds from now
);
```

During this stage:
- The wallet adds DUST inputs to cover the transaction fee
- Any unshielded or shielded inputs and change outputs the transaction needs are added
- The transaction is signed and bound

In Node.js with wallet SDK 2 this is `facade.balanceUnboundTransaction(facade.adoptTransaction(tx.serialize(), "Unbound"), { ttl })`, then `facade.signRecipe(recipe, keystore.signDataAsync)` and `facade.finalizeRecipe(signed)`. In the browser it is `ConnectedAPI.balanceUnsealedTransaction`, which picks its own TTL. See `midnight-dapp-dev:midnight-sdk` for the full provider code.

### Stage 4: Submit (Send to Network)

The finalized transaction is submitted to the Midnight node:

```typescript
// Happens automatically in callTx, or manually:
const txId = await providers.midnightProvider.submitTx(finalizedTx);
```

The node validates the transaction and broadcasts it to the network. The `submitTx` call returns the transaction ID immediately; it does not wait for block inclusion.

### Stage 5: Finalize (Confirm On-Chain)

The SDK watches the indexer for transaction confirmation:

```typescript
// Happens automatically in callTx (blocks until confirmed)
// Or wait for one transaction yourself:
const record = await providers.publicDataProvider.watchForTxData(txId, { maxWaitMs: 120_000 });
record.status; // "SucceedEntirely" | "FailFallible" | "FailEntirely"

// Or follow the contract's state:
providers.publicDataProvider
  .contractStateObservable(contractAddress, { type: "latest" })
  .subscribe(({ value, blockHeight }) => {
    // value is a ContractStateRead; decode with
    // ledger(value.contractState.deserialize({ v9: ContractState }).data)
  });
```

The indexer monitors the blockchain and emits events when the transaction is included in a block. The `callTx` high-level API blocks until this confirmation arrives.

## High-Level vs Low-Level API Comparison

### High-Level (callTx)

```typescript
// All 5 stages in one call
const txData = await deployed.callTx.myCircuit(arg1, arg2);
// Returns: FinalizedCallTxData; txData.public has txId, txHash, blockHeight, status
```

Advantages:
- Simplest API surface
- Automatic error handling across all stages
- Blocks until on-chain confirmation

Limitations:
- No control over individual stages
- Cannot inspect intermediate state
- Blocks the calling thread until finalization

### Low-Level (Manual Pipeline)

```typescript
import {
  createUnprovenCallTx,
  submitCallTx,
  submitCallTxAsync,
} from "@midnight-ntwrk/midnight-js-contracts";

const options = {
  compiledContract,
  contractAddress,
  circuitId: "myCircuit" as const,
  args: [arg1, arg2],
  privateStateId: PRIVATE_STATE_ID,
};

// Stage 1 only: build, to inspect the result before submitting
const unproven = await createUnprovenCallTx(providers, options);
console.log("Next public state:", unproven.public.nextContractState);

// Stages 1-5: Build + Prove + Balance + Submit + Finalize
const txData = await submitCallTx(providers, options);

// OR Stages 1-4: Build + Prove + Balance + Submit (no finalization wait)
const { txId } = await submitCallTxAsync(providers, options);
```

Advantages:
- Inspect the built transaction before submitting it
- Choose whether to wait for finalization
- Batch multiple unproven transactions before submission
- Custom error handling per stage

## Deployment Transaction Lifecycle

Contract deployment follows a similar pipeline with a dedicated function:

```typescript
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";

// Performs all 5 stages for the deployment transaction.
// compiledContract comes from CompiledContract.make(...) in
// @midnight-ntwrk/midnight-js-protocol/v9/compact-js.
const deployed = await deployContract(providers, {
  compiledContract,
  privateStateId: "myState",
  initialPrivateState: { secretKey },
  // `args` holds the contract constructor's parameters. It is REQUIRED when the
  // Compact constructor takes parameters (pass them in declared order), and
  // omitted entirely when the constructor takes no arguments.
  args: [constructorArg1],
});

// deployed.deployTxData contains:
deployed.deployTxData.public.contractAddress;  // The new contract's address
deployed.deployTxData.public.txId;
deployed.deployTxData.public.blockHeight;
```

The deployment transaction:
1. Includes the initial contract state and the circuits' verifier keys
2. Is proven (ZK proof that the constructor executed correctly)
3. Is balanced (fees added)
4. Is submitted and confirmed
5. The contract address is deterministically derived from the transaction

## Error Handling by Stage

| Stage | Error Type | Common Causes |
|-------|-----------|---------------|
| Build | Witness execution error, `EraMismatchError` | Private state missing, witness logic error, type mismatch; artifacts compiled with toolchain 0.31.x (ledger 8) |
| Prove | Proof generation failure, `ProviderEraUnsupportedError` | Proof server not running or older than 9.0.2, circuit too complex, timeout; a provider that does not serve `v9` |
| Balance | Balancing failure | Not enough DUST, wallet not synced, wallet disconnected |
| Submit | Submission rejection | Invalid transaction, node unreachable, nonce conflict |
| Finalize | `TxFailedError`, `WatchTimeoutError` | Transaction failed on-chain; network congestion, transaction dropped, indexer lag |

```typescript
import { EraMismatchError, TxFailedError } from "@midnight-ntwrk/midnight-js-contracts";

try {
  const txData = await deployed.callTx.myCircuit(arg);
} catch (error) {
  if (error instanceof TxFailedError) {
    // Transaction was submitted but failed on-chain; error.record has the details
    console.error("On-chain failure:", error.record.status);
  } else if (error instanceof EraMismatchError) {
    // Wrong ledger era, e.g. contract compiled with toolchain 0.31.x
    console.error("Era mismatch:", error.reason);
  } else if (error.message?.includes("proof")) {
    // Proof generation failed
    console.error("Proving error:", error.message);
  } else if (error.message?.includes("balance")) {
    // Balancing failed (likely insufficient funds)
    console.error("Balance error:", error.message);
  } else {
    // Other errors (witness execution, network, etc.)
    console.error("Transaction error:", error);
  }
}
```

## Transaction Timing

Typical durations for each stage on a healthy network:

| Stage | Local (Undeployed) | Preview/Preprod |
|-------|-------------------|-----------------|
| Build | < 100ms | < 100ms |
| Prove | 2-30s (depends on circuit) | 2-30s |
| Balance | < 500ms | < 1s |
| Submit | < 500ms | < 2s |
| Finalize | ~6s (one block) | ~20s (block time varies) |

These timings are approximate and vary based on network conditions, contract complexity, and hardware.

Proof generation is the bottleneck. Complex circuits with many constraints take longer to prove. The proof server caches some intermediate computations, so repeated proofs for the same circuit are faster.

## Concurrent Transactions

Multiple transactions can be in-flight simultaneously using async variants:

```typescript
// Submit multiple transactions without waiting for each to finalize
const submitted = await Promise.all([
  submitCallTxAsync(providers, options1),
  submitCallTxAsync(providers, options2),
  submitCallTxAsync(providers, options3),
]);

// Wait for all of them to finalize
const records = await Promise.all(
  submitted.map(({ txId }) => providers.publicDataProvider.watchForTxData(txId)),
);
console.log("All transactions finalized:", records.map((r) => r.status));
```

Note: concurrent transactions from the same wallet must not conflict on inputs. The wallet provider selects DUST and token inputs, but rapid concurrent submissions can cause balancing failures if the available inputs are exhausted.
