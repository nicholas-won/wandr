import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets parallel checkouts run e2e side by side.
const PORT = Number(process.env.E2E_PORT) || 3200;

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
    // GEOCODER=off: no network in e2e; Stops simply stay without coordinates (silent).
    env: { PGLITE_DIR: ".data/e2e", NEXT_DIST_DIR: ".next-e2e", E2E_RELAX_OTP_IP_LIMIT: "1", GEOCODER: "off" },
  },
});
