# Token Operations

> **Last verified:** 2026-09-17 — every type and function below compile-probed against Compact compiler `0.31.1` / language `0.23` / `@midnight-ntwrk/compact-runtime` `0.16.0` with the claimed signatures (value widths, `Either` orderings, struct field layouts confirmed).

Exhaustive API reference for all token-related types and functions in Compact. All types and functions are provided by the standard library (`import CompactStandardLibrary;`).

## Types

### ShieldedCoinInfo

A newly created shielded coin, used when outputting or spending/receiving coins that originate in the current transaction.

```compact
struct ShieldedCoinInfo {
  nonce: Bytes<32>;
  color: Bytes<32>;
  value: Uint<128>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `nonce` | `Bytes<32>` | Unique randomness preventing coin collisions. Derive with `evolveNonce()` |
| `color` | `Bytes<32>` | Token type identifier. Derive with `tokenType()` or use `nativeToken()` |
| `value` | `Uint<128>` | Token amount in atomic units |

### QualifiedShieldedCoinInfo

An existing shielded coin stored in the ledger, ready to be spent. Extends `ShieldedCoinInfo` with a Merkle tree index.

```compact
struct QualifiedShieldedCoinInfo {
  nonce: Bytes<32>;
  color: Bytes<32>;
  value: Uint<128>;
  mt_index: Uint<64>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `nonce` | `Bytes<32>` | Coin randomness |
| `color` | `Bytes<32>` | Token type identifier |
| `value` | `Uint<128>` | Token amount |
| `mt_index` | `Uint<64>` | Index of this coin's commitment in the global Merkle tree |

**Qualified vs unqualified:** A `ShieldedCoinInfo` represents a coin that exists only in the current transaction (not yet committed to the ledger). A `QualifiedShieldedCoinInfo` represents a coin already committed to the ledger's Merkle tree, with its position tracked by `mt_index`. Use `ShieldedCoinInfo` with `sendImmediateShielded` and `receiveShielded`; use `QualifiedShieldedCoinInfo` with `sendShielded` and `mergeCoin`.

### ShieldedSendResult

The return type of `sendShielded` and `sendImmediateShielded`, containing the sent coin and optional change.

```compact
struct ShieldedSendResult {
  change: Maybe<ShieldedCoinInfo>;
  sent: ShieldedCoinInfo;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `change` | `Maybe<ShieldedCoinInfo>` | Remaining value if input exceeds send amount. Check `.is_some` before accessing `.value` |
| `sent` | `ShieldedCoinInfo` | The coin created for the recipient |

### ZswapCoinPublicKey

The public key used to output a shielded coin to a user wallet.

```compact
struct ZswapCoinPublicKey { bytes: Bytes<32>; }
```

### UserAddress

The public key of a user, used as a recipient for unshielded token operations.

```compact
struct UserAddress { bytes: Bytes<32>; }
```

### ContractAddress

The address of a contract, used as a recipient in both shielded and unshielded operations.

```compact
struct ContractAddress { bytes: Bytes<32>; }
```

## Token Type Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `nativeToken()` | -- | `Bytes<32>` | Returns the color of the native token (tNIGHT) |
| `tokenType(domainSep, contract)` | `domainSep: Bytes<32>, contract: ContractAddress` | `Bytes<32>` | Computes a globally namespaced token color from a domain separator and contract address |

A contract can issue tokens for any domain separator it chooses, but collision resistance prevents it from minting another contract's token type. The resulting `Bytes<32>` is used as the `color` field in `ShieldedCoinInfo` and as the color parameter in unshielded functions.

```compact
// Compute the token color for this contract
const color = tokenType(pad(32, "mytoken:"), kernel.self());

// Check if a coin is native
assert(coin.color == nativeToken(), "Not a native token");
```

## Shielded Token Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `mintShieldedToken(domainSep, value, nonce, recipient)` | `domainSep: Bytes<32>, value: Uint<64>, nonce: Bytes<32>, recipient: Either<ZswapCoinPublicKey, ContractAddress>` | `ShieldedCoinInfo` | Mint a new shielded coin and send to recipient |
| `evolveNonce(index, nonce)` | `index: Uint<128>, nonce: Bytes<32>` | `Bytes<32>` | Deterministically derive a nonce from a counter and prior nonce |
| `shieldedBurnAddress()` | -- | `Either<ZswapCoinPublicKey, ContractAddress>` | Returns an address that burns any coins sent to it |
| `receiveShielded(coin)` | `coin: ShieldedCoinInfo` | `[]` | Receive a shielded coin addressed to this contract |
| `sendShielded(input, recipient, value)` | `input: QualifiedShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>, value: Uint<128>` | `ShieldedSendResult` | Send value from a ledger coin to recipient; returns change |
| `sendImmediateShielded(input, target, value)` | `input: ShieldedCoinInfo, target: Either<ZswapCoinPublicKey, ContractAddress>, value: Uint<128>` | `ShieldedSendResult` | Send value from a same-transaction coin to target; returns change |
| `mergeCoin(a, b)` | `a: QualifiedShieldedCoinInfo, b: QualifiedShieldedCoinInfo` | `ShieldedCoinInfo` | Combine two ledger coins into one |
| `mergeCoinImmediate(a, b)` | `a: QualifiedShieldedCoinInfo, b: ShieldedCoinInfo` | `ShieldedCoinInfo` | Combine a ledger coin with a same-transaction coin |
| `ownPublicKey()` | -- | `ZswapCoinPublicKey` | Returns the Zswap coin public key the prover supplies for this transaction. Use it as a token recipient, **not** as an authorization check (see security note below) |
| `createZswapInput(coin)` | `coin: QualifiedShieldedCoinInfo` | `[]` | Low-level: notify context to create a Zswap input |
| `createZswapOutput(coin, recipient)` | `coin: ShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>` | `[]` | Low-level: notify context to create a Zswap output |

### Usage Notes

**`sendShielded` vs `sendImmediateShielded`:** Use `sendShielded` when spending a coin already stored in the ledger (a `QualifiedShieldedCoinInfo` with a valid `mt_index`). Use `sendImmediateShielded` when spending a coin created within the same transaction (a `ShieldedCoinInfo`, such as the result of `mintShieldedToken` or a change coin from a prior send).

**Always handle `ShieldedSendResult.change`:** When the input coin's value exceeds the send amount, the `change` field contains the leftover coin. If you do not store or send this change, the value is lost.

```compact
const res = sendShielded(storedCoin, recipient, amount);
if (res.change.is_some) {
  // Store the change coin back into contract state, or send it onward
  storedCoin.writeCoin(
    res.change.value,
    right<ZswapCoinPublicKey, ContractAddress>(kernel.self())
  );
}
```

**`createZswapInput` and `createZswapOutput` are low-level:** Prefer `sendShielded`, `sendImmediateShielded`, and `receiveShielded`. The low-level functions do not handle coin splitting, change, or validation. Use them only when building custom token protocols.

**`sendShielded` does not create coin ciphertexts:** Sending to a user public key other than the current user (`ownPublicKey()`) will not inform that user of the coin. The recipient must discover the coin through other means.

**Security: `ownPublicKey()` is prover-supplied, not signer-bound.** `ownPublicKey()` returns a value the prover passes into the circuit context (the `coinPublicKey` argument to `createConstructorContext` / `createCircuitContext` in `@midnight-ntwrk/compact-runtime`). It is **not** cryptographically bound to the wallet that signs the transaction — any caller can supply any 32-byte value. Its only safe use is identifying the **recipient** of an outgoing shielded token transfer (routing tokens *to* the caller): if the prover lies, they only lose access to their own coins, so there is no boundary to bypass. Do **not** use it for authorization or identity gating:

- `assert(ownPublicKey() == admin, "...")` is bypassable — any chain reader copies the public `admin` value and supplies it.
- `assert(!blacklist.member(ownPublicKey()), "...")` is bypassable — a blacklisted caller supplies a different value.

For caller identity and access control, derive the public key from a witness-supplied secret instead (see `compact-patterns/references/access-control-patterns.md` and `compact-privacy-disclosure/references/privacy-patterns.md`, which use `get_public_key(sk)` / domain-separated `persistentHash` over a witness secret).

**Nonce management with `evolveNonce`:** Every shielded coin requires a unique nonce. Reusing a nonce compromises privacy by linking coins. Use `evolveNonce` with a counter to derive deterministic nonces from a single seed:

```compact
sealed ledger nonceSeed: Bytes<32>;
export ledger mintCount: Counter;

export circuit mintToken(amount: Uint<64>): ShieldedCoinInfo {
  const idx = mintCount.read();
  mintCount.increment(1);
  const nonce = evolveNonce(mintCount.read() as Uint<128>, nonceSeed);
  return mintShieldedToken(
    pad(32, "mytoken:"),
    disclose(amount),
    nonce,
    left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey())
  );
}
```

**Burning shielded tokens:** Use `shieldedBurnAddress()` as the recipient to permanently destroy coins:

```compact
export circuit burn(coin: QualifiedShieldedCoinInfo): [] {
  sendShielded(
    disclose(coin),
    shieldedBurnAddress(),
    coin.value
  );
}
```

## Unshielded Token Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `mintUnshieldedToken(domainSep, value, recipient)` | `domainSep: Bytes<32>, value: Uint<64>, recipient: Either<ContractAddress, UserAddress>` | `Bytes<32>` | Mint unshielded tokens and send to recipient; returns the coin color |
| `sendUnshielded(color, amount, recipient)` | `color: Bytes<32>, amount: Uint<128>, recipient: Either<ContractAddress, UserAddress>` | `[]` | Send unshielded tokens to a recipient |
| `receiveUnshielded(color, amount)` | `color: Bytes<32>, amount: Uint<128>` | `[]` | Receive unshielded tokens into this contract |
| `unshieldedBalance(color)` | `color: Bytes<32>` | `Uint<128>` | Get contract's balance of the given token type |
| `unshieldedBalanceLt(color, amount)` | `color: Bytes<32>, amount: Uint<128>` | `Boolean` | True if balance < amount |
| `unshieldedBalanceGte(color, amount)` | `color: Bytes<32>, amount: Uint<128>` | `Boolean` | True if balance >= amount |
| `unshieldedBalanceGt(color, amount)` | `color: Bytes<32>, amount: Uint<128>` | `Boolean` | True if balance > amount |
| `unshieldedBalanceLte(color, amount)` | `color: Bytes<32>, amount: Uint<128>` | `Boolean` | True if balance <= amount |

### Usage Notes

**`mintUnshieldedToken` returns the coin color -- save it.** The returned `Bytes<32>` is the token type identifier needed for all subsequent operations with this token. Store it in a ledger field if you need it later.

```compact
export ledger tokenColor: Bytes<32>;

export circuit mint(amount: Uint<64>): [] {
  tokenColor = mintUnshieldedToken(
    pad(32, "mytoken:"),
    disclose(amount),
    left<ContractAddress, UserAddress>(kernel.self())
  );
}
```

**Call `receiveUnshielded` after minting to self.** When a contract mints tokens to its own address, it must also call `receiveUnshielded` to credit its own balance:

```compact
export circuit mintToSelf(domainSep: Bytes<32>, amount: Uint<64>): Bytes<32> {
  const color = mintUnshieldedToken(
    disclose(domainSep),
    disclose(amount),
    left<ContractAddress, UserAddress>(kernel.self())
  );
  receiveUnshielded(color, disclose(amount) as Uint<128>);
  return color;
}
```

**`unshieldedBalance` has a stale-read caveat.** The balance is not updated during contract execution as a result of unshielded sends and receives. It is always fixed to the value provided at the start of execution. Additionally, using `unshieldedBalance` means the transaction will fail if the token balance at application time differs from the balance at construction time. Prefer the comparison functions (`unshieldedBalanceLt`, `unshieldedBalanceGte`, `unshieldedBalanceGt`, `unshieldedBalanceLte`) unless you specifically need the exact value.

**Mint amount is `Uint<64>`, send/balance amounts are `Uint<128>`.** The `mintUnshieldedToken` value parameter is `Uint<64>`, but `sendUnshielded`, `receiveUnshielded`, and all balance functions use `Uint<128>`. Cast when necessary: `disclose(amount) as Uint<128>`.

**Recipient `Either` order is REVERSED from shielded.** Unshielded functions use `Either<ContractAddress, UserAddress>` (contract is `left`, user is `right`), while shielded functions use `Either<ZswapCoinPublicKey, ContractAddress>` (user is `left`, contract is `right`).

## Kernel Token Operations

The `Kernel` type provides low-level token operations via the `kernel` ledger field. Prefer the stdlib wrapper functions above for most use cases.

```compact
ledger kernel: Kernel;
```

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `kernel.mintShielded(domainSep, amount)` | `domainSep: Bytes<32>, amount: Uint<64>` | `[]` | Mint shielded tokens (use `mintShieldedToken` instead) |
| `kernel.mintUnshielded(domainSep, amount)` | `domainSep: Bytes<32>, amount: Uint<64>` | `[]` | Mint unshielded tokens (use `mintUnshieldedToken` instead) |
| `kernel.claimUnshieldedCoinSpend(tokenType, recipient, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, recipient: Either<ContractAddress, UserAddress>, amount: Uint<64>` | `[]` | Claim an unshielded coin spend |
| `kernel.incUnshieldedOutputs(tokenType, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, amount: Uint<64>` | `[]` | Increment unshielded outputs for a token type |
| `kernel.incUnshieldedInputs(tokenType, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, amount: Uint<64>` | `[]` | Increment unshielded inputs for a token type |
| `kernel.balance(tokenType)` | `tokenType: Either<Bytes<32>, Bytes<32>>` | `Uint<128>` | Get contract's balance for a token type |
| `kernel.balanceLessThan(tokenType, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, amount: Uint<128>` | `Boolean` | Check if balance is less than amount |
| `kernel.balanceGreaterThan(tokenType, amount)` | `tokenType: Either<Bytes<32>, Bytes<32>>, amount: Uint<128>` | `Boolean` | Check if balance is greater than amount |

### Claim Operations

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `kernel.claimContractCall(addr, entryPoint, comm)` | `addr: Bytes<32>, entryPoint: Bytes<32>, comm: Field` | `[]` | Claim a contract call in the transaction |
| `kernel.claimZswapCoinReceive(note)` | `note: Bytes<32>` | `[]` | Claim a Zswap coin receive commitment |
| `kernel.claimZswapCoinSpend(note)` | `note: Bytes<32>` | `[]` | Claim a Zswap coin spend commitment |
| `kernel.claimZswapNullifier(nul)` | `nul: Bytes<32>` | `[]` | Claim a Zswap nullifier |

These are low-level building blocks. The stdlib functions (`mintShieldedToken`, `sendShielded`, `mintUnshieldedToken`, `sendUnshielded`, etc.) compose these kernel operations internally with correct bookkeeping. Use kernel methods directly only when implementing custom token protocols or composable contract calls.

## Recipient Addressing

Shielded and unshielded tokens use different `Either` orderings for recipient addresses. Getting the order wrong is a common source of bugs.

### Shielded Recipient: `Either<ZswapCoinPublicKey, ContractAddress>`

- `left` = user wallet (public key)
- `right` = contract address

```compact
// Send shielded tokens to the current user
const toUser = left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey());
sendShielded(storedCoin, toUser, amount);

// Send shielded tokens to this contract (self)
const toSelf = right<ZswapCoinPublicKey, ContractAddress>(kernel.self());
sendShielded(storedCoin, toSelf, amount);
```

### Unshielded Recipient: `Either<ContractAddress, UserAddress>`

- `left` = contract address
- `right` = user address

```compact
// Send unshielded tokens to this contract (self)
const toSelf = left<ContractAddress, UserAddress>(kernel.self());
sendUnshielded(color, amount, toSelf);

// Send unshielded tokens to a user
const toUser = right<ContractAddress, UserAddress>(disclose(userAddr));
sendUnshielded(color, amount, toUser);
```

Note the reversal: for shielded, `left` is user; for unshielded, `left` is contract.

## TypeScript Touchpoints

### Witness for Providing Shielded Coins

When a circuit requires a shielded coin as input, the coin data is typically provided through a witness function. The witness implementation runs in TypeScript and supplies private data to the circuit.

```compact
witness provideCoin(): ShieldedCoinInfo;

export circuit deposit(amount: Uint<128>): [] {
  const coin = provideCoin();
  assert(coin.value >= amount, "Insufficient coin value");
  receiveShielded(disclose(coin));
}
```

```typescript
// TypeScript witness implementation
const provideCoin = (context: WitnessContext): ShieldedCoinInfo => {
  // Select a coin from the wallet's available coins
  const coin = selectCoin(context);
  return coin;
};
```

### Reading Token Balances from Contract State

Exported ledger fields can be read from TypeScript via the generated `ledger()` function:

```typescript
const contractState = await contract.ledger();
// Read exported counters, maps, etc. that track token state
const totalSupply = contractState.totalSupply;
```

### Wallet DUST Registration Flow

Before submitting transactions that interact with tokens, the wallet must have sufficient DUST (fee resource). The typical flow:

1. Create or restore a wallet with a seed phrase
2. Request tNIGHT from the faucet to the unshielded address
3. The wallet automatically registers tNIGHT UTXOs for DUST generation
4. DUST is consumed for ZK proof generation and transaction fees

### TypeScript SDK Token Types

The `@midnight/ledger` package provides TypeScript equivalents for token types:

```typescript
import { shieldedToken, unshieldedToken } from '@midnight/ledger';

// Get the native shielded token type
const shielded = shieldedToken();     // { tag: 'shielded', raw: RawTokenType }

// Get the native unshielded token type
const unshielded = unshieldedToken(); // { tag: 'unshielded', raw: RawTokenType }

// Use .raw for balance lookups
const balance = walletState.unshielded.balances[unshielded.raw];
```

The `raw` field is a hex-encoded 64-character string representing the 32-byte token color. Always use `.raw` when indexing into wallet balance maps.

**Common mistake -- wrong token type for balance lookups:** The old `nativeToken()` from `@midnight-ntwrk/ledger` (v4) returns a tagged 68-character hex token type. The newer wallet SDK stores balances keyed by raw 64-character hex token types. Using the wrong one causes zero-balance reads even when funds are present.

```typescript
// Wrong -- uses old tagged format
import { nativeToken } from '@midnight-ntwrk/ledger';
const balance = state.unshielded.balances[nativeToken()]; // always 0n

// Correct -- uses raw format
import { unshieldedToken } from '@midnight/ledger';
const balance = state.unshielded.balances[unshieldedToken().raw];
```

### Transaction Balancing with Token Transfers

When building transactions that transfer tokens, the wallet handles balancing automatically. The DApp connector API provides methods to balance and sign:

```typescript
// Build a token transfer
const outputsToCreate = [
  {
    type: 'shielded',
    outputs: [
      {
        type: shieldedTokenRaw,
        amount: transferAmount,
        receiverAddress: recipientShieldedAddress,
      },
    ],
  },
];

// The wallet balances the transaction (adds inputs, change outputs, fees)
const txToProve = await wallet.transferTransaction(
  secretKey, dustSecretKey, outputsToCreate, ttl
);
const provenTx = await wallet.finalizeTransaction(txToProve);
const txId = await wallet.submitTransaction(provenTx);
```
