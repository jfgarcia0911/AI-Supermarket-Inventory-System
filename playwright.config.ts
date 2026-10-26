// Browser tests: they sign in as the demo accounts (npm run db:seed-dev) and
// click through the main screens on a desktop and a phone-sized screen.
//   npm run build && npm run test:e2e

import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  // In CI the variables come from the environment instead.
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
