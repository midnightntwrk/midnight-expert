# Value Handling Patterns

Patterns for managing shielded tokens, escrow, and pooled funds.

## Escrow

**Purpose:** Hold funds in a contract until conditions are met, then release or refund.
**Complexity:** Intermediate
**Key Primitives:** `receiveShielded`, `sendShielded`, `QualifiedShieldedCoinInfo`, state machine

### When to Use

- Two-party trades where funds must be held until delivery
- Conditional payments that depend on off-chain events
- Dispute resolution with refund paths

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export enum EscrowState { awaiting_deposit, funded, released, refunded }
export ledger escrowState: EscrowState;
export ledger heldFunds: QualifiedShieldedCoinInfo;
export ledger hasFunds: Boolean;
export sealed ledger depositor: Bytes<32>;
export sealed ledger beneficiary: Bytes<32>;
export sealed ledger arbiter: Bytes<32>;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:escrow:pk:"), sk
  ]);
}

constructor(beneficiaryPk: Bytes<32>, arbiterPk: Bytes<32>) {
  escrowState = EscrowState.awaiting_deposit;
  depositor = disclose(get_public_key(local_secret_key()));
  beneficiary = disclose(beneficiaryPk);
  arbiter = disclose(arbiterPk);
  hasFunds = false;
}

// Depositor funds the escrow
export circuit deposit(coin: ShieldedCoinInfo): [] {
  assert(escrowState == EscrowState.awaiting_deposit, "Not awaiting deposit");
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == depositor), "Only depositor can fund");
  receiveShielded(disclose(coin));
  heldFunds.writeCoin(disclose(coin),
    right<ZswapCoinPublicKey, ContractAddress>(kernel.self()));
  hasFunds = true;
  escrowState = EscrowState.funded;
}

// Arbiter releases funds to beneficiary
export circuit release(): ShieldedCoinInfo {
  assert(escrowState == EscrowState.funded, "Not funded");
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == arbiter), "Only arbiter can release");
  const result = sendShielded(heldFunds,
    left<ZswapCoinPublicKey, ContractAddress>(
      ZswapCoinPublicKey{ bytes: beneficiary }),
    heldFunds.value);
  hasFunds = false;
  escrowState = EscrowState.released;
  return result.sent;
}

// Arbiter refunds to depositor
export circuit refund(): ShieldedCoinInfo {
  assert(escrowState == EscrowState.funded, "Not funded");
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == arbiter), "Only arbiter can refund");
  const result = sendShielded(heldFunds,
    left<ZswapCoinPublicKey, ContractAddress>(
      ZswapCoinPublicKey{ bytes: depositor }),
    heldFunds.value);
  hasFunds = false;
  escrowState = EscrowState.refunded;
  return result.sent;
}
```

### Privacy Considerations

- The escrow state (`EscrowState`) is public. Everyone sees whether funds are
  held, released, or refunded.
- Depositor, beneficiary, and arbiter public keys are `sealed` and visible on-chain.
- The held amount is visible through the `QualifiedShieldedCoinInfo` value field.
- For private escrow (hidden amounts), use shielded tokens with the contract as
  a temporary holder and avoid storing the coin info in public ledger state.

### Test Considerations

- Verify deposit only works in `awaiting_deposit` state
- Verify only depositor can deposit
- Verify only arbiter can release or refund
- Verify release sends to beneficiary
- Verify refund sends to depositor
- Verify double-release fails (state already released)
- Test with zero-value coins (should be rejected)

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| Not calling `receiveShielded` before holding | Call `receiveShielded(coin)` first | Contract must explicitly accept the coin |
| Releasing without checking escrow state | Always assert `escrowState == EscrowState.funded` | Prevents double-release or release of unfunded escrow |

---

## Treasury / Pot Management

**Purpose:** Manage pooled funds with controlled deposits and withdrawals.
**Complexity:** Intermediate
**Key Primitives:** `QualifiedShieldedCoinInfo`, `mergeCoinImmediate`, `sendShielded`

### When to Use

- DAOs with a shared treasury
- Games with a shared pot (stakes pooled from multiple players)
- Any contract that accumulates funds from multiple sources

### Implementation

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger pot: QualifiedShieldedCoinInfo;
export ledger potHasCoin: Boolean;
export sealed ledger owner: Bytes<32>;

witness local_secret_key(): Bytes<32>;

circuit get_public_key(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([
    pad(32, "myapp:treasury:pk:"), sk
  ]);
}

constructor() {
  owner = disclose(get_public_key(local_secret_key()));
  potHasCoin = false;
}

circuit requireOwner(): [] {
  const sk = local_secret_key();
  assert(disclose(get_public_key(sk) == owner), "Not authorized");
}

// Anyone can contribute funds to the pot
export circuit contribute(coin: ShieldedCoinInfo): [] {
  receiveShielded(disclose(coin));
  if (!potHasCoin) {
    // First contribution: initialize pot
    pot.writeCoin(disclose(coin),
      right<ZswapCoinPublicKey, ContractAddress>(kernel.self()));
    potHasCoin = true;
  } else {
    // Subsequent contributions: merge into existing pot
    pot.writeCoin(mergeCoinImmediate(pot, disclose(coin)),
      right<ZswapCoinPublicKey, ContractAddress>(kernel.self()));
  }
}

// Owner can withdraw a specific amount from the pot
export circuit withdraw(recipient: ZswapCoinPublicKey, amount: Uint<128>): ShieldedCoinInfo {
  requireOwner();
  assert(potHasCoin, "Treasury is empty");
  const result = sendShielded(pot, left<ZswapCoinPublicKey, ContractAddress>(
    disclose(recipient)), disclose(amount));
  // Update pot with change (if any)
  if (disclose(result.change.is_some)) {
    pot.writeCoin(result.change.value,
      right<ZswapCoinPublicKey, ContractAddress>(kernel.self()));
  } else {
    potHasCoin = false;
  }
  return result.sent;
}
```

### Privacy Considerations

- The pot amount is stored in `QualifiedShieldedCoinInfo.value`, which is public
  on-chain. Everyone can see the total treasury balance.
- Contribution amounts are visible (coins must be disclosed to `receiveShielded`).
- Withdrawal amounts and recipients are visible.
- For a more private treasury, consider holding funds in a shielded address
  controlled by the contract rather than in public ledger state.

### Test Considerations

- Verify first contribution initializes the pot correctly
- Verify subsequent contributions merge correctly (total increases)
- Verify withdrawal sends correct amount to recipient
- Verify withdrawal updates pot with remaining change
- Verify full withdrawal sets `potHasCoin = false`
- Verify withdrawal fails on empty treasury
- Test with multiple contributions from different users
- Test withdrawal of more than pot balance fails

### Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `receiveShielded(coin)` without `disclose()` | `receiveShielded(disclose(coin))` | Coin info from witness needs disclosure |
| Not tracking `potHasCoin` flag | Use a boolean to track first vs subsequent contributions | First contribution uses `writeCoin`, subsequent use `mergeCoinImmediate` |
| Ignoring `result.change` after `sendShielded` | Always handle the change coin | Unhandled change means lost funds |
