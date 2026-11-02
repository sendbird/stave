import { expect, test, type Page } from "@playwright/test";

/**
 * The shell's chrome pairs line up: the tab strip starts right under the top
 * bar (no preset row between them) and is as tall as the right panel's header
 * beside it; the sidebar header matches the top bar. Workspace rows share one
 * height in the repository tree and the Work queue, and a branch that only
 * repeats the title is not shown.
 */
async function seed(page: Page) {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/stave-chrome";
    const workspaces = [
      { id: "ws-main", name: "main", updatedAt: "2026-10-31T00:00:00.000Z" },
      { id: "ws-nav", name: "feat/navigation", updatedAt: "2026-10-31T00:00:00.000Z" },
      { id: "ws-docs", name: "Docs pass", updatedAt: "2026-10-31T00:00:00.000Z" },
    ];
    const snapshot = {
      activeTaskId: "task-a",
      openTaskTabIds: ["task-a"],
      activeSurface: { kind: "task", taskId: "task-a" },
      tasks: [{ id: "task-a", title: "Chrome fixture", provider: "claude-code", updatedAt: "2026-10-31T00:00:00.000Z", unread: false, archivedAt: null }],
      messagesByTask: { "task-a": [] },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify(workspaces.map((workspace, index) => ({ ...workspace, snapshot: index === 0 ? snapshot : { activeTaskId: "", tasks: [], messagesByTask: {} } }))),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath,
          repositoryName: "stave-chrome",
          defaultBranch: "main",
          workspaces,
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main", "ws-nav": "feat/navigation", "ws-docs": "docs/settings-copy" },
          workspacePathById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, repositoryPath])),
          workspaceDefaultById: { "ws-main": true },
          settings: { autoRoutingEnabled: true },
          ...snapshot,
        },
        version: 0,
      }),
    );
  });
}

/**
 * The browser build lists only the worktrees it finds, so restate the three
 * after hydration. The app also re-lists them every 30 seconds (`App.tsx`),
 * which would drop the restated rows from a test that runs past that under
 * load, so the fixture's refresh does nothing.
 */
async function restateWorkspaces(page: Page) {
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState({ refreshWorkspaces: async () => {} } as never);
    const workspaces = [
      { id: "ws-main", name: "main", updatedAt: "2026-10-31T00:00:00.000Z" },
      { id: "ws-nav", name: "feat/navigation", updatedAt: "2026-10-31T00:00:00.000Z" },
      { id: "ws-docs", name: "Docs pass", updatedAt: "2026-10-31T00:00:00.000Z" },
    ];
    useAppStore.setState({
      workspaces,
      workspaceBranchById: { "ws-main": "main", "ws-nav": "feat/navigation", "ws-docs": "docs/settings-copy" },
      workspacePathById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, "/tmp/stave-chrome"])),
      workspaceDefaultById: { "ws-main": true },
    } as never);
  });
}

async function rect(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, selector).not.toBeNull();
  return box!;
}

test("the tab strip sits under the top bar and matches the right panel header", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("top-bar")).toBeVisible();
  await expect(page.getByTestId("preset-launcher")).toBeVisible();
  await expect(page.getByTestId("preset-bar")).toHaveCount(0);

  const topBar = await rect(page, "[data-testid='top-bar']");
  const sidebarChrome = await rect(page, "[data-testid='project-workspace-sidebar-chrome']");
  const tabStrip = await rect(page, ".dv-tabs-and-actions-container");
  expect(sidebarChrome.height).toBe(topBar.height);
  expect(tabStrip.y).toBe(topBar.y + topBar.height);

  await page.getByTestId("workspace-bar").getByRole("button", { name: "Source Control", exact: true }).click();
  const panel = page.locator("[data-stave-right-panel][data-state='open']");
  await expect(panel).toBeVisible();
  const panelHeader = await rect(page, "[data-stave-right-panel] header");
  expect(panelHeader.y).toBe(tabStrip.y);
  expect(panelHeader.height).toBe(tabStrip.height);
  // Opens at its default width without truncating its commit control.
  expect(Math.round((await panel.boundingBox())!.width)).toBe(360);
});

test("workspace rows share one height in both views and hide a branch that repeats the title", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("top-bar")).toBeVisible();
  await restateWorkspaces(page);
  const sidebar = page.getByTestId("project-workspace-sidebar");
  await expect(sidebar.getByRole("button", { name: "Open workspace feat/navigation" })).toBeVisible();

  const treeRows = await sidebar.locator("[aria-label^='Open workspace']").evaluateAll((elements) =>
    elements.map((element) => ({
      height: Math.round(element.parentElement!.getBoundingClientRect().height),
      branch: element.querySelector("[data-workspace-row-branch]")?.textContent ?? null,
    })),
  );
  expect(treeRows.map((row) => row.height)).toEqual([40, 40, 40]);
  // Default keeps its branch; branch-named and renamed worktrees use only their title.
  expect(treeRows.map((row) => row.branch)).toEqual(["main", null, null]);

  await page.getByTestId("sidebar-view-work-queue").click();
  const queueRow = sidebar.locator("[data-testid^='active-workspace-']").first();
  await expect(queueRow).toBeVisible();
  expect(Math.round((await queueRow.boundingBox())!.height)).toBe(40);
});

test("a narrow window folds the sidebar to its rail; opening it there does not change the saved choice", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/");
  const sidebar = page.getByTestId("project-workspace-sidebar");
  await expect(sidebar).toBeVisible();
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBeLessThan(100);
  await page.getByRole("button", { name: "Expand project list" }).click();
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(290);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(290);
  const saved = await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    return useAppStore.getState().layout.workspaceSidebarCollapsed;
  });
  expect(saved).toBe(false);
});

for (const theme of ["light", "dark"] as const) {
  for (const locale of ["en", "ko"] as const) {
    test(`workspace tooltip shortcut uses its content right edge: ${theme}/${locale}`, async ({ page }) => {
      await seed(page);
      await page.goto("/");
      await expect(page.getByTestId("top-bar")).toBeVisible();
      await restateWorkspaces(page);
      await page.evaluate(async ({ theme, locale }) => {
        const { applyThemeClass } = await import("/src/lib/themes/apply.ts");
        const { applyAppLocale } = await import("/src/i18n/index.ts");
        applyThemeClass({ enabled: theme === "dark" });
        applyAppLocale(locale);
        await document.fonts.ready;
      }, { theme, locale });
      expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(theme === "dark");
      for (const density of ["regular", "compact"]) {
        await page.evaluate((density) => { document.documentElement.dataset.uiDensity = density; }, density);
        for (const displayMode of ["expanded", "compact"] as const) {
          await page.evaluate(async (displayMode) => {
            const { useAppStore } = await import("/src/store/app.store.ts");
            useAppStore.setState((state) => ({ layout: { ...state.layout, workspaceSidebarItemDisplayMode: displayMode } }));
          }, displayMode);
          for (const width of [1024, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            // Wait for the media-query event before opening the narrow sidebar;
            // crossing the breakpoint resets its temporary open choice.
            await expect.poll(() => page.evaluate(async () => {
              const { useWorkspaceSidebarFoldStore } = await import("/src/store/workspace-sidebar-fold-store.ts");
              const { isNarrowWindowForWorkspaceSidebar } = await import("/src/store/layout.utils.ts");
              return useWorkspaceSidebarFoldStore.getState().narrowWindow === isNarrowWindowForWorkspaceSidebar(window.innerWidth);
            })).toBe(true);
            await page.evaluate(async () => {
              const { setWorkspaceSidebarCollapsed } = await import("/src/store/workspace-sidebar-fold-store.ts");
              setWorkspaceSidebarCollapsed(false);
            });
            const row = page.getByTestId("project-workspace-sidebar").getByRole("button", { name: /Docs pass/ }).first();
            await expect(row.locator("[data-workspace-row-branch]")).toHaveCount(0);
            await expect(page.getByTestId("project-workspace-sidebar").locator('[data-workspace-row-branch]')).toHaveText("main");
            await row.hover({ position: { x: 8, y: 8 } });
            const tooltip = page.locator('[data-slot="tooltip-content"]');
            await expect(tooltip).toBeVisible();
            await expect(tooltip).toContainText("docs/settings-copy");
            const chip = tooltip.locator("kbd");
            await expect(chip).toBeVisible();
            // Both boxes must share the right edge (half a CSS pixel allows rounding).
            await expect.poll(() => chip.evaluate((element) => Math.abs(
              element.getBoundingClientRect().right - element.parentElement!.getBoundingClientRect().right,
            ))).toBeLessThanOrEqual(0.5);
            const chipBox = (await chip.boundingBox())!;
            const tooltipBox = (await tooltip.boundingBox())!;
            expect(chipBox.x).toBeGreaterThanOrEqual(tooltipBox.x);
            expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(width);
            await page.mouse.move(width - 1, 899);
            await expect(tooltip).toBeHidden();
          }
        }
      }
    });
  }
}

/** Give the renamed worktree three running tasks, so its row shows the running count. */
async function runTasksInDocsPass(page: Page) {
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const tasks = ["a", "b", "c"].map((id) => ({ id: `docs-${id}`, title: `Docs task ${id}`, provider: "claude-code", updatedAt: "2026-10-31T00:00:00.000Z", unread: false, archivedAt: null }));
    useAppStore.setState((state) => ({
      workspaceRuntimeCacheById: {
        ...state.workspaceRuntimeCacheById,
        "ws-docs": {
          ...(state.workspaceRuntimeCacheById["ws-docs"] ?? {}),
          tasks,
          messagesByTask: {},
          activeTurnIdsByTask: Object.fromEntries(tasks.map((task) => [task.id, `turn-${task.id}`])),
          openTaskTabIds: [],
        },
      },
    }) as never);
  });
}

for (const displayMode of ["expanded", "compact"] as const) {
  test(`workspace row menu takes its own room and the running count is plain: ${displayMode}`, async ({ page }) => {
    await seed(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("top-bar")).toBeVisible();
    await restateWorkspaces(page);
    await runTasksInDocsPass(page);
    await page.evaluate(async (displayMode) => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      useAppStore.setState((state) => ({ layout: { ...state.layout, workspaceSidebarItemDisplayMode: displayMode } }));
      await document.fonts.ready;
    }, displayMode);
    // The preview bubble opens on hover and would cover the trigger being measured.
    await page.addStyleTag({ content: '[data-slot="tooltip-content"], [data-slot="tooltip-positioner"] { display: none !important; }' });
    const sidebar = page.getByTestId("project-workspace-sidebar");

    // The running count reads like the repository's workspace count: numerals, no chip.
    const count = sidebar.locator("[data-responding-count]");
    await expect(count).toHaveText("3");
    await expect(count).toHaveAttribute("aria-label", "3 tasks running");
    expect(await count.evaluate((element) => getComputedStyle(element).borderStyle)).toBe("none");

    for (const name of [/Docs pass/, /Default/]) {
      const open = sidebar.getByRole("button", { name }).first();
      const trigger = open.locator("xpath=ancestor::div[.//*[starts-with(@data-testid,'workspace-actions-')]][1]").locator("[data-testid^='workspace-actions-']").first();
      // The workspace's shortcut lives in the hover preview, not in the row's actions.
      await expect(trigger.locator("xpath=..").locator("kbd")).toHaveCount(0);
      const clearance = async () => {
        const triggerLeft = (await trigger.boundingBox())!.x;
        const textRight = await open.evaluate((element) =>
          Math.max(...[...element.querySelectorAll("span, p")]
            .filter((node) => node.children.length === 0 && node.textContent?.trim())
            .map((node) => node.getBoundingClientRect().right)),
        );
        return triggerLeft - textRight;
      };
      await open.hover({ position: { x: 8, y: 8 } });
      await expect(trigger).toBeVisible();
      await expect.poll(clearance).toBeGreaterThanOrEqual(0);
      // An open menu keeps the room after the pointer leaves the row.
      await trigger.click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.mouse.move(1200, 880);
      await expect.poll(clearance).toBeGreaterThanOrEqual(0);
      if (name.source === "Docs pass") {
        await expect.poll(() => count.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
      }
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
    }
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`the active workspace and its open tasks share one fill, and the preview clears the row menu: ${theme}`, async ({ page }) => {
    await seed(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("top-bar")).toBeVisible();
    await restateWorkspaces(page);
    await page.evaluate(async (theme) => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      const { applyThemeClass } = await import("/src/lib/themes/apply.ts");
      applyThemeClass({ enabled: theme === "dark" });
      // A running task keeps the fixture's task listed under the active row.
      useAppStore.setState({ activeTurnIdsByTask: { "task-a": "turn-a" } } as never);
      await document.fonts.ready;
    }, theme);
    const sidebar = page.getByTestId("project-workspace-sidebar");
    const group = sidebar.locator("[data-workspace-item][data-active]");
    await expect(group).toHaveCount(1);
    const tasks = group.getByTestId("workspace-progress-tasks");
    await expect(tasks).toBeVisible();
    const fills = await group.evaluate((element) => {
      const row = element.firstElementChild as HTMLElement;
      return {
        group: getComputedStyle(element).backgroundColor,
        row: getComputedStyle(row).backgroundColor,
      };
    });
    // Two tones: a light wash under the row and its tasks, the row deeper on top.
    expect(fills.group).not.toBe("rgba(0, 0, 0, 0)");
    expect(fills.row).not.toBe("rgba(0, 0, 0, 0)");
    expect(fills.row).not.toBe(fills.group);
    const groupBox = (await group.boundingBox())!;
    const tasksBox = (await tasks.boundingBox())!;
    expect(tasksBox.y + tasksBox.height).toBeLessThanOrEqual(groupBox.y + groupBox.height + 0.5);
    // Idle workspaces stay unfilled.
    for (const idle of await sidebar.locator("[data-workspace-item]:not([data-active])").all()) {
      expect(await idle.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    }

    // The hover preview opens past the row's menu instead of over it.
    for (const name of [/Default/, /Docs pass/]) {
      const open = sidebar.getByRole("button", { name }).first();
      await open.hover({ position: { x: 8, y: 8 } });
      const tooltip = page.locator('[data-slot="tooltip-content"]');
      await expect(tooltip).toBeVisible();
      const trigger = open
        .locator("xpath=ancestor::*[@data-workspace-item][1]")
        .locator("[data-testid^='workspace-actions-']");
      await expect(trigger).toBeVisible();
      await expect.poll(async () => (await tooltip.boundingBox())!.x - ((await trigger.boundingBox())!.x + (await trigger.boundingBox())!.width)).toBeGreaterThanOrEqual(0);
      await page.mouse.move(1400, 880);
      await expect(tooltip).toBeHidden();
    }
  });
}

/** A live turn on the fixture's task, with a step and to-dos, as the provider reports it. */
async function runFixtureTask(page: Page) {
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { applyProviderTurnActivityEvents } = await import("/src/lib/providers/turn-status.ts");
    const activity = applyProviderTurnActivityEvents({
      activityByTask: {},
      taskId: "task-a",
      turnId: "turn-a",
      providerId: "claude-code",
      events: [{ type: "tool", toolUseId: "read-1", toolName: "Read", input: JSON.stringify({ file_path: "src/a.ts" }), state: "input-available" }],
      now: Date.now() - 90_000,
    });
    const todo = {
      id: "todo-message", role: "assistant", providerId: "claude-code", model: "model", content: "", turnId: "turn-a", isStreaming: true,
      parts: [{ type: "tool_use", toolUseId: "todo", toolName: "TodoWrite", state: "output-available", input: JSON.stringify({ todos: [{ content: "One", status: "completed" }, { content: "Two", status: "in_progress" }, { content: "Three", status: "pending" }] }) }],
    };
    useAppStore.setState((state) => ({
      activeTurnIdsByTask: { "task-a": "turn-a" },
      providerTurnActivityByTask: { ...state.providerTurnActivityByTask, ...activity },
      messagesByTask: { ...state.messagesByTask, "task-a": [todo] },
    }) as never);
  });
}

for (const locale of ["en", "ko"] as const) {
  test(`a running task says what it is doing on its own row, not on the workspace row: ${locale}`, async ({ page }) => {
    await seed(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("top-bar")).toBeVisible();
    await restateWorkspaces(page);
    await runFixtureTask(page);
    await page.evaluate(async (locale) => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      const { applyAppLocale } = await import("/src/i18n/index.ts");
      applyAppLocale(locale);
      useAppStore.setState((state) => ({ layout: { ...state.layout, workspaceSidebarItemDisplayMode: "expanded" } }) as never);
      await document.fonts.ready;
    }, locale);
    const sidebar = page.getByTestId("project-workspace-sidebar");
    const group = sidebar.locator("[data-workspace-item][data-active]");
    // The workspace row keeps its title; the step lives with the task.
    await expect(group.locator("[data-run-progress]")).toHaveCount(0);
    const task = group.locator('[data-workspace-progress-task="task-a"]');
    const progress = task.locator("[data-task-run-progress]");
    await expect(progress).toHaveAttribute("data-task-run-progress", "working");
    await expect(progress).toContainText(locale === "en" ? "Read file · 1/3" : "1/3");
    await expect(progress).toContainText(locale === "en" ? "1m" : "1분");
    const geometry = await task.evaluate((row) => {
      const title = row.querySelector(":scope > span:nth-child(2)")!.getBoundingClientRect();
      const meta = row.querySelector("[data-task-run-progress]")!;
      const words = meta.firstElementChild!.getBoundingClientRect();
      const time = meta.lastElementChild!.getBoundingClientRect();
      const status = row.querySelector(":scope > span:nth-child(3)")!.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      return {
        wordsLeft: words.left, titleLeft: title.left, timeRight: time.right, statusRight: status.right,
        rowRight: box.right, metaTop: meta.getBoundingClientRect().top, titleBottom: title.bottom,
        scroll: row.scrollWidth <= row.clientWidth + 1,
      };
    });
    // The words start under the title, the time ends under the status mark, on a line of its own.
    expect(Math.abs(geometry.wordsLeft - geometry.titleLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.timeRight - geometry.statusRight)).toBeLessThanOrEqual(1);
    expect(geometry.timeRight).toBeLessThanOrEqual(geometry.rowRight);
    expect(geometry.metaTop).toBeGreaterThanOrEqual(geometry.titleBottom - 1);
    expect(geometry.scroll).toBe(true);

    // Compact rows stay one line.
    await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      useAppStore.setState((state) => ({ layout: { ...state.layout, workspaceSidebarItemDisplayMode: "compact" } }) as never);
    });
    await expect(task.locator("[data-task-run-progress]")).toHaveCount(0);
  });
}
