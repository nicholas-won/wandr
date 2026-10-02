import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each integration test boots its own PGlite with every migration; under parallel load that
    // can exceed the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
