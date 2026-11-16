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
    const { useAppStore } = await import("/src/store/app.store.ts");
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

for (const options of [{ locale: "en", dark: false, width: 1440 }, { locale: "ko", dark: true, width: 1024 }] as const) {
  test(`Task History restores selected rows with keyboard and mouse ${options.locale}`, async ({ page }) => {
    await mountHistory(page, options);
    const rows = page.locator("[data-history-task-id]");
    const geometry = await rows.first().evaluate((row) => {
      const checkbox = row.querySelector('[role="checkbox"]')!.getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      return { width: checkbox.width, height: checkbox.height,
        centerDelta: Math.abs((checkbox.top + checkbox.bottom - rect.top - rect.bottom) / 2),
        contained: row.scrollWidth <= row.clientWidth };
    });
    expect(geometry.width).toBeGreaterThanOrEqual(24);
    expect(geometry.height).toBeGreaterThanOrEqual(24);
    // Flex row alignment centres the checkbox to the complete row; allow subpixel rounding.
    expect(geometry.centerDelta).toBeLessThanOrEqual(1);
    expect(geometry.contained).toBe(true);
    await rows.nth(0).focus(); await page.keyboard.press("x");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(rows.nth(0).getByRole("checkbox")).toBeChecked();
    await expect(rows.nth(1).getByRole("checkbox")).toBeChecked();
    await rows.nth(2).click({ modifiers: ["ControlOrMeta"] });
    await expect(rows.nth(2).getByRole("checkbox")).toBeChecked();
    await page.screenshot({ path: `/tmp/fleet-bulk/after/history-${options.locale}-${options.width}-3.png` });
    const restore = page.getByRole("button", { name: options.locale === "en" ? "Restore (3)" : "복원 (3)", exact: true });
    await restore.click();
    await expect(rows).toHaveCount(0);
    expect(await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      return useAppStore.getState().openTaskTabIds;
    })).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test(`Task History deletes explicitly and continues after host refusal ${options.locale}`, async ({ page }) => {
    await mountHistory(page, options);
    await page.locator("[data-history-task-id]").first().focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: options.locale === "en" ? "Delete permanently (3)" : "영구 삭제 (3)", exact: true }).click();
    const confirmation = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: options.locale === "en" ? "Delete 3 tasks permanently?" : "작업 3개를 영구 삭제할까요?" }) });
    await expect(confirmation).toBeVisible();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => (window as unknown as { deleted: string[] }).deleted)).toEqual([]);
    await confirmation.getByRole("button", { name: options.locale === "en" ? "Delete permanently (3)" : "영구 삭제 (3)", exact: true }).click();
    await expect(page.locator("[data-history-task-id]")).toHaveCount(1);
    await expect(page.locator("[data-history-task-id]")).toHaveAttribute("data-history-task-id", "Beta");
    expect(await page.evaluate(() => (window as unknown as { deleted: string[] }).deleted)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
}
