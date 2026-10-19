import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    include: ["javascript-lp-solver"],
  },
});
