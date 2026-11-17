import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("workspace lists keep bounded rows and navigate across offscreen repository boundaries", async ({ page }) => {
  await page.addInitScript(() => {
    const makeRepository = (repository: number) => {
      const repositoryPath = `/tmp/sidebar-scale-${repository}`;
      const workspaces = Array.from({ length: 200 }, (_, index) => ({
        id: `scale-${repository}-${index}`,
        name: `Workspace ${repository}-${index}`,
        updatedAt: "2026-08-01T00:00:00.000Z",
      }));
      return {
        repositoryPath, repositoryName: `Repository ${repository}`, workspaces,
        lastOpenedAt: "2026-08-01T00:00:00.000Z", defaultBranch: "main",
        activeWorkspaceId: workspaces[0]!.id,
        workspaceBranchById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, "main"])),
        workspacePathById: Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace.id.endsWith("-0") ? repositoryPath : `${repositoryPath}/.stave/workspaces/${workspace.id}`])),
        workspaceDefaultById: { [workspaces[0]!.id]: true },
      };
    };
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([makeRepository(0), makeRepository(1)].flatMap((repository) => repository.workspaces.map((workspace) => ({ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {}, openTaskTabIds: [] } })))));
    (window as unknown as { api: unknown }).api = { provider: { streamTurn: async () => [] }, terminal: { runCommand: async () => ({ ok: false, code: 1, stdout: "", stderr: "" }) }, sourceControl: { getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }), getHistory: async () => ({ ok: true, items: [], stderr: "" }) } };
    window.localStorage.setItem("stave-store", JSON.stringify({ state: {
      ...makeRepository(0), recentRepositories: [makeRepository(1)],
      tasks: [], messagesByTask: {}, activeTaskId: "",
    }, version: 0 }));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const sidebar = page.getByTestId("project-workspace-sidebar");
  const rows = sidebar.locator("[data-workspace-row-focus]");
  await expect(rows.first()).toBeVisible();
  await mkdir("/tmp/gap-h4", { recursive: true });
  for (const [language, theme] of [["en", "light"], ["ko", "dark"]] as const) {
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async ({ language, theme }) => {
        const { i18n } = await import("/src/i18n/index.ts");
        const { useAppStore } = await import("/src/store/app.store.ts");
        await i18n.changeLanguage(language);
        useAppStore.getState().updateSettings({ patch: { themeMode: theme } });
        await document.fonts.ready;
      }, { language, theme });
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*\bdark\b).*$/);
      await expect(rows.first()).toBeVisible();
      await sidebar.screenshot({ path: `/tmp/gap-h4/sidebar-${process.env.GAP_H4_STAGE ?? "after"}-${language}-${theme}-${width}.png` });
    }
  }
  await page.evaluate(async () => {
    const { i18n } = await import("/src/i18n/index.ts");
    await i18n.changeLanguage("en");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const expand = page.getByRole("button", { name: "Expand project list", exact: true });
  if (await expand.isVisible()) await expand.click();
  await expect.poll(() => rows.count()).toBeLessThan(150);
  console.log(`sidebar project rows: ${await rows.count()}`);
  await rows.first().focus();
  await page.keyboard.press("End");
  await expect(sidebar.locator('[data-workspace-item="scale-0-199"] [data-workspace-row-focus]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(sidebar.locator('[data-workspace-item="scale-1-0"] [data-workspace-row-focus]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(sidebar.locator('[data-workspace-item="scale-1-1"] [data-workspace-row-focus]')).toBeFocused();
  await expect.poll(() => rows.count()).toBeLessThan(150);
  await expect(sidebar.locator('[data-sidebar-virtual-index="1"]').first()).toHaveAttribute("aria-setsize", "200");

  const second = sidebar.locator('[data-workspace-item="scale-1-1"] [data-workspace-row-focus]');
  await page.keyboard.press("Alt+ArrowDown");
  await expect(second).toBeFocused();
  await expect.poll(() => page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    return useAppStore.getState().recentRepositories.find((repository) => repository.repositoryPath === "/tmp/sidebar-scale-1")?.workspaces[2]?.id;
  })).toBe("scale-1-1");
  const dropTarget = sidebar.locator('[data-workspace-item="scale-1-3"] [data-workspace-row-focus]');
  const dropBox = await dropTarget.boundingBox();
  await second.dragTo(dropTarget, { targetPosition: { x: 100, y: dropBox!.height - 1 } });
  await expect.poll(() => page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    return useAppStore.getState().recentRepositories.find((repository) => repository.repositoryPath === "/tmp/sidebar-scale-1")?.workspaces[3]?.id;
  })).toBe("scale-1-1");

  await sidebar.getByTestId("sidebar-view-work-queue").click();
  const queueRows = sidebar.locator("[data-workspace-row-focus]");
  await expect(queueRows.first()).toBeVisible();
  await expect.poll(() => queueRows.count()).toBeLessThan(150);
  console.log(`sidebar queue rows: ${await queueRows.count()}`);
  await queueRows.first().focus();
  await page.keyboard.press("End");
  await expect(queueRows.last()).toBeFocused();
  await expect(sidebar.locator('[aria-posinset="400"]')).toBeVisible();
  await page.keyboard.press("Home");
  await expect(sidebar.locator('[aria-posinset="1"] [data-workspace-row-focus]')).toBeFocused();
  await sidebar.getByTestId("collapse-project-list").click();
  await sidebar.locator('[data-workspace-row-focus]').first().focus();
  await page.keyboard.press("End");
  await expect(sidebar.getByTestId("collapsed-workspace-scale-0-199")).toBeFocused();
  await expect.poll(() => rows.count()).toBeLessThan(150);

});
