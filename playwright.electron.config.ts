import { defineConfig } from "@playwright/test";

/**
 * Second Playwright project, separate from `playwright.config.ts` on purpose.
 *
 * That one starts Vite and drives the app in Chromium, so it never launches
 * Electron and cannot see a guest page. This one launches Electron per spec and
 * needs no web server. They share nothing but the runner, so keeping them in
 * one config would mean every Chromium spec paying for an Electron launch.
 */
export default defineConfig({
  testDir: "./tests/e2e-electron",
  testMatch: /.*\.electron\.e2e\.ts/,
  timeout: 60_000,
  // Electron launches are heavy and each spec file owns a window.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
});
