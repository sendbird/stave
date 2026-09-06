import { expect, test, type Page } from "@playwright/test";

async function seedTasks(page: Page) {
  await page.addInitScript(() => {
    const items = ["todo", "in_progress", "done"].map((category, index) => ({
      task: {
        source: "jira",
        ref: `UX-${index + 1}`,
        key: `UX-${index + 1}`,
        title: [
          "Keep task layout readable",
          "Review the responsive rail",
          "Ship the tokens",
        ][index],
        url: `https://tracker.example.test/UX-${index + 1}`,
        status: { raw: category.replace("_", " "), category },
        priority: { raw: "Medium", level: "medium" },
        assignee: { id: "u1", name: "Mara Ito" },
        labels: [{ name: "design" }],
        dueDate: null,
        effort: null,
        project: null,
        team: null,
        parentKey: null,
        subtasks: null,
        issueType: null,
        links: [],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
        closedAt: category === "done" ? "2026-09-03T00:00:00.000Z" : null,
      },
      staveLinks: [],
    }));
    const workspaceSnapshot = {
      activeTaskId: "task-ui",
      openTaskTabIds: ["task-ui"],
      activeSurface: { kind: "task", taskId: "task-ui" },
      tasks: [
        {
          id: "task-ui",
          title: "UI fixture",
          provider: "codex",
          updatedAt: "2026-09-02T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-ui": [] },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-09-02T00:00:00.000Z",
          snapshot: workspaceSnapshot,
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-tasks",
          projectName: "stave-tasks",
          workspaces: [
            {
              id: "ws-main",
              name: "main",
              updatedAt: "2026-09-02T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-tasks" },
          workspaceDefaultById: { "ws-main": true },
          recentProjects: [
            {
              projectPath: "/tmp/stave-tasks",
              projectName: "stave-tasks",
              workspaces: [{ id: "ws-main", name: "main" }],
            },
          ],
          settings: {
            autoRoutingEnabled: true,
            trackerTasks: {
              defaultView: "assigned-open",
              refreshIntervalSeconds: 60,
              defaultKickoffStartMode: "run",
              sourceEnabled: { jira: true, crane: false },
            },
          },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      trackerTasks: {
        configure: async () => ({
          ok: true,
          status: {
            sources: [
              {
                source: "jira",
                availability: "ready",
                syncing: false,
                lastSyncedAt: "2026-09-02T00:00:00.000Z",
                lastErrorCode: null,
                taskCount: items.length,
                truncated: false,
              },
              {
                source: "crane",
                availability: "disabled",
                syncing: false,
                lastSyncedAt: null,
                lastErrorCode: null,
                taskCount: 0,
                truncated: false,
              },
            ],
          },
        }),
        getStatus: async () => ({
          ok: true,
          status: {
            sources: [
              {
                source: "jira",
                availability: "ready",
                syncing: false,
                lastSyncedAt: "2026-09-02T00:00:00.000Z",
                lastErrorCode: null,
                taskCount: items.length,
                truncated: false,
              },
              {
                source: "crane",
                availability: "disabled",
                syncing: false,
                lastSyncedAt: null,
                lastErrorCode: null,
                taskCount: 0,
                truncated: false,
              },
            ],
          },
        }),
        list: async () => ({ ok: true, items }),
        refresh: async () => ({ ok: true }),
        getDetail: async ({ taskRef }: { taskRef: string }) => ({
          ok: true,
          detail: {
            ...items.find((item) => item.task.ref === taskRef)?.task,
            description:
              "A detail body that verifies the migrated reader surface.",
            comments: [],
          },
        }),
        kickoff: async () => ({ ok: false }),
        attachStaveTask: async () => ({ ok: false }),
        setSurfaceVisible: async () => ({ ok: true }),
        onStatus: () => () => {},
        onCacheUpdated: () => () => {},
        onKickoffUpdated: () => () => {},
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: "main",
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
      },
    };
  });
}

test("Tasks board, reader, and kickoff sheet preserve desktop geometry", async ({
  page,
}, testInfo) => {
  await seedTasks(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "open-tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: "Board" }).click();
  const board = page.locator('[data-stave-tasks-board=""]');
  await expect(board).toBeVisible();
  await expect(board.locator("[data-board-column]")).toHaveCount(5);
  await expect
    .poll(() =>
      board.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);
  await page.getByText("Keep task layout readable", { exact: true }).click();
  const peek = page.locator('[data-stave-peek-panel=""]');
  await expect(peek).toBeVisible();
  await expect
    .poll(async () => (await peek.boundingBox())?.width ?? 0)
    .toBeGreaterThan(400);
  await expect(peek.getByText("Description", { exact: true })).toBeVisible();
  await expect(peek.getByRole("button", { name: "Kick off" })).toBeVisible();
  await peek.getByRole("button", { name: "Kick off" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Kick off UX-1 in Stave/)).toBeVisible();
  await expect
    .poll(() =>
      sheet.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          starting: element.hasAttribute("data-starting-style"),
          ending: element.hasAttribute("data-ending-style"),
          opacity: style.opacity,
          translate: style.translate,
        };
      }),
    )
    .toEqual({
      starting: false,
      ending: false,
      opacity: "1",
      translate: "0px",
    });
  await expect(
    sheet.getByRole("textbox", { name: "Instruction for the run" }),
  ).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(sheetBox!.width).toBeGreaterThan(400);
  expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: testInfo.outputPath("tasks-board-peek.png") });
});
