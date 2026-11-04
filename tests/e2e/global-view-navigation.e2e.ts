import { expect, test, type Page } from "@playwright/test";

const REPOSITORY_PATH = "/tmp/stave-global-views";

/** One repository, two workspaces, a task in each. */
async function seed(page: Page) {
  await page.addInitScript((repositoryPath) => {
    const now = Date.now();
    const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
    const workspaces = [0, 1].map((index) => ({
      id: `ws-nav-${index}`,
      name: `nav-${index}`,
      updatedAt: iso(60),
    }));
    const task = (id: string, title: string, minutesAgo: number) => ({
      id, title, provider: "claude-code", updatedAt: iso(minutesAgo), unread: false, archivedAt: null,
    });
    const tasksByWorkspace: Record<string, ReturnType<typeof task>[]> = {
      "ws-nav-0": [task("task-0", "Ship the search fix", 1)],
      "ws-nav-1": [task("task-1", "Review the API shape", 30)],
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(
        workspaces.map((workspace) => {
          const tasks = tasksByWorkspace[workspace.id]!;
          return {
            ...workspace,
            snapshot: {
              activeTaskId: tasks[0]!.id,
              tasks,
              messagesByTask: {},
              openTaskTabIds: tasks.map((entry) => entry.id),
            },
          };
        }),
      ),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-global-views",
          workspaces,
          activeWorkspaceId: "ws-nav-0",
          workspaceBranchById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.name])),
          workspacePathById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, repositoryPath])),
          workspaceDefaultById: { "ws-nav-0": true },
          activeTaskId: "task-0",
          tasks: tasksByWorkspace["ws-nav-0"],
          openTaskTabIds: ["task-0"],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      runs: { listDelegatedTasks: async () => [] },
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  }, REPOSITORY_PATH);
}

const fleetBoard = (page: Page) => page.getByRole("radiogroup", { name: "Board layout" });

async function openFleet(page: Page) {
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  await expect(fleetBoard(page)).toBeVisible();
}

async function focusedRegion(page: Page) {
  return page.evaluate(
    () => (document.activeElement?.closest("[data-focus-region]") as HTMLElement | null)?.dataset.focusRegion ?? null,
  );
}

test.beforeEach(async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("top-bar")).toBeVisible();
  await expect(page.locator('[data-workspace-item="ws-nav-0"]')).toBeVisible();
  // The browser bridge lists the worktrees git knows; this path has none, so
  // the second workspace is put back the way fleet-agent-tree.e2e does.
  await page.evaluate(async (repositoryPath) => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const workspaces = [0, 1].map((index) => ({
      id: `ws-nav-${index}`,
      name: `nav-${index}`,
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    }));
    useAppStore.setState({
      workspaces,
      workspacePathById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, repositoryPath])),
      workspaceBranchById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.name])),
    } as never);
  }, REPOSITORY_PATH);
  await expect(page.locator('[data-workspace-item="ws-nav-1"]')).toBeVisible();
});

test("closing a view goes back one step, and Back returns to Fleet from its task", async ({ page }) => {
  await openFleet(page);

  // Fleet → Agent performance (Agents) → Esc returns to Fleet, not the workspace.
  await page.getByRole("button", { name: "Agent performance" }).click();
  await expect(fleetBoard(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(fleetBoard(page)).toBeVisible();

  // Pick the second agent and open its task in the other workspace: the
  // header's back button returns to Fleet with the same agent still open.
  const review = page.getByRole("button", { name: "Review the API shape", exact: true });
  await review.click();
  await expect(review).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Open Review the API shape in nav-1" }).click();
  const back = page.getByTestId("task-back-to-fleet");
  await expect(back).toBeVisible();
  await expect(back).toHaveAccessibleName("Back to Fleet View");
  await back.click();
  await expect(fleetBoard(page)).toBeVisible();
  await expect(review).toHaveAttribute("aria-expanded", "true");

  // The same step from the keyboard.
  await page.getByRole("button", { name: "Open Review the API shape in nav-1" }).click();
  await expect(page.getByTestId("task-back-to-fleet")).toBeVisible();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("ControlOrMeta+BracketLeft");
  await expect(fleetBoard(page)).toBeVisible();

  // Closing Fleet goes one step back from Fleet: to where it was first opened.
  await page.getByRole("button", { name: "Close Fleet view", exact: true }).click();
  await expect(fleetBoard(page)).toHaveCount(0);
  await expect(page.locator('[data-workspace-item="ws-nav-0"] [aria-current="page"]')).toHaveCount(1);
});

test("only the current place carries aria-current", async ({ page }) => {
  const sidebar = page.getByTestId("project-workspace-sidebar");
  const activeRow = sidebar.locator('[data-workspace-item="ws-nav-0"]');
  await expect(activeRow.locator('[aria-current="page"]')).toHaveCount(1);
  const transparent = "rgba(0, 0, 0, 0)";
  const fill = () => activeRow.evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect.poll(fill).not.toBe(transparent);

  await openFleet(page);
  await expect(activeRow.locator('[aria-current="page"]')).toHaveCount(0);
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(sidebar.locator('[aria-current="page"]')).toContainText("Fleet");
  // The group's selected wash fades out (a fast transition) while Fleet shows.
  await expect.poll(fill).toBe(transparent);
});

test("F6 cycles regions, Skip to content lands in main, arrows move between workspace rows", async ({ page }) => {
  // The skip link is the first Tab stop (the composer takes focus on load, so
  // check document order) and, once focused, it shows and jumps into main.
  const skip = page.getByRole("link", { name: "Skip to content" });
  expect(
    await page.evaluate(
      () => document.querySelector("a[href], button, input, textarea, select, [tabindex]")?.textContent,
    ),
  ).toBe("Skip to content");
  await skip.focus();
  await expect(skip).toBeInViewport();
  expect((await skip.boundingBox())!.width).toBeGreaterThan(40);
  await page.keyboard.press("Enter");
  expect(await focusedRegion(page)).toBe("main");

  await page.locator("body").click({ position: { x: 1, y: 1 } });

  await page.keyboard.press("F6");
  expect(await focusedRegion(page)).toBe("sidebar");
  await page.keyboard.press("F6");
  expect(await focusedRegion(page)).toBe("top-bar");
  await page.keyboard.press("F6");
  expect(await focusedRegion(page)).toBe("main");
  await page.keyboard.press("Shift+F6");
  expect(await focusedRegion(page)).toBe("top-bar");

  // From inside a region F6 returns to where focus was left there.
  const row0 = page.locator('[data-workspace-item="ws-nav-0"] [data-workspace-row-focus]');
  const row1 = page.locator('[data-workspace-item="ws-nav-1"] [data-workspace-row-focus]');
  await row0.focus();
  await page.keyboard.press("ArrowDown");
  await expect(row1).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(row0).toBeFocused();
  await page.keyboard.press("F6");
  await page.keyboard.press("Shift+F6");
  await expect(row0).toBeFocused();

});
