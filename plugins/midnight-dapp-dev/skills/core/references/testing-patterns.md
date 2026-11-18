# Testing Patterns

This reference covers testing strategies for Midnight DApp frontends using
Vitest and Testing Library. It addresses the unique challenges of testing
wallet-connected applications, provider assembly, and RxJS observable
subscriptions in the browser.

## Why Testing Matters for Midnight DApps

Every Midnight DApp repository analyzed during the development of this
plugin — bboard, zkloan, kitties, starter-template, midnight-apps,
midnight-rwa, midnight-seabattle — contained zero frontend tests. No unit
tests, no integration tests, no component tests. This is remarkable for an
ecosystem where incorrect UI behavior can result in failed transactions
and lost tokens.

The absence of tests is understandable: the SDK is complex, wallet mocking
is non-obvious, and there were no established patterns to follow. This
template changes that by providing tested patterns from the start.

## Vitest + Testing Library Setup

### vitest.config.ts

A separate Vitest config is needed because the test environment differs
from the Vite build environment. Tests run in jsdom (not a real browser),
and they should not include Tailwind, WASM, or CommonJS plugins:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

Key settings:

- **environment: 'jsdom'** — Provides a DOM implementation for component tests.
- **globals: true** — Makes `describe`, `it`, `expect` available without imports.
- **setupFiles** — Runs before each test file.
- **css: false** — Disables CSS processing in tests (Tailwind is not needed).

### Setup File (src/test/setup.ts)

```typescript
import '@testing-library/jest-dom/vitest';
```

This single import adds custom matchers like `toBeInTheDocument()`,
`toHaveTextContent()`, and `toBeDisabled()` to Vitest's `expect`.

### Required Dependencies

```json
{
  "devDependencies": {
    "vitest": "^4.1.11",
    "@testing-library/react": "^16.3.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/user-event": "^14.6.0",
    "jsdom": "^26.1.0"
  }
}
```

## Mocking window.midnight

A Midnight wallet extension injects its DApp Connector API into `window.midnight`
under a per-install key — a UUID (per CAIP-372); Lace also aliases itself at
`mnLace`, but that key is not normative. Code should enumerate
`Object.values(window.midnight)` and match on `name`/`rdns` rather than assume a
fixed key. In tests this global does not exist, so you must mock it (key it
however you like — the code under test should discover the wallet by enumeration).

### Creating a Mock InitialAPI

The mock follows the `@midnightntwrk/dapp-connector-api` 4.1.0 types, so every
method resolves to the shape the real wallet returns:

```typescript
import { vi } from 'vitest';
import type { InitialAPI, ConnectedAPI, Configuration } from '@midnightntwrk/dapp-connector-api';

export const mockConfiguration: Configuration = {
  indexerUri: 'http://localhost:8088/api/v4/graphql',
  indexerWsUri: 'ws://localhost:8088/api/v4/graphql/ws',
  substrateNodeUri: 'http://localhost:9944',
  networkId: 'undeployed',
};

// The real wallet returns Bech32m keys. createProviders passes hex through
// parseCoinPublicKeyToHex / parseEncPublicKeyToHex unchanged, so hex keeps the
// mock simple.
const MOCK_COIN_PUBLIC_KEY = 'aa'.repeat(32);
const MOCK_ENC_PUBLIC_KEY = 'bb'.repeat(32);

export function createMockConnectedApi(
  overrides?: Partial<ConnectedAPI>,
): ConnectedAPI {
  return {
    getConfiguration: vi.fn().mockResolvedValue(mockConfiguration),
    getConnectionStatus: vi.fn().mockResolvedValue({ status: 'connected', networkId: 'undeployed' }),
    getShieldedAddresses: vi.fn().mockResolvedValue({
      shieldedAddress: 'mock-shielded-address',
      shieldedCoinPublicKey: MOCK_COIN_PUBLIC_KEY,
      shieldedEncryptionPublicKey: MOCK_ENC_PUBLIC_KEY,
    }),
    getUnshieldedAddress: vi.fn().mockResolvedValue({ unshieldedAddress: 'mock-unshielded-address' }),
    getDustAddress: vi.fn().mockResolvedValue({ dustAddress: 'mock-dust-address' }),
    getShieldedBalances: vi.fn().mockResolvedValue({}),
    getUnshieldedBalances: vi.fn().mockResolvedValue({}),
    getDustBalance: vi.fn().mockResolvedValue({ balance: 0n, cap: 0n }),
    getTxHistory: vi.fn().mockResolvedValue([]),
    makeTransfer: vi.fn().mockResolvedValue({ tx: '00' }),
    makeIntent: vi.fn().mockResolvedValue({ tx: '00' }),
    balanceUnsealedTransaction: vi.fn().mockResolvedValue({ tx: '00' }),
    balanceSealedTransaction: vi.fn().mockResolvedValue({ tx: '00' }),
    submitTransaction: vi.fn().mockResolvedValue(undefined), // resolves to void
    signData: vi.fn().mockResolvedValue({
      scheme: 'schnorr_bip340',
      data: 'mock-data',
      signature: 'mock-sig',
      verifyingKey: 'mock-key',
    }),
    getProvingProvider: vi.fn().mockResolvedValue({
      check: vi.fn().mockResolvedValue([]),
      prove: vi.fn().mockResolvedValue(new Uint8Array()),
    }),
    hintUsage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockInitialApi(
  connectedApi?: ConnectedAPI,
): InitialAPI {
  const api = connectedApi ?? createMockConnectedApi();
  return {
    name: 'Mock Lace',
    icon: 'data:image/png;base64,mock',
    apiVersion: '4.1.0',
    rdns: 'com.mock.lace',
    connect: vi.fn().mockResolvedValue(api),
  };
}
```

### Installing the Mock

Set up and tear down the mock in `beforeEach` / `afterEach`:

```typescript
describe('WalletConnection', () => {
  let mockApi: InitialAPI;

  beforeEach(() => {
    mockApi = createMockInitialApi();
    (window as any).midnight = { 'com.test.wallet': mockApi };
  });

  afterEach(() => {
    delete (window as any).midnight;
    localStorage.clear();
  });
});
```

Always delete `window.midnight` between tests to ensure test isolation.
Always clear `localStorage` because some wallet connection state may be
persisted there.

## Testing Wallet Connection States

A wallet connection has four states: disconnected, connecting, connected,
and error. Test all four:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletProvider } from '@/providers/wallet-provider';

function TestConsumer() {
  const { status, connect, address } = useWallet();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="address">{address ?? 'none'}</span>
      <button onClick={connect}>Connect</button>
    </div>
  );
}

describe('wallet connection states', () => {
  it('starts in disconnected state', () => {
    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
  });

  it('transitions to connected after successful connect', async () => {
    const user = userEvent.setup();
    const mockApi = createMockInitialApi();
    (window as any).midnight = { 'com.test.wallet': mockApi };

    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>,
    );

    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('connected');
    });
    // The template connects to import.meta.env.VITE_NETWORK_ID, default "undeployed".
    expect(mockApi.connect).toHaveBeenCalledWith('undeployed');
  });

  it('shows error when wallet extension is not found', async () => {
    const user = userEvent.setup();
    // Do not set window.midnight — wallet is not installed

    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>,
    );

    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error');
    });
  });

  it('handles user rejection gracefully', async () => {
    const user = userEvent.setup();
    const mockApi = createMockInitialApi();
    mockApi.connect = vi.fn().mockRejectedValue({
      type: 'DAppConnectorAPIError',
      code: 'PermissionRejected',
      reason: 'User declined connection',
    });
    (window as any).midnight = { 'com.test.wallet': mockApi };

    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>,
    );

    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error');
    });
  });
});
```

## Testing Provider Assembly

Test that `createProviders()` assembles all 6 providers and the `config` field
from a `ConnectedAPI`. Use local proving here so the test does not depend on
the wallet's proving provider:

```typescript
import { createProviders } from '@/lib/providers';

describe('createProviders', () => {
  const proving = { mode: 'local', proofServerUrl: 'http://127.0.0.1:6300' } as const;

  it('assembles all 6 providers from ConnectedAPI', async () => {
    const connectedApi = createMockConnectedApi();
    const providers = await createProviders(connectedApi, { proving });

    expect(providers.publicDataProvider).toBeDefined();
    expect(providers.zkConfigProvider).toBeDefined();
    expect(providers.proofProvider).toBeDefined();
    expect(providers.walletProvider).toBeDefined();
    expect(providers.midnightProvider).toBeDefined();
    expect(providers.privateStateProvider).toBeDefined();
  });

  it("takes the network ID from the wallet's configuration", async () => {
    const connectedApi = createMockConnectedApi();
    const providers = await createProviders(connectedApi, { proving });

    expect(connectedApi.getConfiguration).toHaveBeenCalled();
    expect(providers.config.networkId).toBe('undeployed');
    expect(providers.walletProvider.supportedEras).toEqual(['v9']);
  });
});
```

## Testing Components with Context

Components that consume wallet or provider context must be wrapped in the
appropriate providers during testing. Use the TestConsumer pattern.

The mock factories below follow the same pattern as `createMockConnectedApi()` — each returns
an object matching the corresponding provider interface from `@midnight-ntwrk/midnight-js-types`:

```typescript
function createMockPublicDataProvider(): PublicDataProvider {
  // contractStateObservable(address, config) emits PositionedRecord<ContractStateRead>
  // ({ value, blockHeight, blockHash }). Emit nothing here; push records from a
  // Subject in tests that need state.
  return { contractStateObservable: vi.fn().mockReturnValue(new Subject()) } as unknown as PublicDataProvider;
}

function createMockZkConfigProvider(): ZKConfigProvider<string> {
  // ZKConfigProvider exposes getZKIR / getProverKey / getVerifierKey / get(circuitId).
  return {
    get: vi.fn().mockResolvedValue({ circuit: new Uint8Array() }),
    getZKIR: vi.fn().mockResolvedValue(new Uint8Array()),
    getProverKey: vi.fn().mockResolvedValue(new Uint8Array()),
    getVerifierKey: vi.fn().mockResolvedValue(new Uint8Array()),
  } as unknown as ZKConfigProvider<string>;
}

// Midnight.js 5 providers declare the ledger eras they serve.
function createMockProofProvider(): ProofProvider {
  return { supportedEras: ['v9'], proveTx: vi.fn() } as unknown as ProofProvider;
}

function createMockWalletProvider(): WalletProvider {
  return {
    supportedEras: ['v9'],
    // Coin and encryption public keys are hex strings.
    getCoinPublicKey: vi.fn().mockReturnValue('aa'.repeat(32)),
    getEncryptionPublicKey: vi.fn().mockReturnValue('bb'.repeat(32)),
    balanceTx: vi.fn(),
  };
}

function createMockMidnightProvider(): MidnightProvider {
  return { supportedEras: ['v9'], submitTx: vi.fn().mockResolvedValue('mock-tx-id') };
}

function createMockPrivateStateProvider(): PrivateStateProvider<string, unknown> {
  // Partial mock. Midnight.js 5 scopes private state per contract, so stub
  // forContract() and the methods on what it returns. Cast via `as unknown` so
  // TypeScript does not flag the members left out (clearAll, the signing-key
  // and export/import methods); add stubs if a test exercises them.
  return {
    forContract: vi.fn().mockImplementation((contractAddress: string) => ({
      contractAddress,
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    })),
    clearAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as PrivateStateProvider<string, unknown>;
}

function renderWithProviders(ui: React.ReactElement) {
  const mockConnectedApi = createMockConnectedApi();
  const mockProviders = {
    publicDataProvider: createMockPublicDataProvider(),
    zkConfigProvider: createMockZkConfigProvider(),
    proofProvider: createMockProofProvider(),
    walletProvider: createMockWalletProvider(),
    midnightProvider: createMockMidnightProvider(),
    privateStateProvider: createMockPrivateStateProvider(),
    config: { networkId: 'undeployed', ttlSeconds: 3600 },
  };

  return render(
    <WalletProvider initialState={{ status: 'connected', api: mockConnectedApi }}>
      <MidnightProvidersProvider value={mockProviders}>
        {ui}
      </MidnightProvidersProvider>
    </WalletProvider>,
  );
}

it('renders contract state', async () => {
  renderWithProviders(<ContractDisplay />);
  await waitFor(() => {
    expect(screen.getByTestId('contract-state')).toBeInTheDocument();
  });
});
```

## Testing RxJS Observable Subscriptions

Test that hooks correctly subscribe to observables and update state:

```typescript
import { BehaviorSubject, Subject, throwError } from 'rxjs';

describe('useContractState', () => {
  it('updates state when observable emits', async () => {
    const subject = new BehaviorSubject({ count: 0 });

    function TestComponent() {
      const { state, error } = useContractState(subject.asObservable());
      return (
        <div>
          <span data-testid="count">{state?.count ?? 'loading'}</span>
          <span data-testid="error">{error?.message ?? 'none'}</span>
        </div>
      );
    }

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('count')).toHaveTextContent('0');
    });

    // Emit a new value
    subject.next({ count: 42 });

    await waitFor(() => {
      expect(screen.getByTestId('count')).toHaveTextContent('42');
    });
  });

  it('handles observable errors', async () => {
    const subject = new Subject();

    function TestComponent() {
      const { state, error } = useContractState(subject.asObservable());
      return <span data-testid="error">{error?.message ?? 'none'}</span>;
    }

    render(<TestComponent />);

    subject.error(new Error('WebSocket disconnected'));

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('WebSocket disconnected');
    });
  });

  it('unsubscribes on unmount', () => {
    const subject = new BehaviorSubject({ count: 0 });
    const spy = vi.spyOn(subject, 'subscribe');

    function TestComponent() {
      useContractState(subject.asObservable());
      return <div>test</div>;
    }

    const { unmount } = render(<TestComponent />);
    unmount();

    // The subscription returned by subscribe should have been cleaned up
    // Verify no further emissions cause errors
    expect(() => subject.next({ count: 1 })).not.toThrow();
  });
});
```

## userEvent for Interaction Tests

Use `@testing-library/user-event` for realistic user interactions. Unlike
`fireEvent`, `userEvent` simulates full interaction sequences (focus, keydown,
keyup, click):

```typescript
import userEvent from '@testing-library/user-event';

it('connects wallet on button click', async () => {
  const user = userEvent.setup();

  render(
    <WalletProvider>
      <ConnectButton />
    </WalletProvider>,
  );

  const button = screen.getByRole('button', { name: /connect wallet/i });
  await user.click(button);

  await waitFor(() => {
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });
});
```

Always call `userEvent.setup()` before using it. This creates a user event
instance with proper timing and sequencing.

## Cleanup Between Tests

Proper cleanup prevents test pollution:

```typescript
afterEach(() => {
  // Remove wallet mock
  delete (window as any).midnight;

  // Clear any persisted state
  localStorage.clear();
  sessionStorage.clear();

  // Reset all mocks
  vi.restoreAllMocks();
});
```

Critical cleanup actions:

1. **Delete `window.midnight`** — Ensures each test controls whether the
   wallet extension "exists."
2. **Clear localStorage** — Some wallet providers persist connection state.
3. **Restore mocks** — Prevents mock leakage between tests.

Testing Library's `render` automatically cleans up the DOM between tests
when using Vitest with the `@testing-library/react` cleanup integration.
