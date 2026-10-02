import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests boot in-memory Postgres (PGlite); many in parallel can exceed 5s.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
