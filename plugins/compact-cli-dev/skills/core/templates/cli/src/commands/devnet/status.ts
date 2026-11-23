import { BaseCommand } from "../../base-command.js";

interface ServiceStatus {
	name: string;
	url: string;
	healthy: boolean;
	error?: string;
}

async function checkService(name: string, url: string): Promise<ServiceStatus> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
		// The indexer's /ready answers 503 while it catches up with the node.
		return response.ok
			? { name, url, healthy: true }
			: { name, url, healthy: false, error: `HTTP ${String(response.status)}` };
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

	async run(): Promise<unknown> {
		// Each service's health endpoint. A plain GET on the node's RPC port or
		// the indexer's GraphQL path answers 405, so those can't be used.
		const services = await Promise.all([
			checkService("node", "http://127.0.0.1:9944/health"),
			checkService("indexer", "http://127.0.0.1:8088/ready"),
			checkService("proof-server", "http://127.0.0.1:6300/health"),
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

		return result;
	}
}
