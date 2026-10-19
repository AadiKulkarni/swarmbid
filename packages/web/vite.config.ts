import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // highs.mjs conditionally imports node:module under ENVIRONMENT_IS_NODE.
      // Stub it so the browser/worker bundle never externalizes a Node builtin.
      "node:module": path.resolve(rootDir, "src/shims/empty-node-module.ts"),
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  worker: {
    format: "es",
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["highs"],
  },
});
