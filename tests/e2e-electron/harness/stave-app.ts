import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

const REPO_ROOT = path.join(import.meta.dirname, "../../..");
const MAIN_ENTRY = path.join(REPO_ROOT, "out/main/index.js");

export type StaveApp = {
  app: ElectronApplication;
  /** The app shell window. Lens guests are separate pages, not frames of it. */
  page: Page;
  /**
   * The throwaway profile this launch was given.
   *
   * Exposed because the app writes its own local MCP manifest here, and the
   * agent-path spec drives `stave_lens_*` over that server rather than
   * re-implementing what the tools do.
   */
  userDataDir: string;
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
export async function launchStave(
  options: { userDataDir?: string } = {},
): Promise<StaveApp> {
  if (!existsSync(MAIN_ENTRY)) {
    throw new Error(
      `${MAIN_ENTRY} is missing. Run \`bun run build:desktop\` before the Electron e2e suite.`,
    );
  }

  const userDataDir =
    options.userDataDir ?? (await mkdtemp(path.join(tmpdir(), "stave-e2e-")));
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
    userDataDir,
    close: async () => {
      const child = app.process();
      try {
        await page.close({ runBeforeUnload: false }).catch(() => {});
      } finally {
        child.kill("SIGKILL");
      }
      // A recovery spec owns a profile across launches and cleans it up itself.
      if (options.userDataDir) return;
      // A killed Electron leaves helper processes flushing into the profile for
      // a moment, so an immediate remove races them and throws ENOTEMPTY. Retry
      // briefly, then give up: this is a directory under the OS temp root, and
      // failing a suite over cleanup would be worse than leaving it behind.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          await rm(userDataDir, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
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
  args: {
    projectPath: string;
    /**
     * Persisted app settings to seed alongside the project.
     *
     * Written through the same store the settings UI writes, so the app pushes
     * them to main itself on boot. A spec that needs, say, Lens CDP hosts
     * pre-approved gets them the way a user who typed them in would, instead of
     * poking main's security config behind the renderer's back — where the
     * renderer's own startup sync would overwrite it a moment later.
     */
    settings?: Record<string, unknown>;
  },
): Promise<void> {
  const write = () =>
    page.evaluate((input) => {
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
            ...(input.settings ? { settings: input.settings } : {}),
          },
          version: 0,
        }),
      );
    }, args);

  /*
   * Seed, reload, and confirm the project actually stuck — retrying the whole
   * cycle if it did not.
   *
   * Injecting through `localStorage` races the app's real hydration: startup
   * rehydrates synchronously and then runs `hydrateWorkspaces`, which can, on a
   * warm relaunch, land before the persisted project is in place and leave the
   * store project-less. The Lens affordance is disabled without a project, so a
   * test that proceeded here would fail for a reason unrelated to Lens. Re-
   * seeding is idempotent and cheap, so a few attempts turn the race into a
   * short delay instead of a flake.
   */
  const lensButton = page.getByRole("button", { name: "Lens", exact: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await write();
    await page.reload({ waitUntil: "domcontentloaded" });
    try {
      await expect(lensButton).toBeEnabled({ timeout: 15_000 });
      return;
    } catch {
      // Hydration clobbered the seed; write it again and reload.
    }
  }
  throw new Error("the seeded project never enabled the Lens affordance");
}

/**
 * Open a Lens tab the way a user does: the Lens button in the right rail.
 *
 * Retried, and the reason is worth stating because it looked like a product bug
 * for a while. Seeding through the persisted store means the app starts from a
 * synchronous rehydrate and *then* runs `hydrateWorkspaces`, which replaces
 * workspace state — including `lensTabs`. A Lens tab created in that window is
 * dropped, its panel unmounts, and the session it had just opened is closed
 * from the renderer's teardown path. Nothing about it is Lens-specific; it is a
 * race between the test and app startup.
 *
 * So: click, and require the panel to still be there a moment later. A first
 * click that lands mid-hydration is expected, not a failure.
 */
export async function openLensSurface(page: Page): Promise<void> {
  const lensButton = page.getByRole("button", { name: "Lens", exact: true });
  await expect(lensButton).toBeEnabled({ timeout: 30_000 });

  const panel = page.getByTestId("lens-surface-panel");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if ((await panel.count()) === 0) {
      await lensButton.click();
    }
    await page.waitForTimeout(1_000);
    if ((await panel.count()) > 0) {
      // Still there after a settle window, so hydration is not about to take
      // it away again.
      await page.waitForTimeout(500);
      if ((await panel.count()) > 0) {
        return;
      }
    }
  }
  throw new Error("the Lens panel never stayed mounted");
}

/** The Lens session id the first Lens tab in a workspace gets. */
export const E2E_LENS_SESSION_ID = "default";
