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
 await first.getByRole('button', {name: locale === "en" ? "Task read actions" : "작업 읽음 메뉴"}).click();
 await page.getByRole('menuitem', {name: locale === "en" ? "Mark as unread" : "읽지 않음으로 표시", exact:true}).click();
 await expect(first.locator('[data-task-unread="Alpha"]')).toBeVisible();
 await page.screenshot({path: `/tmp/gap-h1/after2/history-${locale}-${width}.png`});
 const saved = await page.evaluate(() => window.localStorage.getItem("stave:task-read-marks:v1"));
 expect(saved).toContain("Alpha");
 await first.getByRole('button', {name: locale === "en" ? "Task read actions" : "작업 읽음 메뉴"}).click();
 await page.getByRole('menuitem', {name: locale === "en" ? "Mark as read" : "읽음으로 표시", exact:true}).click();
 await expect(first.locator('[data-task-unread="Alpha"]')).toHaveCount(0);
 });
}
