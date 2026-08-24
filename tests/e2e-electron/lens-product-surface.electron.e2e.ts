import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedProject, type StaveApp } from "./harness/stave-app";

/**
 * The built product, launched and driven for real — no IPC mocking anywhere.
 *
 * This is the instrument the rendering-model cutover has to be checked against,
 * because the other Electron spec covers the primitive in isolation and the
 * Chromium suite never launches Electron at all. What it establishes today is
 * that the product boots under Playwright and its shell is drivable, which is
 * the part that was not obvious: the app does not reach `firstWindow` without
 * an isolated user-data directory, and a graceful `app.close()` never returns
 * because the host service and the local MCP server outlive a test's teardown
 * budget. Both are handled in `launchStave`.
 *
 * Not yet covered, and the next thing to build here: opening a Lens session
 * end to end. Seeding a project through the persisted store gets the Lens
 * affordance enabled, but the session main opens for it is torn down again
 * immediately — main emits `lens:session-closed` and the renderer drops the
 * panel. The workspace has to be one main actually knows about, not one that
 * exists only in the renderer's rehydrated store. Until that is solved, guest
 * assertions live in `lens-webview-guest.electron.e2e.ts`, which drives a real
 * guest through the shipping attach clamp.
 *
 * Requires `bun run build:desktop`.
 */

let stave: StaveApp;
let projectDir: string;

test.beforeAll(async () => {
  // A throwaway directory, not this repository. Pointing the app at a real
  // checkout makes it do real git and workspace scanning on startup, which is
  // slow and — more to the point — variable enough to make the shell
  // assertions flaky for reasons that have nothing to do with Lens.
  projectDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-project-"));

  stave = await launchStave();
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({
    timeout: 30_000,
  });
  await seedProject(stave.page, { projectPath: projectDir });
});

test.afterAll(async () => {
  await stave?.close();
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("the built product boots and its shell is drivable", async () => {
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({
    timeout: 30_000,
  });
  await expect(stave.page.getByTestId("top-bar")).toBeVisible();
  await expect(stave.page.getByTestId("workspace-bar")).toBeVisible();
});

test("the Lens affordance is present and enabled once a project is open", async () => {
  await expect(
    stave.page.getByRole("button", { name: "Lens", exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
});

test("the renderer runs with webviewTag enabled", async () => {
  // The tag is what lets a guest be a DOM element at all. Asserted against the
  // real window rather than the harness one, because this is a property of the
  // product's `BrowserWindow` options and nothing else would catch it
  // regressing.
  const webviewTagEnabled = await stave.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    return Boolean(window?.webContents.getLastWebPreferences()?.webviewTag);
  });

  expect(webviewTagEnabled).toBe(true);
});
