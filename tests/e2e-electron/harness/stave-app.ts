import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

const REPO_ROOT = path.join(import.meta.dirname, "../../..");
const MAIN_ENTRY = path.join(REPO_ROOT, "out/main/index.js");

export type StaveApp = {
  app: ElectronApplication;
  /** The app shell window. Lens guests are separate pages, not frames of it. */
  page: Page;
  close: () => Promise<void>;
};

/**
 * Launch the built product for an end-to-end test.
 *
 * Two things here are not incidental:
 *
 * - **Isolated user data.** Without `--user-data-dir` the test writes into the
 *   same profile a developer's own Stave uses, including Lens partitions. Every
 *   run gets a throwaway directory.
 * - **Killed, not quit.** `app.close()` goes through the product's before-quit
 *   cleanup, which waits on the host service and the local MCP server and does
 *   not finish inside a test's teardown budget. The window is closed first so
 *   the app gets a chance to tear down its own state, then the process is
 *   killed rather than waited on.
 */
export async function launchStave(): Promise<StaveApp> {
  if (!existsSync(MAIN_ENTRY)) {
    throw new Error(
      `${MAIN_ENTRY} is missing. Run \`bun run build:desktop\` before the Electron e2e suite.`,
    );
  }

  const userDataDir = await mkdtemp(path.join(tmpdir(), "stave-e2e-"));
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    cwd: REPO_ROOT,
    timeout: 60_000,
  });

  const page = await app.firstWindow({ timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded");

  return {
    app,
    page,
    close: async () => {
      const process_ = app.process();
      try {
        await page.close({ runBeforeUnload: false }).catch(() => {});
      } finally {
        process_.kill("SIGKILL");
      }
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

export const E2E_WORKSPACE_ID = "ws-e2e";

/**
 * Give the app a project and one workspace, then reload so the store rehydrates
 * from it.
 *
 * Seeded through the persisted store rather than the onboarding UI: the subject
 * of these tests is the Lens surface, and driving project selection would make
 * every one of them depend on the shape of a dialog it does not care about.
 * There is no IPC mocking here — everything past hydration is the real product.
 */
export async function seedProject(
  page: Page,
  args: { projectPath: string },
): Promise<void> {
  await page.evaluate((input) => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-e2e",
          name: "e2e",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: { activeTaskId: null, tasks: [], messagesByTask: {} },
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: input.projectPath,
          projectName: "stave-e2e",
          workspaces: [
            {
              id: "ws-e2e",
              name: "e2e",
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-e2e",
          workspaceBranchById: { "ws-e2e": "main" },
          workspacePathById: { "ws-e2e": input.projectPath },
          workspaceDefaultById: { "ws-e2e": true },
        },
        version: 0,
      }),
    );
  }, args);

  await page.reload({ waitUntil: "domcontentloaded" });
}

/** Open a Lens tab the way a user does: the Lens button in the right rail. */
export async function openLensSurface(page: Page): Promise<void> {
  const lensButton = page.getByRole("button", { name: "Lens", exact: true });
  await lensButton.waitFor({ state: "visible", timeout: 30_000 });
  await lensButton.click();
}
