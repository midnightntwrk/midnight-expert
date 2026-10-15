import { BaseCommand } from "../../base-command.js";
import { DEVNET_CONFIG } from "../../lib/config.js";

interface ServiceStatus {
	name: string;
	url: string;
	healthy: boolean;
	error?: string;
}

async function checkService(name: string, url: string): Promise<ServiceStatus> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
		return { name, url, healthy: response.ok || response.status === 400 };
	} catch (err) {
		return {
			name,
			url,
			healthy: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export default class DevnetStatus extends BaseCommand {
	static override description = "Check health of devnet services";

	async run(): Promise<void> {
		const services = await Promise.all([
			checkService("node", DEVNET_CONFIG.node),
			checkService("indexer", DEVNET_CONFIG.indexer),
			checkService("proof-server", DEVNET_CONFIG.proofServer),
		]);

		const result = {
			node: services[0],
			indexer: services[1],
			proofServer: services[2],
		};

		if (!this.jsonEnabled()) {
			for (const svc of services) {
				const icon = svc.healthy ? "+" : "x";
				this.log(`  [${icon}] ${svc.name}: ${svc.url}`);
				if (svc.error) {
					this.log(`      ${svc.error}`);
				}
			}
		}

		this.outputResult(result);
	}
}
