import { defineConfig } from "vitest/config";

// `pnpm smoke`: the real-API smoke test (needs a running web server; see scripts/).
export default defineConfig({
  test: { environment: "node", include: ["scripts/**/*.test.ts"], testTimeout: 120_000 },
});
