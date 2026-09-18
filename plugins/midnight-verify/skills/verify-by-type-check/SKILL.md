---
name: midnight-verify:verify-by-type-check
description: >-
  Verification by TypeScript compilation. Writes TypeScript test files that
  exercise SDK type claims, then runs tsc --noEmit to check if types match.
  Also verifies user .ts files that import @midnight-ntwrk packages. Loaded
  by the type-checker agent. Covers workspace setup (lazy init), two modes
  (claim mode and file mode), type assertion patterns, and result
  interpretation.
version: 0.3.0
---

# Verify by Type-Checking

You are verifying an SDK claim or user TypeScript file by running the TypeScript compiler. Follow these steps in order.

## Critical Rule

**A clean tsc run proves types are correct. It does NOT prove runtime behavior.** If the claim is about what happens when you call a function (not just its signature), note: "Types verified, but runtime behavior requires devnet verification."

## Step 1: Set Up the Workspace

The workspace lives at `~/.midnight-expert/verify/sdk-workspace/` in your home directory. It is home-based and independent of the project you are working in.

**First time (workspace does not exist):**

```bash
mkdir -p "$HOME/.midnight-expert/verify/sdk-workspace"
cd "$HOME/.midnight-expert/verify/sdk-workspace"

# Initialize Node project
npm init -y

# Install all SDK packages + TypeScript
npm install \
  @midnight-ntwrk/midnight-js \
  @midnight-ntwrk/midnight-js-contracts \
  @midnight-ntwrk/midnight-js-types \
  @midnight-ntwrk/midnight-js-utils \
  @midnight-ntwrk/midnight-js-network-id \
  @midnight-ntwrk/midnight-js-level-private-state-provider \
  @midnight-ntwrk/midnight-js-indexer-public-data-provider \
  @midnight-ntwrk/midnight-js-http-client-proof-provider \
  @midnight-ntwrk/midnight-js-fetch-zk-config-provider \
  @midnight-ntwrk/midnight-js-node-zk-config-provider \
  @midnight-ntwrk/midnight-js-logger-provider \
  @midnight-ntwrk/midnight-js-dapp-connector-proof-provider \
  @midnight-ntwrk/midnight-js-protocol \
  @midnight-ntwrk/midnight-js-compact \
  @midnight-ntwrk/testkit-js \
  typescript

# Create tsconfig.json for type-checking
cat > tsconfig.json << 'TSCONFIG_EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": false,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["jobs/**/*.ts"]
}
TSCONFIG_EOF
```

**Subsequent times (workspace exists):**

Run a quick integrity check:

```bash
cd "$HOME/.midnight-expert/verify/sdk-workspace"
npm ls typescript
```

If `npm ls` reports errors, run `npm install` to repair.

**Create the job directory:**

```bash
JOB_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
mkdir -p "$HOME/.midnight-expert/verify/sdk-workspace/jobs/$JOB_ID"
```

## Wallet SDK Workspace Mode

When the orchestrator passes `domain: 'wallet-sdk'` context, use a separate workspace at `~/.midnight-expert/verify/wallet-sdk-workspace/` instead of the SDK workspace. This workspace has different packages installed.

**First time (workspace does not exist):**

```bash
mkdir -p "$HOME/.midnight-expert/verify/wallet-sdk-workspace"
cd "$HOME/.midnight-expert/verify/wallet-sdk-workspace"

# Initialize Node project
npm init -y

# Install all Wallet SDK packages + DApp Connector API + TypeScript
npm install \
  @midnightntwrk/wallet-sdk-facade \
  @midnightntwrk/wallet-sdk-shielded \
  @midnightntwrk/wallet-sdk-unshielded-wallet \
  @midnightntwrk/wallet-sdk-dust-wallet \
  @midnightntwrk/wallet-sdk-runtime \
  @midnightntwrk/wallet-sdk-abstractions \
  @midnightntwrk/wallet-sdk-capabilities \
  @midnightntwrk/wallet-sdk-hd \
  @midnightntwrk/wallet-sdk-address-format \
  @midnightntwrk/wallet-sdk-utilities \
  @midnightntwrk/wallet-sdk-indexer-client \
  @midnightntwrk/wallet-sdk-node-client \
  @midnightntwrk/wallet-sdk-prover-client \
  @midnight-ntwrk/dapp-connector-api \
  typescript

# Create tsconfig.json for type-checking
cat > tsconfig.json << 'TSCONFIG_EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": false,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["jobs/**/*.ts"]
}
TSCONFIG_EOF
```

**Subsequent times (workspace exists):**

```bash
cd "$HOME/.midnight-expert/verify/wallet-sdk-workspace"
npm ls typescript
```

If `npm ls` reports errors, run `npm install` to repair.

**Job directory, type assertion writing, tsc execution, interpretation, and cleanup follow the same steps as the standard SDK workspace.** The only difference is the workspace path and the installed packages.

**Mode selection:** When you receive a claim from the orchestrator, check the domain context:
- `domain: 'wallet-sdk'` → use `~/.midnight-expert/verify/wallet-sdk-workspace/`
- Otherwise → use `~/.midnight-expert/verify/sdk-workspace/` (existing behavior)

## Ledger API Execution Mode

When the orchestrator passes `domain: 'ledger'` context and the claim is about behavioral output of a `@midnight-ntwrk/ledger-v8` function (not just its type signature), go beyond type-checking — write a script that calls the function and observes the output.

**This uses the existing sdk-workspace** (ledger-v8 is already installed there). No separate workspace needed.

**When to use this mode:**
- Claim is about what a ledger-v8 function *returns* (not just its signature)
- Examples: "nativeToken() returns [0,0,...,0]", "coinCommitment produces a 64-char hex string", "CostModel.initialCostModel() has specific default values"

**Script pattern:**

```bash
cat > "$HOME/.midnight-expert/verify/sdk-workspace/jobs/$JOB_ID/ledger-exec.mjs" << 'EXEC_EOF'
// Import the specific function being tested
import { nativeToken, coinCommitment, CostModel } from '@midnight-ntwrk/ledger';

// Call the function and capture output
const result = nativeToken();

// Output structured JSON for interpretation
console.log(JSON.stringify({
  result: typeof result === 'bigint' ? result.toString() : result,
  type: typeof result
}));
EXEC_EOF
```

Run it:

```bash
cd "$HOME/.midnight-expert/verify/sdk-workspace/jobs/$JOB_ID"
node ledger-exec.mjs
```

**Report this as "ledger-v8 execution" evidence**, not as type-checking evidence. Include the script source, output, and interpretation in your report.

**Mode selection summary:**
- `domain: 'wallet-sdk'` → use `~/.midnight-expert/verify/wallet-sdk-workspace/`
- `domain: 'ledger'` + behavioral claim → use sdk-workspace + ledger execution script
- `domain: 'ledger'` + type claim → use sdk-workspace + normal tsc type assertions
- Otherwise → use `~/.midnight-expert/verify/sdk-workspace/` (existing behavior)

## Step 2: Determine the Mode

**Claim mode** — you received a natural language claim about the SDK (e.g., "deployContract returns DeployedContract"). Go to Step 3A.

**File mode** — you received a `.ts` file to verify (e.g., `/midnight-verify:verify src/deploy.ts`). Go to Step 3B.

## Step 3A: Claim Mode — Write Type Assertions

Parse the claim and write a `.ts` file that exercises it using type-level assertions. The file should compile if and only if the claim is true.

**Common assertion patterns:**

```typescript
// 1. Verify an export exists
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';

// 2. Verify a function's return type
import type { DeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
type Result = Awaited<ReturnType<typeof deployContract>>;
type _Check = Result extends DeployedContract ? true : never;
const _proof: _Check = true;

// 3. Verify an interface has a specific property
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
type _HasWallet = MidnightProviders<any, any, any>['walletProvider'];

// 4. Verify a class extends another
import { CallTxFailedError, TxFailedError } from '@midnight-ntwrk/midnight-js-contracts';
const _err = new CallTxFailedError('test', []);
const _base: TxFailedError = _err; // assignability check

// 5. Verify a type is exported from a specific package
import type { ProverKey } from '@midnight-ntwrk/midnight-js-types';
const _pk: ProverKey = new Uint8Array() as ProverKey;

// 6. Verify a function's parameter types
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
const _result: string = toHex(new Uint8Array([0xAB]));

// 7. Verify an import path works
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
```

Write the file to the job directory:

```bash
cat > "$HOME/.midnight-expert/verify/sdk-workspace/jobs/$JOB_ID/test-claim.ts" << 'TS_EOF'
<type assertion code>
TS_EOF
```

## Step 3B: File Mode — Copy and Check User File

1. Copy the user's `.ts` file into the job directory
2. Check if the file imports from local paths (e.g., `./contract/index.js`, `../compiled/counter`):
   - If the compiled Compact output exists in the user's project, copy it to the job directory maintaining the relative path structure
   - If it doesn't exist, create a minimal `.d.ts` stub so tsc can proceed:
     ```typescript
     // stub for missing compiled contract
     declare const _default: any;
     export default _default;
     export declare const pureCircuits: any;
     export declare const ledger: any;
     export declare const Witnesses: any;
     export declare const Contract: any;
     ```
   - Note in your report which imports were stubbed — these are unverified
3. Ensure the job's tsconfig includes the file

## Step 4: Run tsc

```bash
cd "$HOME/.midnight-expert/verify/sdk-workspace"
npx tsc --noEmit --project tsconfig.json 2>&1
```

Or to check a specific file:

```bash
npx tsc --noEmit jobs/$JOB_ID/test-claim.ts 2>&1
```

**Capture the full output (stdout and stderr).**

## Step 5: Interpret and Report

**If tsc exits 0 (no errors):**
- Claim mode: the type assertions compiled — types match the claim
- File mode: the user's file type-checks clean with the SDK

**If tsc exits non-zero:**
- Claim mode: the type assertion failed — types contradict the claim. The compiler error IS your evidence.
- File mode: the user's file has type errors. Report each error with file, line, and message.

**Report format:**

```
### Type-Check Report

**Claim:** [verbatim]

**Test file:**
\`\`\`typescript
[full source of the test .ts file]
\`\`\`

**tsc output:**
\`\`\`
[compiler output — clean or errors]
\`\`\`

**Interpretation:** [Confirmed / Refuted / Inconclusive] — [explanation]

**Note:** [if behavioral claim: "Types verified, but runtime behavior requires devnet verification."]
[if file mode with stubs: "Imports from ./path/to/contract were stubbed — types for these imports are unverified."]
```

## Step 6: Clean Up

```bash
rm -rf "$HOME/.midnight-expert/verify/sdk-workspace/jobs/$JOB_ID"
```
