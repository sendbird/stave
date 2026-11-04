import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`closed task tabs ignore stale pane focus in ${theme}`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("workspace-pane-host")).toBeVisible();
    await page.evaluate(async (theme) => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      const { applyThemeClass } = await import("/src/lib/themes/apply.ts");
      applyThemeClass({ enabled: theme === "dark" });
      useAppStore.setState({
        hasHydratedWorkspaces: true,
        activeWorkspaceId: "closed-task-regression",
        tasks: ["task-a", "task-b"].map((id) => ({
          id, title: id, provider: "codex", unread: false, archivedAt: null,
          updatedAt: "2026-11-04T00:00:00.000Z",
        })),
        openTaskTabIds: ["task-a", "task-b"],
        activeTaskId: "task-a",
        activeSurface: { kind: "task", taskId: "task-a" },
        dockLayout: null,
      });
    }, theme);
    await expect(page.locator('[data-pane-tab-chip="task:task-a"]')).toBeVisible();
    await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      const store = useAppStore.getState();
      store.closeTaskTab({ taskId: "task-a" });
      // A panel can still emit focus before the host reconciles its removal.
      store.setActiveSurfaceFromPane({ kind: "task", taskId: "task-a" });
    });
    await expect(page.locator('[data-pane-tab-chip="task:task-a"]')).toHaveCount(0);
    await expect(page.locator('[data-pane-tab-chip="task:task-b"]')).toBeVisible();
    await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      const store = useAppStore.getState();
      store.closeTaskTab({ taskId: "task-b" });
      store.setActiveSurfaceFromPane({ kind: "task", taskId: "task-b" });
    });
    await expect(page.locator("[data-pane-tab-chip]")).toHaveCount(0);
    // History and other explicit selections must still reopen a closed task.
    await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      useAppStore.getState().selectTask({ taskId: "task-a" });
    });
    await expect(page.locator('[data-pane-tab-chip="task:task-a"]')).toBeVisible();
  });
}
