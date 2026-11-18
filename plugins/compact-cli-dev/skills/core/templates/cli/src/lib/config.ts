export interface NetworkConfig {
	readonly indexer: string;
	readonly indexerWS: string;
	readonly node: string;
	readonly nodeWS: string;
	readonly proofServer: string;
	readonly networkId: string;
}

// Midnight.js 5 has no global network ID (setNetworkId and the
// midnight-js-network-id package are gone). The ID is passed where it's used:
// to the wallet configuration, the keystore and the providers' `config`.
export const DEVNET_CONFIG: NetworkConfig = {
	indexer: "http://127.0.0.1:8088/api/v4/graphql",
	indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
	node: "http://127.0.0.1:9944",
	nodeWS: "ws://127.0.0.1:9944",
	proofServer: "http://127.0.0.1:6300",
	networkId: "undeployed",
};
