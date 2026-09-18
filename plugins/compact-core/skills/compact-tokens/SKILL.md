---
name: compact-core:compact-tokens
description: This skill should be used when the user asks about Midnight tokens, token types (NIGHT, DUST, shielded, unshielded), minting and burning tokens, token transfers, token colors and domain separators, the zswap protocol, ShieldedCoinInfo, QualifiedShieldedCoinInfo, Kernel mint operations, contract token patterns (FungibleToken, NonFungibleToken, MultiToken), the account model vs UTXO model for tokens, sendShielded, receiveShielded, sendUnshielded, mintShieldedToken, mintUnshieldedToken, unshieldedBalance, OpenZeppelin Compact token contracts, or choosing between shielded and unshielded token approaches.
version: 0.1.0
---

# Compact Tokens

> **Last verified:** 2026-09-17 — token API (types & functions) compile-probed against Compact compiler `0.31.1` / language `0.23` / `@midnight-ntwrk/compact-runtime` `0.16.0`; all listed symbols resolve via `import CompactStandardLibrary;`.

This skill covers tokens on Midnight: choosing between shielded and unshielded approaches, using the standard library mint/send/receive functions, understanding token colors and domain separators, and the NIGHT/DUST token model. It does not cover ledger ADT types or state design -- those belong in `compact-ledger`. It does not cover overall contract anatomy or circuit/witness design -- those belong in `compact-structure`.

## Token Decision Tree

| Need | Approach | Key Functions |
|------|----------|---------------|
| Private balances/transfers | Shielded ledger tokens (zswap UTXO) | `mintShieldedToken`, `sendShielded`, `receiveShielded` |
| Transparent balances/transfers | Unshielded ledger tokens | `mintUnshieldedToken`, `sendUnshielded`, `unshieldedBalance` |
| Programmable fungible token (ERC-20 style) | Contract token with `Map` state | OpenZeppelin `FungibleToken` pattern |
| NFTs / multi-token collections | Contract token with ownership `Map`s | OpenZeppelin `NonFungibleToken` / `MultiToken` |
| Gas fees | DUST (generated from NIGHT) | Not contract-programmable |

## Token Types Quick Reference

| Type | Location | Privacy | Model | Key Traits |
|------|----------|---------|-------|------------|
| Shielded ledger | Blockchain ledger | Private | UTXO | Native privacy, maximum efficiency, hidden sender/recipient/value |
| Unshielded ledger | Blockchain ledger | Transparent | UTXO | Full transparency, high performance, visible balances |
| Shielded contract | Contract state | Private | Account (via `Map`) | Private balances via ZK proofs, but no post-issuance spend enforcement — contract cannot freeze, pause, or claw back coins once received (see Known Limitations in `references/token-patterns.md`). OpenZeppelin's ShieldedERC20 is archived; its upstream successor is the ElGamal-based `ConfidentialFungibleToken` (see `examples/ConfidentialFungibleToken.compact`), which hides balances via encryption rather than the Zswap shielded-coin model. For custom spend logic, unshielded contract tokens remain the pragmatic choice. |
| Unshielded contract | Contract state | Transparent | Account (via `Map`) | Full programmability, visible operations |

## Shielded Token Operations

Key types:

| Type | Fields | Purpose |
|------|--------|---------|
| `ShieldedCoinInfo` | `nonce: Bytes<32>`, `color: Bytes<32>`, `value: Uint<128>` | Newly created coin (this transaction) |
| `QualifiedShieldedCoinInfo` | `nonce`, `color`, `value`, `mt_index: Uint<64>` | Existing coin on ledger, ready to spend |
| `ShieldedSendResult` | `change: Maybe<ShieldedCoinInfo>`, `sent: ShieldedCoinInfo` | Result of send operations |
| `ZswapCoinPublicKey` | `bytes: Bytes<32>` | User public key for coin output |

Key functions:

| Function | Signature | Returns |
|----------|-----------|---------|
| `mintShieldedToken` | `(domainSep: Bytes<32>, value: Uint<64>, nonce: Bytes<32>, recipient: Either<ZswapCoinPublicKey, ContractAddress>)` | `ShieldedCoinInfo` |
| `receiveShielded` | `(coin: ShieldedCoinInfo)` | `[]` |
| `sendShielded` | `(input: QualifiedShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>, value: Uint<128>)` | `ShieldedSendResult` |
| `sendImmediateShielded` | `(input: ShieldedCoinInfo, target: Either<ZswapCoinPublicKey, ContractAddress>, value: Uint<128>)` | `ShieldedSendResult` |
| `mergeCoin` | `(a: QualifiedShieldedCoinInfo, b: QualifiedShieldedCoinInfo)` | `ShieldedCoinInfo` |
| `mergeCoinImmediate` | `(a: QualifiedShieldedCoinInfo, b: ShieldedCoinInfo)` | `ShieldedCoinInfo` |
| `evolveNonce` | `(index: Uint<128>, nonce: Bytes<32>)` | `Bytes<32>` |
| `shieldedBurnAddress` | `()` | `Either<ZswapCoinPublicKey, ContractAddress>` |
| `ownPublicKey` | `()` | `ZswapCoinPublicKey` |

```compact
export circuit mint(amount: Uint<64>): ShieldedCoinInfo {
  counter.increment(1);
  const newNonce = evolveNonce(counter.read() as Uint<128>, nonce);
  nonce = newNonce;
  return mintShieldedToken(
    domain, disclose(amount), nonce,
    left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey())
  );
}

export circuit send(coin: ShieldedCoinInfo, to: ZswapCoinPublicKey, amount: Uint<128>): ShieldedSendResult {
  receiveShielded(disclose(coin));
  return sendImmediateShielded(disclose(coin), left<ZswapCoinPublicKey, ContractAddress>(disclose(to)), disclose(amount));
}
```

## Unshielded Token Operations

| Function | Signature | Returns |
|----------|-----------|---------|
| `mintUnshieldedToken` | `(domainSep: Bytes<32>, value: Uint<64>, recipient: Either<ContractAddress, UserAddress>)` | `Bytes<32>` (color) |
| `sendUnshielded` | `(color: Bytes<32>, amount: Uint<128>, recipient: Either<ContractAddress, UserAddress>)` | `[]` |
| `receiveUnshielded` | `(color: Bytes<32>, amount: Uint<128>)` | `[]` |
| `unshieldedBalance` | `(color: Bytes<32>)` | `Uint<128>` |
| `unshieldedBalanceLt/Gte/Gt/Lte` | `(color: Bytes<32>, amount: Uint<128>)` | `Boolean` |

> **Caveat:** `unshieldedBalance()` returns the balance at *transaction construction time*, not at application time. If the balance changes between construction and application, the transaction fails. Prefer the comparison functions (`unshieldedBalanceLt`, `unshieldedBalanceGte`, etc.) unless you specifically need an exact-match constraint.

```compact
export circuit mintToSelf(domainSep: Bytes<32>, amount: Uint<64>): Bytes<32> {
  const color = mintUnshieldedToken(
    disclose(domainSep), disclose(amount),
    left<ContractAddress, UserAddress>(kernel.self())
  );
  receiveUnshielded(color, disclose(amount) as Uint<128>);
  return color;
}
```

## Token Colors & Identification

A token color (type) is a `Bytes<32>` value derived from the contract address and a domain separator:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `tokenType` | `(domainSep: Bytes<32>, contract: ContractAddress): Bytes<32>` | Compute color for another contract's token |
| `nativeToken` | `(): Bytes<32>` | Returns the zero value (NIGHT token color) |

Colors are deterministic: the same `(domainSep, contractAddress)` pair always yields the same color. A contract can issue multiple token types by using different domain separators. The `color` field in `ShieldedCoinInfo` identifies which token a coin represents.

## NIGHT & DUST

**NIGHT** is Midnight's native utility token. It exists as UTXOs on the ledger with the zero token color (`nativeToken()`). NIGHT is used for staking, governance, and generating DUST.

**DUST** is a shielded network resource, **not** a token. It is generated from NIGHT over time when NIGHT UTXOs are registered for dust generation. Key properties:
- Non-transferable: cannot be sent to other users
- Used exclusively for transaction fees
- Proportional to NIGHT balance; decays when disconnected from NIGHT
- Provides operational predictability: no volatile gas prices

On testnet, these are called **tNIGHT** and **tDUST**. Contracts cannot mint, send, or manipulate NIGHT or DUST directly through standard library functions.

## Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `kernel.mintShielded(dom, amt)` | `mintShieldedToken(dom, amt, nonce, recipient)` | `kernel.mintShielded` is the low-level Kernel op; use the standard library wrapper which also returns `ShieldedCoinInfo` |
| `unshieldedBalance(color)` for conditional logic | `unshieldedBalanceGte(color, amount)` | `unshieldedBalance` locks the exact balance at construction time; comparison functions are more robust |
| Omitting `disclose()` on token params | `mintShieldedToken(disclose(dom), ...)` | Witness-derived values passed to token functions must be disclosed |
| Sending shielded to `ContractAddress` without `receiveShielded` | Call `receiveShielded(coin)` in the receiving contract | The receiving contract must explicitly accept the coin |
| `Uint<64>` for shielded amounts in send/receive | `Uint<128>` | `ShieldedCoinInfo.value`, `sendShielded`, and `sendImmediateShielded` use `Uint<128>` |
| `Uint<128>` for `mintShieldedToken` value | `Uint<64>` | `mintShieldedToken` accepts `Uint<64>` for the value parameter, not `Uint<128>` |
| Minting unshielded to self without receiving | Call `receiveUnshielded(color, amount)` after `mintUnshieldedToken` | The contract must receive its own minted unshielded tokens to update its balance |

## Reference Routing

| Topic | Reference File |
|-------|---------------|
| Token architecture, shielded vs unshielded deep dive, UTXO vs account model | `references/token-architecture.md` |
| Complete function signatures, detailed parameters, nonce management, merge strategies | `references/token-operations.md` |
| OpenZeppelin FungibleToken, NonFungibleToken, MultiToken patterns and examples | `references/token-patterns.md` |

| Example | File |
|---------|------|
| ERC-20 style fungible token (OpenZeppelin `Initializable` dep vendored alongside) | `examples/FungibleToken.compact` |
| Non-fungible token with ownership tracking (OpenZeppelin `Initializable` + `Utils` deps vendored alongside) | `examples/NonFungibleToken.compact` |
| Multi-token collection with mint/burn per ID (OpenZeppelin `Initializable` dep vendored alongside) | `examples/MultiToken.compact` |
| Confidential (encrypted-balance) fungible token via ElGamal — upstream OpenZeppelin replacement for the archived ShieldedERC20 (`crypto/ElGamal` + `crypto/EcdhMask` deps vendored alongside) | `examples/ConfidentialFungibleToken.compact` |
