import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    viteCommonjs(),
    nodePolyfills({
      include: ["buffer", "process", "util", "crypto", "stream"],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // esnext keeps top-level await native. Vite 8 bundles with Rolldown and
    // ships no rollup, so vite-plugin-top-level-await can't load there.
    target: "esnext",
    minify: false,
  },
});
