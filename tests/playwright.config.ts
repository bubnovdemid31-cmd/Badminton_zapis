import "dotenv/config";
import { fileURLToPath, pathToFileURL } from "node:url";
process.env.DATABASE_URL = pathToFileURL(
  fileURLToPath(new URL("../data/browser-test.db", import.meta.url)),
).href;
process.env.NODE_ENV = "test";
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  outputDir: fileURLToPath(new URL("../test-results/", import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command: "node --import tsx tests/start-e2e.ts",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
    env: {
      PORT: "4173",
      WEB_ORIGIN: "http://127.0.0.1:4173",
      SERVE_WEB: "1",
      NODE_ENV: "test",
    },
    timeout: 30000,
  },
});
