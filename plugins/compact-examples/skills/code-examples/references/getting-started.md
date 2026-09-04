# Getting Started Examples

Minimal contracts designed for learning Compact. Both use `pragma language_version >= 0.22` and import `CompactStandardLibrary`.

## Examples

| Name | Path | Description | Witnesses | Complexity |
|---|---|---|---|---|
| Hello World | `getting-started/hello-world/hello-world.compact` | Single public ledger state (`message: Opaque<"string">`). The most simple stateful contract possible - no witnesses, no constructor, no private state. | None (`witnesses.ts` is not present) | Beginner |
| Bulletin Board | `getting-started/bboard/bboard.compact` | One-at-a-time message board with ownership enforced via public key derivation. State machine with `VACANT`/`OCCUPIED` enum, `Opaque<"string">` message, and sequence counter. Ownership uses `persistentHash` over secret key + sequence, never exposing the secret on-chain. | `localSecretKey(): Bytes<32>` (in `witnesses.ts`) | Beginner |

## File Details

### hello-world

- `getting-started/hello-world/hello-world.compact` -- Exports `message: Opaque<"string">` and `storeMessage` circuit. Demonstrates writing a string to the public ledger. 
- No witnesses or private state. No witnesses means no witness.ts, it does not require an empty implmentation. 

### bboard

- `getting-started/bboard/bboard.compact` — Exports `state`, `message`, `sequence`, `owner` ledgers. Circuits: `post(newMessage)`, `takeDown()`, `publicKey(sk, sequence)`. Uses `disclose()`, `Maybe`, `Opaque`, `some`/`none`, and `persistentHash`.
- `getting-started/bboard/witnesses.ts` — Implements `localSecretKey()` returning the caller's private key bytes.

## Key Patterns Illustrated

- `Maybe<T>` for optional values (`some`/`none`)
- `Opaque<"string">` for off-chain string values passed through the circuit
- `disclose()` to move witness-provided values into public ledger state
- `persistentHash` for deterministic, on-chain key derivation
- Public key derivation without exposing the secret key

## Cross-references

For more advanced patterns built on these primitives, see [modules.md](modules.md) — particularly `Ownable` and `ZOwnablePK` for production-grade ownership, and `Initializable` for constructor guards.
