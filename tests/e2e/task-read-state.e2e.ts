import { expect, test, type Page } from "@playwright/test";

// The preview entry loads the actual renderer modules on a cold dev server.
test.setTimeout(90_000);

async function mountHistory(page: Page, options: { locale: "en" | "ko"; dark: boolean; width: number }) {
  await page.setViewportSize({ width: options.width, height: 900 });
  await page.goto("/?stavePreview=aui-regressions", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async ({ locale, dark }) => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { TaskHistoryDrawer } = await import("/src/components/panes/TaskHistoryDrawer.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    // Reuse the app graph revision; a bare import can create a separate store after HMR.
    const { useAppStore } = await import(performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname === "/src/store/app.store.ts").at(-1)!.name);
    const { applyAppLocale } = await import("/src/i18n/index.ts");
    const { applyThemeClass } = await import("/src/lib/themes/apply.ts");
    applyAppLocale(locale);
    applyThemeClass({ enabled: dark });
    const tasks = ["Alpha", "Beta", "Gamma"].map((title) => ({ id: title, title, provider: "codex", unread: false,
      archivedAt: "2026-11-16T00:00:00.000Z", updatedAt: "2026-11-16T00:00:00.000Z" }));
    useAppStore.setState({ repositoryPath: "/tmp/history", repositoryName: "history",
      workspaces: [{ id: "history-ws", name: "history", updatedAt: "2026-11-16T00:00:00.000Z" }],
      workspacePathById: { "history-ws": "/tmp/history" },
      activeWorkspaceId: "history-ws", tasks, openTaskTabIds: [], messagesByTask: {}, messageCountByTask: {} });
    (window as unknown as { deleted: string[] }).deleted = [];
    window.api = { ...window.api, taskControl: { deletePermanently: async ({ taskId }: { taskId: string }) => {
      (window as unknown as { deleted: string[] }).deleted.push(taskId);
      return taskId === "Beta" ? { ok: false, message: "running" } : { ok: true };
    } } };
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div"); document.body.append(host);
    createRoot(host).render(React.createElement(StaveDesignProvider, null,
      React.createElement(TaskHistoryDrawer, { open: true, workspaceId: "history-ws", onOpenChange: () => {} })));
    await document.fonts.ready;
  }, options);
  await expect(page.locator("[data-history-task-id]")).toHaveCount(3);
}

for (const locale of ["en", "ko"] as const) for (const width of [1440, 1024]) {
 test(`task read actions share a persistent unread indicator ${locale} ${width}`, async ({ page }) => {
 await mountHistory(page, {locale, width, dark: locale === "ko"});
 await page.evaluate(() => { window.api = { ...window.api, persistence: undefined }; });
 const first = page.locator('[data-history-task-id="Alpha"]');
 await first.getByRole('button', {name: locale === "en" ? "Read actions for Alpha" : "Alpha 읽음 메뉴"}).click();
 await page.getByRole('menuitem', {name: locale === "en" ? "Mark as unread" : "읽지 않음으로 표시", exact:true}).click();
 await expect(first.locator('[data-task-unread="Alpha"]')).toBeVisible();
 await page.screenshot({path: `/tmp/gap-h1/after2/history-${locale}-${width}.png`});
 const saved = await page.evaluate(() => window.localStorage.getItem("stave:task-read-marks:v1"));
 expect(saved).toContain("Alpha");
 await first.getByRole('button', {name: locale === "en" ? "Read actions for Alpha" : "Alpha 읽음 메뉴"}).click();
 await page.getByRole('menuitem', {name: locale === "en" ? "Mark as read" : "읽음으로 표시", exact:true}).click();
 await expect(first.locator('[data-task-unread="Alpha"]')).toHaveCount(0);
 });
}

async function seedApp(page: Page) {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/task-read-app";
    const updatedAt = new Date().toISOString();
    const tasks = Array.from({ length: 5 }, (_, index) => ({ id: `read-${index}`, title: `Read task ${index}`, provider: "codex", updatedAt, unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave" }));
    const workspace = { id: "read-workspace", name: "read-workspace", updatedAt };
    const snapshot = { activeTaskId: tasks[0]!.id, tasks, messagesByTask: {}, openTaskTabIds: tasks.map((task) => task.id) };
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{ ...workspace, snapshot }]));
    localStorage.setItem("stave-store", JSON.stringify({ state: {
      ...snapshot, repositoryPath, repositoryName: "Task read", workspaces: [workspace], activeWorkspaceId: workspace.id,
      workspacePathById: { [workspace.id]: repositoryPath }, workspaceDefaultById: { [workspace.id]: true }, settings: { fleetBoardLayout: "cards" },
    }, version: 0 }));
    (window as unknown as { api: unknown }).api = { provider: { streamTurn: async () => [] }, terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) }, sourceControl: { getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }), getHistory: async () => ({ ok: true, items: [], stderr: "" }) } };
  });
  await page.goto("/");
}

test("Fleet card rows keep read controls outside the row button and name unread tasks; the sidebar keeps them in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedApp(page);
  const sidebarTasks = page.getByTestId("workspace-progress-tasks");
  // Idle workspace with nothing unread or pinned: one line, no task rows.
  await expect(page.getByRole("navigation").first()).toBeVisible();
  await expect(sidebarTasks).toHaveCount(0);
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  await page.getByRole("radiogroup", { name: "Board layout" }).getByRole("radio", { name: "Cards" }).click();
  const row = page.locator('[data-fleet-task-row="true"]').filter({ hasText: "Read task 2" });
  await expect(row).toHaveCount(1);
  const item = page.getByRole("listitem").filter({ has: row });
  await item.getByRole("button", { name: "Read actions for Read task 2", exact: true }).click();
  await page.getByRole("menuitem", { name: "Mark as unread", exact: true }).click();
  await expect(item.locator('[data-task-unread="read-2"]')).toBeVisible();
  // The menu did not toggle the row, the row's name says unread, and no button nests inside it.
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(row).toHaveAttribute("aria-label", /, unread$/);
  expect(await row.locator("button").count()).toBe(0);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.locator("[data-agent-fleet-card], article").filter({ has: row }).first().screenshot({ path: "/tmp/gap-h1/after2/fleet-card-unread-en-light-1440.png" });
  // The finished unread task now shows under its workspace, the rest fold away.
  await expect(sidebarTasks).toHaveCount(1);
  await expect(sidebarTasks.locator("[data-workspace-progress-task]")).toHaveCount(1);
  await expect(sidebarTasks.locator('[data-workspace-progress-task="read-2"]')).toHaveAttribute("aria-label", /unread$/);
  await expect(sidebarTasks.getByRole("button", { name: "+4 more tasks", exact: true })).toBeVisible();
  await sidebarTasks.screenshot({ path: "/tmp/gap-h1/after2/sidebar-compact-en-light-1440.png" });
  await sidebarTasks.getByRole("button", { name: "+4 more tasks", exact: true }).click();
  await expect(sidebarTasks.locator("[data-workspace-progress-task]")).toHaveCount(5);
  await sidebarTasks.screenshot({ path: "/tmp/gap-h1/after2/sidebar-expanded-en-light-1440.png" });
});
