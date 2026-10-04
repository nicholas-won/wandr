import { defineConfig } from "vitest/config";

// Unit tests cover the pure helpers in src/lib (no React Native imports) and run the real
// api-contract client against the mock server, so the fixtures are checked against the schemas.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
