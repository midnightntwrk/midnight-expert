import fs from "node:fs";
import path from "node:path";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import {
	CONTRACTS_FILE,
	CONTRACT_NAME,
	FILE_MODE_PUBLIC,
	STATE_DIR,
	ZK_CONFIG_PATH,
} from "./constants.js";
import { withSpinner } from "./progress.js";
import type { Providers } from "./providers.js";

// NOTE: The contract module is imported dynamically at runtime because
// the import path depends on the compiled contract output.
// The agent should update this import to match the actual contract package.
export async function loadCompiledContract() {
	const ContractModule = await import("{{CONTRACT_PACKAGE}}");
	return CompiledContract.make(CONTRACT_NAME, ContractModule.Contract).pipe(
		CompiledContract.withVacantWitnesses,
		CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
	);
}

// The contract type, recovered from loadCompiledContract above. Providers are
// typed against this (see ./providers.ts) so deployContract / findDeployedContract
// accept them — they require providers whose circuit-id set matches the contract.
export type AppContract = Awaited<
	ReturnType<typeof loadCompiledContract>
> extends CompiledContract.CompiledContract<infer C, infer _PS, infer _R>
	? C
	: never;

// --- Deploy / Join ---

export interface DeployResult {
	contractAddress: string;
	txId: string;
	blockHeight: number;
}

export async function deploy(
	providers: Providers,
	initialPrivateState: Record<string, unknown>,
): Promise<DeployResult> {
	return withSpinner("Deploying contract (this may take 30-60 seconds)...", async () => {
		const compiledContract = await loadCompiledContract();

		const deployed = await deployContract(providers, {
			compiledContract,
			privateStateId: `${CONTRACT_NAME}PrivateState`,
			initialPrivateState,
		});

		const result: DeployResult = {
			contractAddress: deployed.deployTxData.public.contractAddress,
			txId: deployed.deployTxData.public.txId,
			blockHeight: deployed.deployTxData.public.blockHeight,
		};

		saveDeployedContract(CONTRACT_NAME, result);
		return result;
	});
}

// When `initialPrivateState` is given, findDeployedContract stores it under the
// private state ID, replacing whatever is stored there. Pass it only the first
// time a wallet joins a contract. Leave it out to reuse the private state saved
// at deploy or at an earlier join, as `call` does.
export async function join(
	providers: Providers,
	contractAddress: string,
	initialPrivateState?: Record<string, unknown>,
) {
	return withSpinner("Joining contract...", async () => {
		const compiledContract = await loadCompiledContract();
		const privateStateId = `${CONTRACT_NAME}PrivateState`;

		// Midnight.js checks whether the initialPrivateState key is present, not
		// whether it's defined, so leave the key out entirely.
		return initialPrivateState === undefined
			? findDeployedContract(providers, { contractAddress, compiledContract, privateStateId })
			: findDeployedContract(providers, {
					contractAddress,
					compiledContract,
					privateStateId,
					initialPrivateState,
				});
	});
}

// --- Persistence ---

interface DeployedContractStore {
	[name: string]: {
		address: string;
		deployedAt: string;
		txId: string;
	};
}

function contractsPath(): string {
	return path.join(process.cwd(), STATE_DIR, CONTRACTS_FILE);
}

export function loadDeployedContracts(): DeployedContractStore {
	const filePath = contractsPath();
	if (!fs.existsSync(filePath)) {
		return {};
	}
	return JSON.parse(fs.readFileSync(filePath, "utf-8")) as DeployedContractStore;
}

function saveDeployedContract(name: string, result: DeployResult): void {
	const store = loadDeployedContracts();
	store[name] = {
		address: result.contractAddress,
		deployedAt: new Date().toISOString(),
		txId: result.txId,
	};
	const dir = path.join(process.cwd(), STATE_DIR);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(contractsPath(), `${JSON.stringify(store, null, "\t")}\n`, {
		mode: FILE_MODE_PUBLIC,
	});
}
