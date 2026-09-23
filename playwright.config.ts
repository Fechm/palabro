import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {}

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
