# Vite Configuration

The Midnight SDK was designed for Node.js and requires significant Vite
configuration to work in the browser. This reference documents every required
plugin, polyfill, and configuration option. The template uses Vite 8 (`vite`
8.3.3, `@vitejs/plugin-react` ^6.3.0), and a production `vite build` of it with
the ledger 9 WASM runtime is known to work.

## Full Annotated vite.config.ts

```typescript
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

export default defineConfig({
  plugins: [
    // React Fast Refresh and JSX transform
    react(),

    // Tailwind v4: CSS-based configuration, no tailwind.config.js needed
    tailwindcss(),

    // WASM support: the ledger 9 runtime ships as WebAssembly
    wasm(),

    // CommonJS interop: some SDK dependencies are not ESM-compatible
    viteCommonjs(),

    // Node.js polyfills: SDK packages depend on Node.js built-in modules
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'crypto', 'stream'],
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    // esnext keeps top-level await native. Vite 8 bundles with Rolldown and
    // ships no rollup, so vite-plugin-top-level-await can't load there.
    target: 'esnext',
    minify: false, // Disable in development for readable stack traces
  },
});
```

## Plugin Explanations

### @vitejs/plugin-react

Standard React plugin providing Fast Refresh (hot module replacement) and
JSX transform. No special configuration needed for Midnight.

### @tailwindcss/vite

Tailwind v4 uses a Vite plugin instead of PostCSS. This is a breaking change
from Tailwind v3. With this plugin:

- No `tailwind.config.js` is needed
- No `postcss.config.js` is needed
- Configuration is done in CSS using `@theme` directives

### vite-plugin-wasm

Midnight SDK uses WebAssembly for zero-knowledge circuit execution. The WASM
modules are loaded at runtime in the browser. Without this plugin, Vite
cannot process `.wasm` imports and the SDK fails to initialize.

The plugin configures Vite to handle WASM modules as ES module imports,
enabling the SDK's cryptographic operations to run in the browser.

### No vite-plugin-top-level-await

Some SDK modules use top-level `await` to initialize WASM modules. Older
templates added `vite-plugin-top-level-await` to transform it. That plugin
needs rollup, and Vite 8 bundles with Rolldown and ships no rollup, so it
fails to load. With `build.target: 'esnext'` the browser runs top-level await
natively, so leave the plugin out (and remove it when upgrading an older
project to Vite 8).

### vite-plugin-node-polyfills

The Midnight SDK was built for Node.js and uses built-in modules that do not
exist in the browser. This plugin provides browser-compatible polyfills for:

- **buffer**: Binary data handling used by the SDK's serialization layer
- **process**: Environment detection and `process.env` references
- **util**: Utility functions (TextEncoder, TextDecoder, inspect)
- **crypto**: Cryptographic operations (hashing, random bytes)
- **stream**: Stream processing used by some SDK internals

The plugin's default `globals` settings make `Buffer` and `process` available
globally, matching the Node.js behavior the SDK expects.

### @originjs/vite-plugin-commonjs

Import it as a named export, `import { viteCommonjs } from '@originjs/vite-plugin-commonjs'`.
Some Midnight SDK packages are published as CommonJS modules rather than
ES modules. Vite's native CommonJS handling does not cover all edge cases
in the SDK's dependency tree. This plugin provides more robust CommonJS-to-ESM
conversion, resolving `require()` calls and `module.exports` patterns that
the SDK uses.

## Tailwind v4 CSS Setup

Tailwind v4 moves configuration from JavaScript to CSS. The main stylesheet
needs only:

```css
@import "tailwindcss";
```

This single import replaces the v3 `@tailwind base`, `@tailwind components`,
and `@tailwind utilities` directives.

### Theme Customization

Customize the theme using `@theme` in CSS:

```css
@import "tailwindcss";

@theme {
  --color-midnight: #1a1a2e;
  --color-accent: #e94560;
  --font-sans: "Inter", sans-serif;
}
```

### shadcn components.json

For shadcn with Tailwind v4, the components.json configuration uses the
CSS variable approach:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Note `"config": ""`: Tailwind v4 does not use a config file, so this is
left empty. The `css` field points to the stylesheet containing
`@import "tailwindcss"`.

## Path Alias Configuration

The `@` alias maps to `./src` for clean imports. This must be configured in
both Vite and TypeScript:

**vite.config.ts:**
```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
},
```

**tsconfig.json (or tsconfig.app.json):**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

`tsconfig.app.json` also sets `"noEmit": true`: Vite does the bundling, and
`tsc -b` in the build script only type-checks.

Both configurations must agree. If they diverge, Vite resolves imports
correctly at runtime but TypeScript reports errors in the editor.

## Build Target

The `esnext` build target enables all modern JavaScript features including
top-level await, private class fields, and logical assignment operators.
Midnight DApps target Chrome (required for the Lace extension), so there
is no need for transpilation to older standards.

Minification is disabled (`minify: false`) in development to preserve
readable stack traces. In production builds, set `minify: true` or remove
the option to enable Vite's default minification.

## vitest.config.ts

Tests need a separate configuration because the test environment differs
significantly from the build environment:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

Key differences from vite.config.ts:

- **No Tailwind plugin**: tests do not need CSS processing
- **No WASM plugin**: SDK modules are mocked in tests
- **No CommonJS plugin**: test dependencies are ESM-compatible
- **No node polyfills**: tests run in Node.js, which has the built-ins
- **jsdom environment**: provides DOM APIs for component testing

The path alias must be duplicated here because Vitest uses its own module
resolution pipeline.

## Common Issues

### WASM Loading Failures

**Symptom:** `CompileError: WebAssembly.instantiate()` or
`TypeError: Failed to fetch` when loading SDK modules.

**Cause:** Missing `vite-plugin-wasm`.

**Fix:** Ensure `wasm()` is in the plugins array.

### Missing Polyfills

**Symptom:** `ReferenceError: Buffer is not defined` or
`ReferenceError: process is not defined`.

**Cause:** SDK code references Node.js globals that are not available in the
browser.

**Fix:** Verify `nodePolyfills` includes all required modules and that its
`globals` option has not turned `Buffer` or `process` off.

### CommonJS Interop Errors

**Symptom:** `SyntaxError: Named export 'X' not found` or
`Error: require is not defined`.

**Cause:** SDK package uses `module.exports` or `require()` and Vite's
default CJS handling does not convert it correctly.

**Fix:** Ensure the `viteCommonjs()` plugin is included. If specific packages still
fail, add them to `optimizeDeps.include` to force pre-bundling with CJS
conversion.

### Tailwind v4 Styles Not Applied

**Symptom:** Components render without any styling.

**Cause:** Using v3-style `@tailwind` directives or a `tailwind.config.js`
instead of the v4 CSS-based approach.

**Fix:** Replace all `@tailwind` directives with `@import "tailwindcss"` in
your main CSS file. Remove `tailwind.config.js` and `postcss.config.js` if
they exist. Ensure `@tailwindcss/vite` is in the plugins array.

### vite-plugin-top-level-await Fails to Load

**Symptom:** The dev server or `vite build` fails while loading
`vite-plugin-top-level-await` after an upgrade to Vite 8.

**Cause:** Vite 8 bundles with Rolldown and ships no rollup.

**Fix:** Remove the plugin and its import. Keep `build.target: 'esnext'` so
top-level await stays native.
