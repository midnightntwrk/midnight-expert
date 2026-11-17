# Addresses and tokens

A `WalletFacade` owns three sub-wallets, each with its own address type
and balance shape.

| Sub-wallet | Address kind | Address prefix | What it holds |
|------------|--------------|----------------|---------------|
| `UnshieldedWallet` | `UnshieldedAddress` | `mn_addr_<networkid>1...` | NIGHT (the native unshielded token) |
| `ShieldedWallet`   | `ShieldedAddress`   | `mn_shield-addr_<networkid>1...` | Shielded tokens (privacy-preserving, ZK) |
| `DustWallet`       | `DustAddress`       | `mn_dust_<networkid>1...` | DUST (fee resource, time-generated from registered NIGHT UTXOs) |

## Which address goes where

| Operation | Address |
|-----------|---------|
| Faucet (preprod, preview) | UNSHIELDED only |
| Local-devnet genesis-seed airdrop | UNSHIELDED only |
| Receiving a shielded transfer | SHIELDED |
| DUST receive (rare — DUST is normally generated, not transferred) | DUST |

## The most common mistake

Pasting a shielded address into a faucet. Faucets fund NIGHT, which lives
in the unshielded wallet. The unshielded address starts with
`mn_addr_<network>` followed by the bech32 data. Always use that one
for funding.

## Balance shapes

- **Unshielded NIGHT:** `state.unshielded.balances[ledger.unshieldedToken().raw]` — a `bigint`. The key is the native token's raw bytes (64 hex zeros), NOT the empty string. 6 decimal places: `1_000_000n` = 1 NIGHT.
- **Shielded:** `state.shielded.balances[<token-raw-bytes>]` — a `bigint` per token kind.
- **DUST:** `state.dust.balance(new Date())` — a `bigint`. DUST has expiry, so the call requires a `Date`.

See `wallet-sdk:references/state-and-balances.md` for the full balance API.
