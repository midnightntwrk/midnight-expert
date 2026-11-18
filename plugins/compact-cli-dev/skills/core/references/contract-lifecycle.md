# Contract Lifecycle Reference

Covers loading compiled contracts, deploying, joining existing contracts, calling circuits, querying public state, and address persistence.

---

## Loading Compiled Contracts

The `loadCompiledContract()` function prepares a compiled Compact contract for deployment:

```typescript
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { CONTRACT_NAME, ZK_CONFIG_PATH } from "./constants.js";

export async function loadCompiledContract() {
  const ContractModule = await import("{{CONTRACT_PACKAGE}}");
  return CompiledContract.make(CONTRACT_NAME, ContractModule.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );
}
```

The pipeline:

1. **`CompiledContract.make(name, Contract)`** — creates a compiled contract from the generated contract module
2. **`withVacantWitnesses`** — fills in empty witness implementations (sufficient for contracts without private witnesses)
3. **`withCompiledFileAssets(zkConfigPath)`** — loads ZK circuit keys from disk

The `{{CONTRACT_PACKAGE}}` and `{{CONTRACT_ZK_CONFIG_PATH}}` placeholders are replaced by the template engine during scaffolding.

---

## Deploy

The `deploy()` function submits a new contract to the devnet and saves the resulting address:

```typescript
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";

export async function deploy(
  providers: Providers,
  initialPrivateState: Record<string, unknown>,
): Promise<DeployResult> {
  const compiledContract = await loadCompiledContract();

  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: `${CONTRACT_NAME}PrivateState`,
    initialPrivateState,
  });

  return {
    contractAddress: deployed.deployTxData.public.contractAddress,
    txId: deployed.deployTxData.public.txId,
    blockHeight: deployed.deployTxData.public.blockHeight,
  };
}
```

The `deployContract()` SDK function:

- Generates a ZK proof via the proof server
- Balances the transaction (pays fees)
- Submits the transaction to the node
- Returns a `DeployedContract` with `deployTxData` and `callTx` methods

The `privateStateId` is a LevelDB key prefix for storing private state. The `initialPrivateState` object must match the contract's expected initial state shape.

If the contract's constructor takes arguments (i.e. its generated `InitializeParameters` is not the empty tuple), `deployContract` also requires an `args` field whose shape is inferred from the contract. For a no-argument constructor, omit `args` entirely — the options type narrows to a variant that does not accept it. Example with constructor arguments:

```typescript
const deployed = await deployContract(providers, {
  compiledContract,
  privateStateId: `${CONTRACT_NAME}PrivateState`,
  initialPrivateState,
  args: [/* constructor arguments matching the contract */],
});
```

---

## Join

To interact with an already-deployed contract, use `findDeployedContract()`:

```typescript
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";

export async function join(
  providers: Providers,
  contractAddress: string,
  initialPrivateState: Record<string, unknown>,
) {
  const compiledContract = await loadCompiledContract();

  return findDeployedContract(providers, {
    contractAddress,
    compiledContract,
    privateStateId: `${CONTRACT_NAME}PrivateState`,
    initialPrivateState,
  });
}
```

The returned `FoundContract` object has the same `callTx` interface as a deployed contract. The `initialPrivateState` should match what the joining party's private state should be initialized to.

Full command usage:

```typescript
const ctx = await buildFacade(walletData.seed);
const providers = await createProviders(ctx.facade, ctx.keystore, `${CONTRACT_NAME}-private-state`);
await join(providers, args.address, {});
```

---

## Calling Circuits

After deploying or joining, call contract circuits via the `callTx` proxy:

```typescript
// From the call.ts command stub:
const deployed = loadDeployedContracts().counter;
if (!deployed) throw new Error("No deployed counter contract. Run `deploy` first.");
const contract = await join(providers, deployed.address, {});

const txData = await contract.callTx.increment();
// txData.public.txId      — transaction hash
// txData.public.blockHeight — block where the tx was included
```

Each circuit defined in the Compact contract becomes a method on `callTx`. Arguments are passed positionally. The returned `FinalizedCallTxData` contains:

| Field | Type | Description |
|-------|------|-------------|
| `txData.public.txId` | `string` | Transaction hash |
| `txData.public.blockHeight` | `bigint` | Block number |

---

## Querying Public State

Read-only queries use the `publicDataProvider` to fetch contract state from the indexer:

```typescript
// From the query.ts command stub:
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { ContractState } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import { ledger } from "@midnight-ntwrk/counter-contract";

const publicDataProvider = indexerPublicDataProvider(DEVNET_CONFIG.indexer, DEVNET_CONFIG.indexerWS);
const read = await publicDataProvider.queryContractState(address);

if (read) {
  const ledgerState = ledger(read.contractState.deserialize({ v9: ContractState }).data);
  // Access ledger fields: ledgerState.round, ledgerState.owner, etc.
}
```

Midnight.js 5 returns the contract state still serialized, tagged with the ledger era that wrote it (`read.contractState.era`). `deserialize({ v9: ContractState })` decodes a ledger 9 state; a contract deployed on ledger 8 needs a `v8` decoder instead. The compiled contract's `ledger()` function then turns the state's data into the typed ledger structure defined in the Compact contract. Each `export ledger` field becomes a property on the returned object.

---

## Address Persistence

Deployed contract addresses are saved to `.dapp-state/deployed-contracts.json`:

```json
{
  "counter": {
    "address": "0100abcdef...",
    "deployedAt": "2026-03-31T12:00:00.000Z",
    "txId": "0200abcdef..."
  }
}
```

**File permissions:** `0o644` (world-readable). Contract addresses are not secrets.

Key functions:

```typescript
// Load all deployed contracts from disk
export function loadDeployedContracts(): DeployedContractStore {
  const filePath = contractsPath();
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as DeployedContractStore;
}
```

The `deploy()` function calls `saveDeployedContract()` automatically after a successful deployment. The `call` and `query` commands read the stored address when no `--address` flag is provided.
