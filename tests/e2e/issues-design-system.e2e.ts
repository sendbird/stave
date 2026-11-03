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
        repository: null,
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
          repositoryPath: "/tmp/stave-tasks",
          repositoryName: "stave-tasks",
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
          recentRepositories: [
            {
              repositoryPath: "/tmp/stave-tasks",
              repositoryName: "stave-tasks",
              workspaces: [{ id: "ws-main", name: "main" }],
            },
          ],
          settings: {
            autoRoutingEnabled: true,
            trackerIssues: {
              defaultView: "assigned-open",
              refreshIntervalSeconds: 60,
              defaultKickoffStartMode: "run",
              sourceEnabled: { crane: false },
            },
          },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      trackerIssues: {
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
  await page.getByRole("button", { name: "Open Issues" }).click();
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await page.getByRole("radio", { name: "Board" }).click();
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

test("one searchable Filter list, applied chips with per-chip remove and Clear all on their own row", async ({ page }) => {
  await seedTasks(page);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open Issues" }).click();
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await page.getByRole("radio", { name: /All open/ }).click();
  const filter = page.getByRole("combobox", { name: "Filter", exact: true });
  await filter.click();
  const search = page.getByRole("combobox", { name: "Search filter values" });
  await expect(search).toBeFocused();
  await search.fill("progress");
  await expect(page.getByRole("option", { name: "In progress", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "To do", exact: true })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await search.fill("design");
  await page.getByRole("listbox").filter({ has: page.getByRole("group", { name: "Label" }) }).getByRole("option", { name: /^design/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Search filter values" })).toHaveCount(0);
  const applied = page.getByRole("group", { name: "Applied filters" }).or(page.getByRole("region", { name: "Applied filters" })).or(page.getByLabel("Applied filters"));
  await expect(applied.first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove filter: Status is In progress" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /2 filters · 1 issue/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Filter, 2 active" })).toBeVisible();
  // Clear all sits in the applied row at the inline start of the toolbar,
  // not at the end of the wrapped display-controls row.
  const clearAll = page.getByRole("button", { name: "Clear all" });
  const firstChip = page.getByRole("button", { name: "Remove filter: Status is In progress" });
  const clearBox = (await clearAll.boundingBox())!;
  const chipBox = (await firstChip.boundingBox())!;
  const filterBox = (await page.getByRole("combobox", { name: "Filter, 2 active" }).boundingBox())!;
  expect(Math.abs(clearBox.y + clearBox.height / 2 - (chipBox.y + chipBox.height / 2))).toBeLessThanOrEqual(2);
  expect(chipBox.y).toBeGreaterThan(filterBox.y + filterBox.height);
  await page.screenshot({ path: test.info().outputPath("issues-applied-filters.png") });
  await firstChip.click();
  await expect(page.getByRole("button", { name: /Remove filter: Status/ })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /1 filter · / })).toBeVisible();
  await clearAll.click();
  await expect(page.getByRole("button", { name: /Remove filter/ })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Filter", exact: true })).toBeVisible();
});
