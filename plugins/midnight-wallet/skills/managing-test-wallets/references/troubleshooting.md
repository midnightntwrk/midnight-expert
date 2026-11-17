# Troubleshooting

| Symptom | Likely cause | First fix |
|---------|--------------|-----------|
| `STALE_UTXO` error on transfer | Concurrent spend used the same UTXO | Wait a few seconds, retry |
| `DUST_REQUIRED` error | Wallet has no DUST to pay fees | Run `examples/register-dust.ts`, wait for DUST to accrue |
| Sync never completes | Indexer or node unreachable | `midnight-tooling:devnet health`; check container status |
| `WebSocket is not defined` (Node) | Missing `ws` polyfill | Add the polyfill at the top of the script (see `network-config.md`) |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | Project is CJS, SDK is ESM | Set `"type": "module"` in `package.json` |
| `0` balance after faucet visit | Pasted shielded address into faucet | Use the UNSHIELDED address (`mn_addr_*`) |
| `WalletFacade.init` throws | Configuration shape mismatch or service unreachable | Verify each URL with `curl`; verify config matches `network-config.md` |
| `state.unshielded.balances[""]` returns `undefined` | Wrong key — empty string is not the native NIGHT key | Use `state.unshielded.balances[ledger.unshieldedToken().raw]` |
| Transaction submission rejected | Major SDK version drift, or ledger/protocol mismatch | Run `midnight-wallet:sdk-regression-check` (smoke test); see release notes |
| Type errors after `npm install` | Major SDK version bump | Run `midnight-wallet:sdk-regression-check` (drift check) |
| `Insufficient generated dust to cover registration fee` | First registration ran before the new NIGHT generated its own fee | Catch `isInsufficientDustForFeeError`, wait `error.estimate.seconds` (plus a margin) with `waitForGeneratedDust`, then retry — see `dust-registration.md`. Funding more NIGHT (1000 on devnet) keeps the wait short |
| `waitForGeneratedDust` times out | Too little NIGHT, so DUST generation can't reach the fee within the timeout (default 5 min) | Fund more NIGHT, or pass `{ timeoutMs }` worked out from the error's `estimate.seconds` |
| `No guaranteedUnshieldedOffer found in intent` / empty-list error on registration | Registering an empty UTXO list (e.g. the devnet genesis wallet, already registered) | Filter on `!coin.meta.registeredForDustGeneration` and skip when the list is empty |
| `ProtocolVersionMismatchError` when building a transaction | Built while the facade was `Crossing` the ledger 9 boundary | Wait for `state.isSynced && state.protocol._tag === 'Settled'` first |
| Recipient never observes incoming NIGHT | Wrong recipient address; or wallet still syncing | Confirm address is unshielded; allow 30-90 seconds on devnet |

## When in doubt

Run `midnight-wallet:sdk-regression-check` first. It distinguishes
between "the SDK changed" and "your environment is broken" in under a
minute.
