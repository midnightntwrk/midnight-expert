# Vitest Configuration Reference

> **Last verified:** 2026-09-17 — dependency names/versions checked against npm: `@openzeppelin/compact-simulator@0.3.1` (pairs with `compact-runtime` 0.16.0).

## Dependencies

Install these as dev dependencies for Compact contract testing:

```bash
npm install --save-dev vitest @openzeppelin/compact-simulator @types/node typescript @tsconfig/node24
```

The runtime dependency is separate:

```bash
npm install @midnight-ntwrk/compact-runtime
```

| Package | Purpose |
|---------|---------|
| `vitest` | Test runner -- fast, Vite-native, TypeScript without config |
| `@openzeppelin/compact-simulator` | Local Compact contract simulator for unit tests |
| `@midnight-ntwrk/compact-runtime` | Runtime types and helpers consumed by compiled Compact artifacts |
| `@types/node` | Node.js type definitions |
| `typescript` | TypeScript compiler for type checking |
| `@tsconfig/node24` | Shared base tsconfig targeting Node 24 |

## vitest.config.ts Template

```typescript
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/archive/**'],
    reporters: 'verbose',
  },
});
```

Key settings:

- `globals: true` -- makes `describe`, `it`, `expect` available without imports
- `environment: 'node'` -- tests run in Node, not jsdom (contracts are backend logic)
- `include` -- only `*.test.ts` files under `src/`
- `exclude` -- inherits Vitest defaults (node_modules, dist, etc.) and additionally excludes `src/archive/` for deprecated or parked contract tests
- `reporters: 'verbose'` -- full test names in output for easier debugging

## globalSetup for Compact Compilation

Compact contracts must be compiled before tests can import their artifacts. Use a `globalSetup` file that compiles all `.compact` files with `--skip-zk` (fast, no zero-knowledge proof generation).

Create `test/setup.ts`:

```typescript
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Compile all .compact files before tests run.
 * Uses --skip-zk for fast compilation (no ZK proof generation).
 * Incremental: skips compilation if the artifact is newer than the source.
 */
export async function setup() {
  const srcDir = resolve(import.meta.dirname, '..', 'src');
  const artifactsDir = resolve(import.meta.dirname, '..', 'artifacts');

  const compactFiles = findCompactFiles(srcDir);

  for (const compactFile of compactFiles) {
    const artifactPath = getArtifactPath(artifactsDir, compactFile);

    // Incremental: skip if artifact is newer than source
    if (isArtifactFresh(compactFile, artifactPath)) {
      continue;
    }

    try {
      // Sequential compilation -- Compact compiler does not support parallel invocations
      execSync(`compact compile --skip-zk ${compactFile}`, {
        stdio: 'inherit',
        cwd: resolve(import.meta.dirname, '..'),
      });
    } catch (error: unknown) {
      // Exit code 127 means the compact compiler is not installed
      if (error instanceof Error && 'status' in error && error.status === 127) {
        throw new Error(
          'Compact compiler not found. Install it with: npx @aspect-build/setup-compact-action'
        );
      }
      throw error;
    }
  }
}

function findCompactFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCompactFiles(fullPath));
    } else if (entry.name.endsWith('.compact')) {
      files.push(fullPath);
    }
  }
  return files;
}

function getArtifactPath(artifactsDir: string, compactFile: string): string {
  const baseName = compactFile.replace(/\.compact$/, '');
  return join(artifactsDir, `${baseName}.ts`);
}

function isArtifactFresh(sourcePath: string, artifactPath: string): boolean {
  try {
    const sourceStat = statSync(sourcePath);
    const artifactStat = statSync(artifactPath);
    return artifactStat.mtimeMs > sourceStat.mtimeMs;
  } catch {
    // Artifact does not exist yet
    return false;
  }
}
```

Then reference it in `vitest.config.ts`:

```typescript
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/archive/**'],
    reporters: 'verbose',
    globalSetup: ['test/setup.ts'],
  },
});
```

The globalSetup approach is useful when you want Vitest itself to manage compilation. For simpler setups, the `package.json` script approach (compile then test) works just as well.

## tsconfig.json

```jsonc
{
  "extends": "@tsconfig/node24/tsconfig.json",
  "include": ["src/**/*.ts"],
  "exclude": ["src/archive/"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true
  }
}
```

Key settings:

- `extends @tsconfig/node24` -- inherits strict settings, `module: "nodenext"`, and `target: "es2024"` appropriate for Node 24
- `rootDir / outDir` -- source in `src/`, compiled output in `dist/`
- `declaration: true` -- emit `.d.ts` files for downstream consumers
- `rewriteRelativeImportExtensions: true` -- rewrites `.ts` imports to `.js` in output so ESM resolution works at runtime
- `erasableSyntaxOnly: true` -- prohibits TypeScript features that generate runtime code (enums, namespaces), enforcing type-only usage
- `verbatimModuleSyntax: true` -- requires explicit `type` keyword on type-only imports, preventing accidental runtime import of types
- `exclude: src/archive/` -- skip deprecated code that is kept for reference but should not be compiled

## package.json Scripts

```jsonc
{
  "scripts": {
    "test": "compact compile --skip-zk && vitest run",
    "types": "tsc --noEmit"
  }
}
```

- `test` -- compiles Compact contracts (fast, no ZK) then runs the full Vitest suite. The `&&` ensures tests do not run if compilation fails.
- `types` -- type-checks the project without emitting output. Used in CI and pre-push hooks to catch type errors early.

Both scripts match the OpenZeppelin compact-contracts conventions.
