import path from "node:path";

// File system
export const STATE_DIR = ".dapp-state";
export const WALLETS_FILE = "wallets.json";
export const CONTRACTS_FILE = "deployed-contracts.json";
export const INIT_MARKER = ".initialized";
export const DIR_MODE = 0o700;
export const FILE_MODE_PRIVATE = 0o600;
export const FILE_MODE_PUBLIC = 0o644;

// Wallet
export const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
export const SEED_LENGTH = 64; // hex chars = 32 bytes

// Local devnet private-state encryption. The level private-state provider
// encrypts persisted private state at rest; on a throwaway local devnet a fixed
// dev password is fine. Replace with a real secret for any non-local network.
// Midnight.js 5 rejects a password with fewer than three of: uppercase letters,
// lowercase letters, digits, special characters.
export const LOCAL_PRIVATE_STATE_PASSWORD = "Midnight-Local-Devnet-1";

// Transactions: how long a built transaction stays valid, in seconds. Midnight.js
// 5 reads it from the providers' `config.ttlSeconds`; the wallet uses it too.
export const TX_TTL_SECONDS = 30 * 60;

// Fees
export const ADDITIONAL_FEE_OVERHEAD = 300_000_000_000_000n;
export const FEE_BLOCKS_MARGIN = 5;
// DUST a wallet should hold before it transacts. A counter deploy on the local
// devnet costs about 1.4 DUST (1 DUST = 10^15 specks), so wait for 2.
export const DUST_MIN_REQUIREMENT = 2_000_000_000_000_000n;

// Timeouts (ms)
export const WALLET_SYNC_TIMEOUT = 120_000;
// DUST accrues in proportion to the NIGHT registered: 10,000 NIGHT reaches
// DUST_MIN_REQUIREMENT in about 25 seconds, 1,000 NIGHT in about four minutes
// and 300 NIGHT in about thirteen.
export const DUST_GENERATION_TIMEOUT = 15 * 60_000;
// How long to wait for NIGHT to show up in a wallet (an airdrop lands in seconds).
export const FUND_TIMEOUT = 120_000;
export const DUST_POLL_INTERVAL = 5_000;
export const PROOF_TIMEOUT = 300_000;

// Retry
export const MAX_RETRIES = 3;

// Token precision
export const NIGHT_DECIMALS = 6;
export const DUST_DECIMALS = 15;

// Devnet compose file search order
export const COMPOSE_SEARCH_PATHS = ["devnet.yml", path.join(".midnight", "devnet.yml")];
export const COMPOSE_FALLBACK = path.join(
	process.env.HOME ?? "~",
	".midnight-expert",
	"devnet",
	"devnet.yml",
);

// Contract
export const ZK_CONFIG_PATH = "{{CONTRACT_ZK_CONFIG_PATH}}";
export const CONTRACT_NAME = "{{CONTRACT_NAME}}";
