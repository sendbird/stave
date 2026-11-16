import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? "4173");
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? "3001");
const baseUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.e2e\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: baseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `VITE_STAVE_DEV_API_BASE=http://127.0.0.1:${apiPort} bun run dev -- --host 127.0.0.1 --port ${webPort} --force`,
      url: baseUrl,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
      timeout: 120_000,
    },
    {
      // Browser-dev bridge; without it workspace hydration hangs on
      // "Opening workspace" and every scenario times out.
      command: `PORT=${apiPort} bun run server-dev`,
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
