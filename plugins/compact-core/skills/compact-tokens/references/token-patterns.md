# Token Patterns

Practical recipes for minting, transferring, and burning tokens, plus OpenZeppelin contract patterns and known limitations.

## Minting Patterns

The standard library provides two minting primitives: `mintShieldedToken` for private coins and `mintUnshieldedToken` for on-chain balances. Each has distinct type signatures and usage patterns.

### Shielded Mint with Domain Separator

The most common shielded mint. The domain separator (`pad(32, "mytoken:")`) combined with the contract address produces a unique color. A nonce must be evolved for each mint to avoid coin collisions.

```compact
export ledger counter: Counter;
export ledger nonce: Bytes<32>;

export circuit mint(amount: Uint<64>, recipient: Either<ZswapCoinPublicKey, ContractAddress>): ShieldedCoinInfo {
  counter.increment(1);
  const newNonce = evolveNonce(counter.read() as Uint<128>, nonce);
  nonce = newNonce;
  const domain = pad(32, "mytoken:");
  return mintShieldedToken(disclose(domain), disclose(amount), nonce,
    disclose(recipient));
}
```

Key points:

- `mintShieldedToken` accepts `Uint<64>` for amount -- not `Uint<128>`. This is a compiler constraint.
- The nonce must be unique per mint. Use `evolveNonce(counter, nonce)` to derive it deterministically.
- The return value is a `ShieldedCoinInfo` containing `nonce`, `color`, and `value`.

### Unshielded Mint to Self (Contract Holds Tokens)

Mints tokens and immediately credits them to the contract's own balance. The contract can later distribute them via `sendUnshielded`.

```compact
export circuit mintToSelf(amount: Uint<64>): Bytes<32> {
  const domain = pad(32, "mytoken:");
  const color = mintUnshieldedToken(disclose(domain), disclose(amount),
    left<ContractAddress, UserAddress>(kernel.self()));
  receiveUnshielded(color, disclose(amount) as Uint<128>);
  return color;
}
```

The `left<ContractAddress, UserAddress>(kernel.self())` wraps the contract's own address as the recipient. `receiveUnshielded` credits the minted amount to the contract's on-chain balance for that color.

### Unshielded Mint to User

Mints tokens directly to a user's address. The tokens appear in the user's unshielded balance without the contract holding them.

```compact
export circuit mintToUser(amount: Uint<64>, user: UserAddress): Bytes<32> {
  const domain = pad(32, "mytoken:");
  return mintUnshieldedToken(disclose(domain), disclose(amount),
    right<ContractAddress, UserAddress>(disclose(user)));
}
```

The `right<ContractAddress, UserAddress>(disclose(user))` wraps the user address as the recipient. Note the `Either<ContractAddress, UserAddress>` type for unshielded recipients differs from the `Either<ZswapCoinPublicKey, ContractAddress>` type used by shielded operations.

### Mint with Access Control

Composing the Ownable module with minting restricts who can create new tokens. Import the module with a prefix and call `assertOnlyOwner()` before the mint.

```compact
import "access/Ownable" prefix Ownable_;

export circuit mint(amount: Uint<64>, recipient: UserAddress): Bytes<32> {
  Ownable_assertOnlyOwner();
  const domain = pad(32, "mytoken:");
  return mintUnshieldedToken(disclose(domain), disclose(amount),
    right<ContractAddress, UserAddress>(disclose(recipient)));
}
```

## Transfer Patterns

### Shielded Send with Change Handling

When sending shielded tokens, the `sendImmediateShielded` function may produce change if the input coin value exceeds the send amount. Always handle the change output.

```compact
export circuit send(coin: ShieldedCoinInfo,
                    recipient: Either<ZswapCoinPublicKey, ContractAddress>,
                    amount: Uint<128>): ShieldedSendResult {
  receiveShielded(disclose(coin));
  const result = sendImmediateShielded(disclose(coin), disclose(recipient),
    disclose(amount));

  // Always return change to the caller
  if (result.change.is_some) {
    const caller = left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey());
    sendImmediateShielded(result.change.value, caller, result.change.value.value);
  }

  return result;
}
```

The `ShieldedSendResult` struct contains:

| Field | Type | Description |
|-------|------|-------------|
| `sent` | `ShieldedCoinInfo` | The coin sent to the recipient |
| `change` | `Maybe<ShieldedCoinInfo>` | Leftover value if input exceeded amount |

If `result.change.is_some` is true, `result.change.value` is a valid `ShieldedCoinInfo` that must be sent back to the caller or it will be lost.

### Unshielded Send from Contract Balance

Use `unshieldedBalanceGte` for balance checks -- not `unshieldedBalance()` directly. The `Gte` variant is a comparison intrinsic that does not reveal the actual balance value.

```compact
export circuit withdraw(color: Bytes<32>, amount: Uint<128>,
                        recipient: UserAddress): [] {
  assert(unshieldedBalanceGte(disclose(color), disclose(amount)),
    "Insufficient contract balance");
  sendUnshielded(disclose(color), disclose(amount),
    right<ContractAddress, UserAddress>(disclose(recipient)));
}
```

Available balance comparison intrinsics:

| Function | Signature | Returns true when |
|----------|-----------|-------------------|
| `unshieldedBalanceGte` | `(Bytes<32>, Uint<128>) -> Boolean` | balance >= amount |
| `unshieldedBalanceGt` | `(Bytes<32>, Uint<128>) -> Boolean` | balance > amount |
| `unshieldedBalanceLte` | `(Bytes<32>, Uint<128>) -> Boolean` | balance <= amount |
| `unshieldedBalanceLt` | `(Bytes<32>, Uint<128>) -> Boolean` | balance < amount |

### Contract-to-Contract Transfers

Direct contract-to-contract transfers are not yet supported in Compact. OpenZeppelin uses `_unsafe` circuit variants (e.g., `_unsafeTransfer`, `_unsafeMint`) that allow `ContractAddress` recipients experimentally, but tokens sent to a contract address may become irretrievable until contract-to-contract calls are implemented. Safe variants reject `ContractAddress` recipients entirely.

## Burn Patterns

### Shielded Burn

To burn shielded tokens, send them to `shieldedBurnAddress()`. This is the Zswap protocol's designated burn address -- coins sent there are permanently destroyed.

```compact
export circuit burn(coin: ShieldedCoinInfo, amount: Uint<128>): ShieldedSendResult {
  assert(coin.value >= amount, "Insufficient token amount to burn");

  receiveShielded(disclose(coin));
  const sendRes = sendImmediateShielded(disclose(coin), shieldedBurnAddress(),
    disclose(amount));

  // Return change to caller if input coin exceeded burn amount
  if (sendRes.change.is_some) {
    const caller = left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey());
    sendImmediateShielded(sendRes.change.value, caller,
      sendRes.change.value.value);
  }

  return sendRes;
}
```

### Supply Tracking Caveat

Users can burn shielded tokens directly by sending them to `shieldedBurnAddress()` without going through the contract. This means any on-chain `_totalSupply` counter maintained by the contract becomes inaccurate the moment a user burns outside the contract's circuits.

This is a known, unfixable limitation of the Zswap coin model. The burn address is a protocol-level address, not a contract-controlled endpoint. There is no mechanism for the contract to intercept or account for direct burns.

Consequences:

- `totalSupply()` may return a value higher than the actual circulating supply.
- Any mechanism that depends on accurate total supply (caps, proportional distributions) is unreliable for shielded tokens.
- OpenZeppelin's archived `ShieldedERC20` module documents this explicitly: "There's nothing to prevent users from burning tokens manually by directly sending them to the burn address."

The recommendation from OpenZeppelin is to use unshielded tokens when supply accounting accuracy is required.

## Approval and Delegation

### Allowance Pattern (FungibleToken)

The FungibleToken module implements an ERC-20-style allowance system for unshielded tokens. It uses a nested `Map` for per-owner, per-spender allowances.

Ledger declaration:

```compact
export ledger _allowances: Map<Either<ZswapCoinPublicKey, ContractAddress>,
  Map<Either<ZswapCoinPublicKey, ContractAddress>, Uint<128>>>;
```

The `_approve` circuit sets an allowance:

```compact
export circuit _approve(
  owner: Either<ZswapCoinPublicKey, ContractAddress>,
  spender: Either<ZswapCoinPublicKey, ContractAddress>,
  value: Uint<128>
): [] {
  Initializable_assertInitialized();
  assert(!Utils_isKeyOrAddressZero(owner), "FungibleToken: invalid owner");
  assert(!Utils_isKeyOrAddressZero(spender), "FungibleToken: invalid spender");
  if (!_allowances.member(disclose(owner))) {
    _allowances.insert(disclose(owner),
      default<Map<Either<ZswapCoinPublicKey, ContractAddress>, Uint<128>>>);
  }
  _allowances.lookup(owner).insert(disclose(spender), disclose(value));
}
```

The `_spendAllowance` circuit checks and decrements allowances. Setting the maximum `Uint<128>` value (`340282366920938463463374607431768211455`) grants infinite allowance -- the amount is never decremented.

### Operator Approvals (MultiToken / NonFungibleToken)

For multi-token and non-fungible tokens, OpenZeppelin uses a simpler per-operator boolean approval rather than per-token amounts.

Ledger declaration:

```compact
export ledger _operatorApprovals: Map<Either<ZswapCoinPublicKey, ContractAddress>,
  Map<Either<ZswapCoinPublicKey, ContractAddress>, Boolean>>;
```

The `setApprovalForAll` circuit toggles whether an operator can manage all of an owner's tokens:

```compact
export circuit _setApprovalForAll(
  owner: Either<ZswapCoinPublicKey, ContractAddress>,
  operator: Either<ZswapCoinPublicKey, ContractAddress>,
  approved: Boolean
): [] {
  Initializable_assertInitialized();
  assert(!Utils_isKeyOrAddressZero(operator), "NonFungibleToken: Invalid Operator");
  if (!_operatorApprovals.member(disclose(owner))) {
    _operatorApprovals.insert(disclose(owner),
      default<Map<Either<ZswapCoinPublicKey, ContractAddress>, Boolean>>);
  }
  _operatorApprovals.lookup(owner).insert(disclose(operator), disclose(approved));
}
```

These approval patterns apply only to unshielded contract tokens. Shielded tokens have no approval mechanism because coin ownership is enforced by the Zswap protocol at the UTXO level.

## Supply Tracking

### Unshielded Supply

For unshielded tokens, track total supply in a `Uint<128>` ledger field and update it in every mint/burn circuit. This is reliable because all unshielded token operations go through the contract.

```compact
export ledger _totalSupply: Uint<128>;

circuit _update(fromAddress: Either<ZswapCoinPublicKey, ContractAddress>,
                to: Either<ZswapCoinPublicKey, ContractAddress>,
                value: Uint<128>): [] {
  if (Utils_isKeyOrAddressZero(disclose(fromAddress))) {
    // Mint: increase supply
    _totalSupply = disclose(_totalSupply + value as Uint<128>);
  } else {
    // Transfer: debit sender
    const fromBal = balanceOf(fromAddress);
    assert(fromBal >= value, "FungibleToken: insufficient balance");
    _balances.insert(disclose(fromAddress), disclose(fromBal - value as Uint<128>));
  }

  if (Utils_isKeyOrAddressZero(disclose(to))) {
    // Burn: decrease supply
    _totalSupply = disclose(_totalSupply - value as Uint<128>);
  } else {
    // Transfer: credit receiver
    const toBal = balanceOf(to);
    _balances.insert(disclose(to), disclose(toBal + value as Uint<128>));
  }
}
```

### Shielded Supply

Shielded supply tracking is fundamentally unreliable. See the burn caveat above. If you still need an approximate supply counter for shielded tokens, use `Uint<128>` rather than `Counter`.

### Counter vs Uint for Supply

| Property | `Counter` | `Uint<128>` |
|----------|-----------|-------------|
| Maximum value | `Uint<64>` (18.4 quintillion) | `Uint<128>` (3.4 x 10^38) |
| Step size | `Uint<16>` (max 65535 per increment) | Arbitrary |
| Overflow protection | Built-in | Manual check required |
| Use case | Nonce evolution, sequential IDs | Token supply, balances |

Use `Counter` for nonce evolution and sequential identifiers. Use `Uint<128>` for token supply and balance accounting where large values or arbitrary increments are needed.

## OpenZeppelin Contract Patterns

The OpenZeppelin Contracts for Compact library provides battle-tested modules for token development. These are the key architectural patterns.

### Module Composition

All OpenZeppelin modules are imported with a prefix to namespace their circuits and ledger fields:

```compact
import "token/FungibleToken" prefix FungibleToken_;
import "access/Ownable" prefix Ownable_;
import "security/Pausable" prefix Pausable_;
import "security/Initializable" prefix Initializable_;
```

When consuming a module, call its circuits using the prefix:

```compact
export circuit transfer(to: Either<ZswapCoinPublicKey, ContractAddress>,
                        value: Uint<128>): Boolean {
  Pausable_assertNotPaused();
  return FungibleToken_transfer(to, value);
}
```

Import paths resolve through `node_modules`. In a typical project layout, prefix the path with the submodule location: `"./compact-contracts/node_modules/@openzeppelin/compact-contracts/src/token/FungibleToken"`.

### Initializable Guard

Compact has no native constructor for modules. The `Initializable` module provides a one-time initialization guard using a `_isInitialized` boolean ledger field. Every OpenZeppelin token module calls `Initializable_assertInitialized()` at the start of each circuit. The consuming contract must call the module's `initialize()` in its constructor:

```compact
constructor(_name: Opaque<"string">, _symbol: Opaque<"string">,
            _decimals: Uint<8>,
            _initOwner: Either<ZswapCoinPublicKey, ContractAddress>) {
  Ownable_initialize(_initOwner);
  FungibleToken_initialize(_name, _symbol, _decimals);
}
```

### Safe/Unsafe Circuit Pairs

OpenZeppelin provides two variants for operations that involve a recipient address:

| Variant | Behavior | Example |
|---------|----------|---------|
| Safe (default) | Rejects `ContractAddress` recipients | `_mint`, `transfer`, `transferFrom` |
| Unsafe (prefixed `_unsafe`) | Allows `ContractAddress` recipients | `_unsafeMint`, `_unsafeTransfer`, `_unsafeTransferFrom` |

Safe circuits call `Utils_isContractAddress(account)` and assert it is false. This prevents tokens from being locked in contracts that cannot currently handle them. Once contract-to-contract calls are supported, the unsafe variants may be deprecated.

### The _update Mechanism

The `_update` circuit is the core accounting function in FungibleToken. All mints, burns, and transfers route through it. It uses `shieldedBurnAddress()` as the zero address to distinguish operations:

| Operation | `fromAddress` | `to` |
|-----------|---------------|------|
| Mint | `shieldedBurnAddress()` | recipient |
| Burn | account | `shieldedBurnAddress()` |
| Transfer | sender | recipient |

The `_mint` and `_burn` circuits delegate to `_update`:

```compact
export circuit _unsafeMint(account: Either<ZswapCoinPublicKey, ContractAddress>,
                           value: Uint<128>): [] {
  Initializable_assertInitialized();
  assert(!Utils_isKeyOrAddressZero(account), "FungibleToken: invalid receiver");
  _update(shieldedBurnAddress(), account, value);
}

export circuit _burn(account: Either<ZswapCoinPublicKey, ContractAddress>,
                     value: Uint<128>): [] {
  Initializable_assertInitialized();
  assert(!Utils_isKeyOrAddressZero(account), "FungibleToken: invalid sender");
  _update(account, shieldedBurnAddress(), value);
}
```

### Universal Account Type

All OpenZeppelin token modules use `Either<ZswapCoinPublicKey, ContractAddress>` as the universal account identifier. This covers both user wallets (identified by their Zswap public key) and contracts:

```compact
left<ZswapCoinPublicKey, ContractAddress>(ownPublicKey())   // prover-supplied key
right<ZswapCoinPublicKey, ContractAddress>(contractAddr)     // a contract
```

The `Utils_isKeyOrAddressZero` function checks for the zero address (used as a sentinel for mint/burn). The `Utils_isContractAddress` function checks the `is_left` flag to determine if the account is a contract.

**Security: `ownPublicKey()` is not an identity for authorization.** The snippet above reflects the upstream OpenZeppelin module design, but `ownPublicKey()` returns the prover-supplied `coinPublicKey` from the circuit context (`@midnight-ntwrk/compact-runtime`'s `ownPublicKey()` is literally `circuitContext.currentZswapLocalState.coinPublicKey`) — it is **not** cryptographically bound to the transaction signer. Its only safe use is as a *recipient* for outgoing shielded transfers (routing tokens *to* the caller); using it as an owner/admin/spender for an authorization check is bypassable. The bundled `examples/FungibleToken.compact`, `examples/NonFungibleToken.compact`, and `examples/MultiToken.compact` therefore key every account on a witness-derived `UserPublicKey` (a 32-byte value derived in-circuit from a private `getUserSecret()` secret via a domain-separated `persistentHash`), and identity-sensitive circuits take the already-derived `caller: UserPublicKey` as a parameter rather than calling `ownPublicKey()`. See the `token-operations.md` "Security" note for the full rationale.

### Composing with Access Control

A full example combining Ownable, Pausable, and FungibleToken:

```compact
import "access/Ownable" prefix Ownable_;
import "security/Pausable" prefix Pausable_;
import "token/FungibleToken" prefix FungibleToken_;

constructor(_name: Opaque<"string">, _symbol: Opaque<"string">,
            _decimals: Uint<8>,
            _initOwner: Either<ZswapCoinPublicKey, ContractAddress>,
            _recipient: Either<ZswapCoinPublicKey, ContractAddress>,
            _amount: Uint<128>) {
  Ownable_initialize(_initOwner);
  FungibleToken_initialize(_name, _symbol, _decimals);
  FungibleToken__mint(_recipient, _amount);
}

export circuit transfer(to: Either<ZswapCoinPublicKey, ContractAddress>,
                        value: Uint<128>): Boolean {
  Pausable_assertNotPaused();
  return FungibleToken_transfer(to, value);
}

export circuit pause(): [] {
  Ownable_assertOnlyOwner();
  Pausable__pause();
}

export circuit unpause(): [] {
  Ownable_assertOnlyOwner();
  Pausable__unpause();
}
```

For complete implementations showing these patterns in full context, review the commented example contracts in the `examples/` directory.

## Known Limitations

These constraints apply as of Compact compiler 0.31.1 and the current Midnight protocol.

| Limitation | Detail |
|------------|--------|
| No custom spend logic for shielded tokens | Once a user holds shielded coins, the contract cannot enforce rules on how they are spent. Features like freezing or pausing are impossible for shielded tokens. |
| No contract-to-contract calls | Contracts cannot invoke circuits on other contracts. Tokens sent to a `ContractAddress` may be irretrievable. OpenZeppelin safe variants reject contract recipients. |
| No events in Compact | The language has no event emission mechanism. Off-chain indexing must rely on ledger state diffs. |
| No batch operations | Compact has no dynamic arrays. Operations like batch minting or batch transfers require fixed-size `Vector` types or repeated calls. |
| Maximum integer width is `Uint<128>` | Compact does not support `Uint<256>`. Token amounts, balances, and supply are capped at 128-bit unsigned integers. |
| Shielded mint capped at `Uint<64>` | `mintShieldedToken` accepts `Uint<64>` for the amount parameter. This is a compiler-level constraint that cannot be overridden. |
| ShieldedERC20 is ARCHIVED | The `ShieldedERC20` module in `OpenZeppelin/midnight-apps` is explicitly marked "DO NOT USE IN PRODUCTION." It exists for research purposes only. |
| `sendShielded` does not create coin ciphertexts | The `sendShielded` function does not produce ciphertexts for the recipient, making it unsuitable for direct user-facing transfers where the recipient needs to discover coins. Use `sendImmediateShielded` for transactional sends. |
| No ERC-165-like introspection | There is no standard interface detection mechanism. Contracts cannot query whether another contract implements a specific interface. |
