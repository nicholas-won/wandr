import { defineConfig } from "vitest/config";

// Each test file boots its own PGlite and applies every migration; under parallel load that can
// exceed vitest's 5 s default.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
