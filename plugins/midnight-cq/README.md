# midnight-cq

<p align="center">
  <img src="assets/mascot.png" alt="midnight-cq mascot" width="200" />
</p>

Code quality tooling for Midnight Network projects -- linting, formatting, type checking, testing, Git hooks, and CI workflows.

## Skills

### midnight-cq:compact-testing

Unit testing for Compact contracts using the OpenZeppelin simulator framework. Covers createSimulator usage, mock contract patterns, witness overrides, parameterized tests, property-based testing with fast-check, and ZK commitment testing.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`mock-patterns.md`](skills/compact-testing/references/mock-patterns.md) | Writing minimal mock contracts to test imported Compact modules that cannot be deployed standalone | When testing reusable Compact modules like Ownable or AccessControl |
| [`simulator-api.md`](skills/compact-testing/references/simulator-api.md) | The @openzeppelin/compact-simulator API that eliminates manual CircuitContext threading | When setting up createSimulator or calling circuits in tests |
| [`test-examples.md`](skills/compact-testing/references/test-examples.md) | Good and bad example pairs following OpenZeppelin patterns from the actual test suite | When writing new tests and needing canonical patterns to follow |
| [`witness-testing.md`](skills/compact-testing/references/witness-testing.md) | Testing witness files including PrivateState types, factory generation, and return tuples | When writing tests for TypeScript witness implementations |

### midnight-cq:dapp-connector-testing

Testing for DApp code that integrates with the wallet through the DApp Connector API -- window.midnight injection, InitialAPI.connect(), and ConnectedAPI methods.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`connector-stub-patterns.md`](skills/dapp-connector-testing/references/connector-stub-patterns.md) | Complete test double implementations for InitialAPI and ConnectedAPI | When mocking the wallet extension in unit or integration tests |
| [`error-handling-patterns.md`](skills/dapp-connector-testing/references/error-handling-patterns.md) | Test patterns for each of the 5 DApp Connector API error codes | When testing error handling for PermissionRejected, Disconnected, and other wallet errors |

### midnight-cq:dapp-testing

End-to-end and integration testing for Midnight DApp frontends using Playwright and React Testing Library. Covers three testing layers: E2E browser flows, React component integration tests, and contract simulator unit tests.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`integration-testing.md`](skills/dapp-testing/references/integration-testing.md) | Layer 2 integration tests for React components with contract interaction | When testing React components that call contracts and display results |
| [`playwright-patterns.md`](skills/dapp-testing/references/playwright-patterns.md) | Playwright configuration and patterns for Midnight DApp E2E testing | When writing browser-based end-to-end tests for wallet connect, transaction submit, and UI flows |

### midnight-cq:ledger-testing

Testing for code that uses @midnight-ntwrk/ledger-v8 and @midnight-ntwrk/onchain-runtime directly. Covers transaction construction, proof staging, ZswapLocalState, DustLocalState, cost model, crypto fixtures, and serialization round-trips.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`crypto-fixture-patterns.md`](skills/ledger-testing/references/crypto-fixture-patterns.md) | Generating test fixtures and testing cryptographic functions from ledger-v8 | When testing coinCommitment, coinNullifier, or other crypto operations |
| [`ledger-state-patterns.md`](skills/ledger-testing/references/ledger-state-patterns.md) | Testing ZswapLocalState, DustLocalState, and LedgerState from ledger-v8 | When testing ledger state management and transitions |
| [`transaction-construction-patterns.md`](skills/ledger-testing/references/transaction-construction-patterns.md) | Constructing and testing transactions using ledger-v8 | When testing transaction building, proof staging, or fee estimation |

### midnight-cq:quality-check

Running and interpreting quality checks -- Biome linting, TypeScript type checking, Compact compilation, Vitest tests, and Playwright E2E tests. Helps diagnose and fix failures from any of these tools.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`biome-diagnostics.md`](skills/quality-check/references/biome-diagnostics.md) | Reading and interpreting Biome violation output | When Biome reports lint or format errors |
| [`ci-troubleshooting.md`](skills/quality-check/references/ci-troubleshooting.md) | Diagnosing CI workflow failures such as checks.yml passing but test.yml failing | When GitHub Actions workflows fail unexpectedly |
| [`test-failures.md`](skills/quality-check/references/test-failures.md) | Common test failure messages and their fixes (e.g., "contract not initialized") | When Vitest or simulator tests fail with cryptic error messages |

### midnight-cq:quality-init

Setting up all code quality tooling for a Midnight Network project from scratch. Covers Biome configuration, Vitest with simulator, Playwright E2E, Husky Git hooks, and GitHub Actions CI workflows. Enforces Biome-only policy (no ESLint or Prettier).

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`biome-config.md`](skills/quality-init/references/biome-config.md) | Biome configuration reference enforcing the single-tool rule | When creating or extending biome.json |
| [`ci-workflows.md`](skills/quality-init/references/ci-workflows.md) | Two-workflow CI architecture for Midnight projects | When setting up GitHub Actions for lint/format and test workflows |
| [`husky-hooks.md`](skills/quality-init/references/husky-hooks.md) | Husky Git hook configuration for pre-commit and pre-push checks | When adding Git hooks to enforce quality gates locally |
| [`playwright-config.md`](skills/quality-init/references/playwright-config.md) | Playwright configuration for Midnight DApp browser testing | When adding E2E testing to a frontend project |
| [`vitest-config.md`](skills/quality-init/references/vitest-config.md) | Vitest configuration for Compact contract testing with the simulator | When setting up unit testing for a Compact project |

### midnight-cq:wallet-testing

Testing for custom wallet implementations and extensions built on the Midnight Wallet SDK packages. Covers WalletBuilder composition, Effect/Either result handling, Observable state testing, and test fixtures for branded types.

#### References

| Name | Description | When it is used |
|------|-------------|-----------------|
| [`effect-boundary-patterns.md`](skills/wallet-testing/references/effect-boundary-patterns.md) | Unwrapping and asserting on Effect/Either results from the wallet SDK in Vitest | When testing wallet code that returns Effect or Either types |
| [`observable-testing.md`](skills/wallet-testing/references/observable-testing.md) | Testing RxJS Observable state exposed by the wallet facade | When testing reactive wallet state subscriptions |
| [`wallet-builder-setup.md`](skills/wallet-testing/references/wallet-builder-setup.md) | Wiring WalletBuilder, constructing initial state, and providing test doubles | When setting up WalletBuilder test fixtures with branded types |

## Agents

### cq-reviewer

A read-only code quality auditor that scans a Midnight project's CQ setup and produces a detailed report with recommendations. Checks Biome configuration, Vitest setup, Playwright config, Husky hooks, CI workflows, test quality, and coverage gaps.

#### When to use

Use when you want an audit of a project's code quality setup, need to know if tests are sufficient, or want to validate CI configuration against Midnight standards.

### cq-runner

A read-only code quality check executor that runs Biome linting, TypeScript type checking, Compact compilation, Vitest tests, and Playwright E2E tests, then produces a structured report interpreting the results.

#### When to use

Use when you want to run all quality checks, diagnose test failures, or verify code is ready to push before committing.
