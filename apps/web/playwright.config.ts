import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

/**
 * End-to-end core flows (§7a: Playwright). Runs `next dev` (own build dir, so it can run next to
 * a normal dev server) against a throwaway PGlite database, with no external services: the dev
 * OTP code 000000 (never accepted in production), console SMS, heuristic AI.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `rm -rf .data/e2e && next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { PGLITE_DIR: ".data/e2e", NEXT_DIST_DIR: ".next-e2e" },
  },
});
