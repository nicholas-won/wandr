import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each integration test boots its own PGlite and runs every migration; under parallel load
    // that takes several seconds.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
