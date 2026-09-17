# Test Failure Reference

> **Last verified:** 2026-09-17 — package names, versions, and `compact` CLI commands checked against npm + compiler 0.31.1: `@openzeppelin/compact-simulator@0.3.1` (exports `createSimulator`, depends on `compact-runtime` 0.16.0); the compiler is the `compact` CLI (`compact compile`), not an npm package.

## "contract not initialized"

**Error message:**

```
Error: contract not initialized
```

**Cause:** The simulator requires an explicit initialization call before any contract method can be executed. If you create a simulator instance and immediately call a method on it, the runtime throws because the ledger state has not been set up.

**Fix:**

Option 1 — pass `isInit: true` in the call options when the very first call should act as the initializer:

```ts
const result = await simulator.constructor({ isInit: true });
```

Option 2 — call the contract's `initialize` method (or equivalent constructor circuit) before any other circuit call:

```ts
await simulator.initialize();
const result = await simulator.someMethod();
```

Check the `.compact` contract for the circuit that sets up initial state — typically it is annotated or named `constructor` / `initialize`. Match the call in your test setup (`beforeEach` or `beforeAll`) to that circuit.

---

## "caller is not the owner"

**Error message:**

```
Error: Ownable: caller is not the owner
```

**Cause:** The circuit assertion checked `own_address() == owner` (or similar), and the test did not call the method as the owner key. By default, simulator calls use a generic test key that does not match the owner stored during initialization.

**Fix:** Use `.as(OWNER)` to set the calling key for the next transaction:

```ts
// Wrong — uses the default anonymous key
await simulator.transferOwnership(newOwner);

// Correct — uses the key that was set as owner during initialize
await simulator.transferOwnership(newOwner).as(OWNER);
```

`OWNER` should be the same key you passed (or that was used implicitly) during initialization. If you are not sure which key is the owner, look at the initialization step in your test setup and check what value was stored for the owner field.

---

## Missing Artifact Errors

**Error message pattern:**

```
Cannot find module '../artifacts/TokenLedger' or its corresponding type declarations
Cannot find module '../artifacts/witnesses' or its corresponding type declarations
```

**Cause:** The TypeScript tests import generated artifacts that the Compact compiler produces. If the compiler has not been run — or has never been run at all — those files do not exist and the import resolution fails at test startup.

**Fix:** Run the Compact compiler with `--skip-zk` to generate the artifacts without performing zero-knowledge proof generation (which is slow and not required for unit tests):

```bash
compact compile --skip-zk
```

Run this from the project root. The compiler writes artifacts to the directory configured in your `compactOptions` (typically `artifacts/` or `managed/`). After compilation succeeds, re-run the tests.

If the `compact` CLI is not installed, install the Compact toolchain via the official installer — it is distributed as a binary, **not** an npm package (see the `midnight-tooling:install-cli` skill; in CI use `midnightntwrk/setup-compact-action`):

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31.1
```

---

## Stale Artifacts

**Symptom:** Tests pass on your branch locally but fail after pulling from the remote (or on another developer's machine). The failure looks like a type error or a runtime mismatch, not a missing file.

**Cause:** The `.compact` source was updated in a commit you pulled, but the generated artifacts in `artifacts/` or `managed/` were either regenerated locally in your working directory or were regenerated on a different machine and the results differ.

Artifacts are generated output — they should not be committed or assumed to be in sync. The only source of truth is the `.compact` source file.

**Fix:** Recompile from the current `.compact` source after every pull:

```bash
git pull
compact compile --skip-zk
npx tsc --noEmit  # confirm types are consistent
npx vitest run
```

If your CI pipeline fails even though it runs the compiler, check that the version of the `compact` compiler used in CI matches the version used locally (see `ci-troubleshooting.md` for details).

---

## Witness Return Type Mismatch

**Error message pattern:**

```
TypeError: witness return value does not match expected shape
TypeError: Cannot destructure property 'privateState' of undefined
```

**Cause:** Compact witness functions must return a tuple of exactly `[PrivateState, WitnessValue]`. If a witness returns only the witness value, or returns an object instead of a tuple, the simulator cannot extract the private state update and throws.

**Fix:** Ensure every witness function returns the correct two-element tuple:

```ts
// Wrong — returns only the witness value
const witness: WitnessFunction = async () => {
  return secretKey;
};

// Wrong — returns an object
const witness: WitnessFunction = async () => {
  return { privateState: state, value: secretKey };
};

// Correct — returns [PrivateState, WitnessValue] tuple
const witness: WitnessFunction = async (currentState: PrivateState) => {
  const updatedState = { ...currentState };
  return [updatedState, secretKey];
};
```

The first element is the new private state (pass the current state unchanged if you do not need to update it). The second element is the value the circuit receives. Both elements are required, even if the private state does not change.

---

## "failed assert:" Messages

**Error message pattern:**

```
Error: failed assert: TokenLedger: insufficient balance
Error: failed assert: Ownable: caller is not the owner
Error: failed assert: assertion failed at TokenLedger.compact:47
```

**Cause:** Compact `assert` statements surface directly as JavaScript `Error` objects when the assertion fails during simulation. The message in the error is the string passed to `assert` in the `.compact` source.

**How to find the failing assertion:**

1. Copy the message after `failed assert:` — e.g., `insufficient balance`.
2. Search the `.compact` files for that exact string:

```bash
grep -r "insufficient balance" src/
```

3. The matching line shows the assertion, the condition that must hold, and the surrounding logic.
4. Trace back from the assertion to understand which code path led to it.

If the message is generic (`assertion failed at TokenLedger.compact:47`), open the file at that line number — the assertion is there with or without a custom message.

---

## Stack Trace Reading

Vitest stack traces from simulator tests contain many internal frames from the proxy handler machinery. These frames carry no debugging signal.

**What to ignore:**

```
at ProxyHandler.<anonymous> (node_modules/@openzeppelin/compact-simulator/dist/index.js:...)
at Proxy.transferOwnership (node_modules/@openzeppelin/compact-simulator/dist/index.js:...)
at Object.execute (node_modules/@midnight-ntwrk/compact-runtime/dist/...)
```

**What to focus on:**

1. **The error message** — the first line of the error. If it says `failed assert: <message>`, grep the `.compact` source for `<message>`. If it says `caller is not the owner`, check the `.as()` call. If it says `contract not initialized`, check the initialization step.
2. **Your simulator file + line** — e.g., `src/test/simulators/TokenLedgerSimulator.ts:55:7`. This is the method on your custom simulator class that triggered the circuit.
3. **Your test file + line** — e.g., `src/test/TokenLedger.test.ts:89:5`. This is the `await simulator.method()` call in the test that produced the failure.

To distinguish your frames from proxy frames: your frames reference files in `src/`, the proxy frames reference files inside `node_modules/`.

---

## compact-runtime Version Mismatch

**Symptom:** Cryptic errors that do not map to any obvious problem in your code — things like:

```
TypeError: Cannot read properties of undefined (reading 'call')
RangeError: Maximum call stack size exceeded
Error: unexpected opcode 0x...
```

These errors appear inside `node_modules/@midnight-ntwrk/compact-runtime` frames and do not point to any line in your source.

**Cause:** The version of `compact-runtime` used by the simulator does not match the version of the Compact compiler that generated the artifacts. The compiler emits a bytecode format that the runtime must understand — a version drift between the two breaks the contract.

**Fix:** Make the `compact-runtime` version match the compiler that generated the artifacts. Compiler `0.31.1` emits runtime `0.16.0` (check your own with `compact compile --runtime-version`). Note the compiler itself is **not** an npm package — it is the `compact` CLI, pinned via `compact update <version>` (or the CI `setup-compact-action` → `compact-version`).

1. Check the versions currently installed:

```bash
npm ls @midnight-ntwrk/compact-runtime @openzeppelin/compact-simulator
```

2. Pin `package.json` so the runtime matches your compiler's runtime, and the OpenZeppelin simulator resolves to a build with that same runtime (simulator `0.3.x` depends on runtime `0.16.0`; `0.4.x` moved to `0.19.0`):

```jsonc
{
  "devDependencies": {
    "@midnight-ntwrk/compact-runtime": "0.16.0",
    "@openzeppelin/compact-simulator": "0.3.1"
  }
}
```

3. Run `npm install` and recompile:

```bash
npm install
compact compile --skip-zk
npx vitest run
```

If you are not sure which runtime your compiler emits, run `compact compile --runtime-version`, then pin the runtime dependency to match.
