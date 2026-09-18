---
name: midnight-cq:dapp-connector-testing
description: >-
  This skill should be used when the user asks to test DApp Connector API
  integration, test wallet connection, test makeTransfer, test
  balanceTransaction, test submitTransaction, mock ConnectedAPI, stub wallet
  for tests, test wallet errors, test PermissionRejected, test Disconnected
  handling, test progressive enhancement, write wallet integration tests,
  test DApp Connector error codes, test wallet discovery, test window.midnight,
  test apiVersion, test signData, or test DApp Connector security.
version: 0.1.0
---

# DApp Connector API Testing

> **Last verified:** 2026-09-18 — checked against `@midnight-ntwrk/dapp-connector-api` 4.0.1: all 16 documented `ConnectedAPI` methods and all 5 error codes (`InternalError`, `InvalidRequest`, `Rejected`, `PermissionRejected`, `Disconnected`) are present in the published type definitions; the `apiVersion` 4.0.1 fixture matches the current package.

Write tests for DApp code that integrates with the wallet through the
DApp Connector API — the `window.midnight` injection, `InitialAPI.connect()`,
and the `ConnectedAPI` methods.

## When to Use This Skill

| Question | Skill |
|----------|-------|
| Am I testing my DApp's wallet integration code? | **dapp-connector-testing** (this skill) |
| Am I building a custom wallet variant or capability? | `wallet-testing` |
| Am I testing Compact contract logic? | `compact-testing` |
| Am I testing DApp UI flows end-to-end? | `dapp-testing` |

**Relationship to `dapp-testing`:** This skill covers the API contract between
your DApp and the wallet. `dapp-testing` covers Playwright E2E and UI flows.
They complement each other — use both.

## What You're Testing

### Connection Lifecycle

- Wallet discovery via `window.midnight`
- `apiVersion` validation (semver)
- `connect(networkId)` success and failure
- Disconnection and reconnection

### ConnectedAPI Methods

| Category | Methods |
|----------|---------|
| Balance queries | `getShieldedBalances`, `getUnshieldedBalances`, `getDustBalance` |
| Address queries | `getShieldedAddresses`, `getUnshieldedAddress`, `getDustAddress` |
| Transaction creation | `makeTransfer`, `makeIntent` |
| Transaction balancing | `balanceUnsealedTransaction`, `balanceSealedTransaction` |
| Transaction submission | `submitTransaction` |
| Data signing | `signData` |
| Configuration | `getConfiguration`, `getConnectionStatus` |
| Proving delegation | `getProvingProvider` |
| Permissions | `hintUsage` |

### Error Handling

The DApp Connector API defines 5 error codes. Your DApp must handle each correctly:

| Error Code | Meaning | DApp Behavior |
|---|---|---|
| `InternalError` | Wallet can't process request | Show error to user |
| `InvalidRequest` | Malformed request from DApp | Fix request, don't retry |
| `Rejected` | User rejected this specific action (transient) | Allow retry |
| `PermissionRejected` | Permission denied for method (permanent per session) | Don't retry, degrade gracefully |
| `Disconnected` | Connection lost | Attempt reconnection |

The critical distinction: `Rejected` is transient (user said "no" to one
transaction), `PermissionRejected` is permanent (user doesn't want this DApp
using that method at all). Your tests must verify your DApp handles both
correctly.

## Wallet Stub Pattern

Build a configurable test double that implements `InitialAPI` and `ConnectedAPI`:

```typescript
function createWalletStub(config?: Partial<StubConfig>): InitialAPI {
  const cfg = { ...defaultConfig, ...config };

  return Object.freeze({
    rdns: 'com.test.wallet',
    name: cfg.name ?? 'Test Wallet',
    icon: cfg.icon ?? 'data:image/png;base64,...',
    apiVersion: cfg.apiVersion ?? '4.0.1',
    connect: async (networkId) => {
      if (cfg.connectError) throw createAPIError(cfg.connectError);
      return createConnectedStub(cfg);
    },
  });
}

function createConnectedStub(cfg: StubConfig): ConnectedAPI {
  return {
    getShieldedBalances: async () => {
      if (cfg.errors?.getShieldedBalances) throw createAPIError(cfg.errors.getShieldedBalances);
      return cfg.shieldedBalances ?? {};
    },
    getUnshieldedBalances: async () => cfg.unshieldedBalances ?? {},
    getDustBalance: async () => cfg.dustBalance ?? { cap: 0n, balance: 0n },
    // ... all other ConnectedAPI methods
    submitTransaction: async (tx) => {
      if (cfg.errors?.submitTransaction) throw createAPIError(cfg.errors.submitTransaction);
    },
  };
}
```

See `references/connector-stub-patterns.md` for complete implementations.

## Testing Error Handling

```typescript
it('should retry after Rejected', async () => {
  let callCount = 0;
  const stub = createWalletStub();
  const wallet = await stub.connect('undeployed');

  // Wrap submitTransaction with a closure so the error
  // is evaluated per-call, not at object creation time
  const originalSubmit = wallet.submitTransaction.bind(wallet);
  wallet.submitTransaction = async (tx) => {
    if (callCount++ === 0) throw createAPIError('Rejected');
    return originalSubmit(tx);
  };

  // First call → Rejected, DApp shows "try again"
  await expect(wallet.submitTransaction('tx')).rejects.toMatchObject({
    code: 'Rejected',
  });
  // Second call → success
  await wallet.submitTransaction('tx');
});

it('should not retry after PermissionRejected', async () => {
  const stub = createWalletStub({
    errors: { getShieldedBalances: 'PermissionRejected' },
  });
  // DApp should hide shielded balance UI, not keep calling
});

it('should attempt reconnection after Disconnected', async () => {
  const stub = createWalletStub({
    connectError: 'Disconnected',
  });
  // DApp should show reconnecting state
});
```

See `references/error-handling-patterns.md` for complete patterns.

## Progressive Enhancement Testing

Test that your DApp degrades gracefully when the wallet doesn't support
certain methods:

```typescript
it('should work without getProvingProvider', async () => {
  const stub = createWalletStub({
    errors: { getProvingProvider: 'PermissionRejected' },
  });
  // DApp should fall back to client-side proving
});

it('should work without hintUsage', async () => {
  const stub = createWalletStub({
    errors: { hintUsage: 'PermissionRejected' },
  });
  // DApp should still function, just without pre-prompted permissions
});
```

## Security Testing

The DApp Connector spec requires DApps to sanitize wallet-provided data:

```typescript
it('should sanitize wallet name to prevent XSS', () => {
  const stub = createWalletStub({
    name: '<script>alert("xss")</script>',
  });
  // Render wallet selector UI
  // Assert no script execution, name displayed as text
});

it('should render wallet icon in img tag only', () => {
  const stub = createWalletStub({
    icon: 'data:image/svg+xml,...', // SVG can contain scripts
  });
  // Assert icon is rendered as <img src="...">, not inline SVG
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Fix |
|---|---|---|
| Not testing PermissionRejected separately from Rejected | They require different DApp responses | Write separate tests for each |
| Hard-coding balance values in assertions | Brittle; values change with stub config | Assert on structure and relationships |
| Not testing Disconnected recovery | Users will lose connection | Test reconnection flow |
| Testing only happy-path connect | Real wallets reject connections | Test connect with every error code |
| Skipping hintUsage testing | Wallet may prompt user based on hints | Test that DApp sends hints before method calls |
| Using wallet stub for contract logic testing | Wrong tool; contract logic needs the simulator | Use `compact-testing` for contract logic |

## Reference Files

| Topic | Reference |
|-------|-----------|
| Complete ConnectedAPI stub, factory functions, scenario configurations | `references/connector-stub-patterns.md` |
| Error code test patterns, progressive enhancement, XSS prevention | `references/error-handling-patterns.md` |
