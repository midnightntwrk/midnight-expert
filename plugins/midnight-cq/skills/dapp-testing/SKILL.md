---
name: midnight-cq:dapp-testing
description: >-
  This skill should be used when the user asks to test my dapp, write e2e
  tests, test wallet connection, playwright midnight, test transaction UI,
  integration test frontend, end-to-end test, browser test, test UI with
  contract, write Playwright tests for a Midnight dapp, mock ContractProvider,
  test wallet disconnect, test confirmation screen, test rejected transaction,
  test contract state displayed in the UI, test React components with contract
  simulator, mock wallet in tests, or set up e2e testing. NOT for testing
  Compact contract logic in isolation — see midnight-cq:compact-testing.
version: 0.1.0
---

# Midnight DApp Testing

> **Last verified:** 2026-09-17 — simulator import corrected to `@openzeppelin/compact-simulator@0.3.1` (verified on npm to export `createSimulator`).

> "If you're testing contract logic, use `midnight-cq:compact-testing`. If
> you're testing that the UI correctly calls contracts and displays results,
> you're here."

## Testing Layers

Every Midnight DApp has three testing layers. Use the right tool at each layer
— do not collapse them.

```
┌────────────────────────────────────────────────────────────┐
│  Layer 3 – E2E Tests                                       │
│  Tool: Playwright (always headless)                        │
│  Scope: Full browser flows — wallet connect, submit tx,    │
│         confirmation screen, error modals                  │
├────────────────────────────────────────────────────────────┤
│  Layer 2 – Integration Tests                               │
│  Tool: Vitest                                              │
│  Scope: Frontend components + contract simulator           │
│         ContractProvider mocked to wrap simulator          │
├────────────────────────────────────────────────────────────┤
│  Layer 1 – Unit Tests                                      │
│  Tool: Vitest (contracts via midnight-cq:compact-testing)  │
│  Scope: Contract logic in isolation; pure TypeScript       │
│         utilities; component logic without DOM             │
└────────────────────────────────────────────────────────────┘
```

Layer 1 is covered by `midnight-cq:compact-testing`. This skill starts at Layer 2.

## Decision Guide

| Question | Answer |
|----------|--------|
| Does the test call a Compact circuit directly? | Use `midnight-cq:compact-testing` |
| Does the test verify UI renders correct contract state? | You are here |
| Does the test simulate a user clicking through a flow? | You are here (E2E) |
| Does the test check a pure utility function? | Plain Vitest, no skill needed |

## Layer 2 — Integration Tests (Vitest + Simulator)

The Midnight SDK's `ContractProvider` bridges frontend components and the
blockchain. In integration tests, swap it for a mock that wraps the contract
simulator instead of hitting a live network.

### ContractProvider Mocking Pattern

```typescript
// tests/integration/setup.ts
import { createSimulator } from '@openzeppelin/compact-simulator';
import { MyContractSimulator } from '../simulators/MyContractSimulator';

export function createMockContractProvider() {
  const simulator = new MyContractSimulator(/* initial args */);

  return {
    // Mirror the real ContractProvider interface
    callCircuit: vi.fn(async (circuit: string, args: unknown[]) => {
      const fn = (simulator.circuits.impure as Record<string, (...a: unknown[]) => unknown>)[circuit];
      if (!fn) throw new Error(`Unknown circuit: ${circuit}`);
      return fn(...args);
    }),
    queryState: vi.fn(async () => simulator.getPublicState()),
  };
}
```

```typescript
// tests/integration/MyComponent.test.ts
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContractContext } from '../../src/context/ContractContext';
import { createMockContractProvider } from './setup';
import { MyComponent } from '../../src/components/MyComponent';

describe('MyComponent — integration', () => {
  let provider: ReturnType<typeof createMockContractProvider>;

  beforeEach(() => {
    provider = createMockContractProvider();
  });

  it('displays contract state after mount', async () => {
    render(
      <ContractContext.Provider value={provider}>
        <MyComponent />
      </ContractContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('contract-value')).toHaveTextContent('42'),
    );
  });

  it('calls callCircuit on button click', async () => {
    render(
      <ContractContext.Provider value={provider}>
        <MyComponent />
      </ContractContext.Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(provider.callCircuit).toHaveBeenCalledOnce();
  });
});
```

## Layer 3 — E2E Tests (Playwright)

### Hard Rules

- **Always headless.** No exceptions. `headless: false` must never appear in
  committed test code or CI configuration.
- Use the **page object pattern** — never access `page.locator()` directly
  inside test blocks.
- All test files live under `tests/e2e/`.

### Project Layout

```
tests/
  e2e/
    pages/
      WalletPage.ts        # Page object: wallet connect/disconnect
      TransactionPage.ts   # Page object: tx submission + confirmation
      ErrorPage.ts         # Page object: error state helpers
    wallet-connection.spec.ts
    transaction-flow.spec.ts
    error-states.spec.ts
  integration/
    ...                    # Vitest integration tests (Layer 2)
playwright.config.ts
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    headless: true,   // always — never change this
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Page Object Pattern

```typescript
// tests/e2e/pages/WalletPage.ts
import { type Page, type Locator } from '@playwright/test';

export class WalletPage {
  readonly connectButton: Locator;
  readonly disconnectButton: Locator;
  readonly walletAddress: Locator;

  constructor(private page: Page) {
    this.connectButton = page.getByRole('button', { name: /connect wallet/i });
    this.disconnectButton = page.getByRole('button', { name: /disconnect/i });
    this.walletAddress = page.getByTestId('wallet-address');
  }

  async connect() {
    await this.connectButton.click();
    // Handle wallet extension popup if present
    await this.page.waitForSelector('[data-testid="wallet-address"]');
  }

  async disconnect() {
    await this.disconnectButton.click();
    await this.connectButton.waitFor();
  }
}
```

Follow the same pattern for `TransactionPage` and `ErrorPage`: locators in
the constructor, multi-step flows in named methods.

## Key DApp Test Scenarios

| Scenario | Layer | Notes |
|----------|-------|-------|
| Wallet connects successfully | E2E | Assert address displayed |
| Wallet disconnects | E2E | Assert connect button returns |
| Transaction submission flow | E2E | Pending → confirmed state |
| Confirmation UI shown | E2E | Check confirmation banner/hash |
| Transaction rejected by user | E2E | Assert rejection error message |
| Network error during submission | E2E | Assert error modal, retry option |
| Contract state displayed on mount | Integration | Provider mock returns simulator state |
| State updates after transaction | Integration | callCircuit → re-query → UI refresh |
| Error state from bad contract call | Integration | Provider throws → UI shows error |

### Wallet Mocking for E2E

When a real browser wallet extension is unavailable in CI, inject a stub via
`page.addInitScript()` before any app code runs. The stub must match the real
DApp Connector API shape: `window.midnight` is a record keyed by the wallet's
rdns, each value an `InitialAPI` (`{ rdns, name, icon, apiVersion, connect(networkId) }`)
whose `connect()` resolves to a `ConnectedAPI` — see
`references/playwright-patterns.md` for the full fixture pattern.

```typescript
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).midnight = {
      'com.test.wallet': {
        rdns: 'com.test.wallet',
        name: 'MockWallet',
        icon: 'data:image/png;base64,iVBORw0KGgo=',
        apiVersion: '4.0.1',
        connect: async (_networkId: string) => ({
          getShieldedAddresses: async () => ({
            shieldedAddress: 'mn_shield-addr_test',
            shieldedCoinPublicKey: '0'.repeat(64),
            shieldedEncryptionPublicKey: '0'.repeat(64),
          }),
          getUnshieldedAddress: async () => ({ unshieldedAddress: 'mn_addr_test' }),
          submitTransaction: async (_tx: string) => {},
          getConnectionStatus: async () => ({ status: 'connected', networkId: _networkId }),
        }),
      },
    };
  });
});
```

### Async Blockchain Assertions

Blockchain state transitions are async. Always use `waitFor` or Playwright's
built-in auto-waiting rather than asserting on immediately-resolved values:

```typescript
// GOOD — waits up to 30 s for confirmation banner
await expect(txPage.confirmationBanner).toBeVisible({ timeout: 30_000 });

// BAD — races the async state update
expect(await page.locator('[data-testid="tx-confirmed"]').count()).toBe(1);
```

## Reference Files

| Reference | Contents |
|-----------|----------|
| `references/playwright-patterns.md` | Page objects, wallet mocking, async blockchain assertions |
| `references/integration-testing.md` | Simulator in frontend tests, ContractProvider mocking |
