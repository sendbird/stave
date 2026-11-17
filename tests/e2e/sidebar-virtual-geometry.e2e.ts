import { expect, test, type Page } from "@playwright/test";
import { nextFrames } from "./fleet-scale.fixture";

/** Seeds `repositories` repositories of `count` workspaces each and opens the app. */
async function seedSidebar(page: Page, repositories: number, count: number) {
  await page.addInitScript(({ repositories, count }) => {
    const makeRepository = (repository: number) => {
      const repositoryPath = `/tmp/sidebar-scale-${repository}`;
      const workspaces = Array.from({ length: count }, (_, index) => ({
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
    const all = Array.from({ length: repositories }, (_, index) => makeRepository(index));
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify(all.flatMap((repository) => repository.workspaces.map((workspace) => ({ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {}, openTaskTabIds: [] } })))));
    (window as unknown as { api: unknown }).api = { provider: { streamTurn: async () => [] }, terminal: { runCommand: async () => ({ ok: false, code: 1, stdout: "", stderr: "" }) }, sourceControl: { getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }), getHistory: async () => ({ ok: true, items: [], stderr: "" }) } };
    localStorage.setItem("stave-store", JSON.stringify({ state: {
      ...all[0], recentRepositories: all.slice(1),
      tasks: [], messagesByTask: {}, activeTaskId: "",
    }, version: 0 }));
    // Records whether a workspace list was ever committed without its rows.
    const flags = { emptyList: false };
    (window as unknown as { __sidebarFlags: typeof flags }).__sidebarFlags = flags;
    // Checked before each paint, so a frame painted without rows is caught.
    const started = performance.now();
    const check = () => {
      for (const list of document.querySelectorAll("[data-sidebar-virtual-list]")) {
        if (!list.querySelector("[data-workspace-row-focus]")) flags.emptyList = true;
      }
      if (performance.now() - started < 15_000) requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }, { repositories, count });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const sidebar = page.getByTestId("project-workspace-sidebar");
  await expect(sidebar.locator("[data-workspace-row-focus]").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return sidebar;
}

/** Gaps between consecutive collapsed workspace buttons of one repository, and the end padding at the bottom. */
async function collapsedGeometry(page: Page) {
  const sidebar = page.getByTestId("project-workspace-sidebar");
  await sidebar.getByTestId("collapse-project-list").click();
  await expect(sidebar.locator('[data-testid^="collapsed-workspace-"]').first()).toBeVisible();
  await nextFrames(page, 4);
  const gap = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLElement>('[data-testid^="collapsed-workspace-"]')]
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const repository = (button: HTMLElement) => button.dataset.testid!.split("-").slice(0, -1).join("-");
    return buttons.slice(1)
      .map((button, index) => ({ same: repository(button) === repository(buttons[index]!), gap: button.getBoundingClientRect().top - buttons[index]!.getBoundingClientRect().bottom }))
      .filter((pair) => pair.same).slice(0, 2).map((pair) => pair.gap);
  });
  const scroller = sidebar.locator('[data-testid^="collapsed-workspace-"]').first().locator("xpath=ancestor::*[@data-sidebar-scroll]");
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await nextFrames(page, 6);
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await nextFrames(page, 6);
  const bottom = await scroller.evaluate((element) => {
    const buttons = [...element.querySelectorAll<HTMLElement>('[data-testid^="collapsed-workspace-"]')];
    const last = buttons.reduce((lowest, button) => (button.getBoundingClientRect().bottom > lowest.getBoundingClientRect().bottom ? button : lowest));
    return element.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
  });
  return { gap, bottom };
}

test("a typical sidebar commits its rows at once and keeps its collapsed spacing", async ({ page }) => {
  const sidebar = await seedSidebar(page, 1, 5);
  expect(await sidebar.locator("[data-workspace-row-focus]").count()).toBe(5);
  await sidebar.getByTestId("sidebar-view-work-queue").click();
  await expect(sidebar.locator("[data-workspace-row-focus]").first()).toBeVisible();
  await sidebar.getByTestId("sidebar-view-projects").click();
  await expect(sidebar.locator("[data-workspace-row-focus]").first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __sidebarFlags: { emptyList: boolean } }).__sidebarFlags.emptyList)).toBe(false);
  const geometry = await collapsedGeometry(page);
  expect(geometry.gap).toEqual([8, 8]);
  expect(geometry.bottom).toBeCloseTo(8, 0);
});

test("a long collapsed sidebar keeps the 0.5rem gap and its bottom padding", async ({ page }) => {
  await seedSidebar(page, 2, 200);
  const geometry = await collapsedGeometry(page);
  expect(geometry.gap).toEqual([8, 8]);
  expect(geometry.bottom).toBeCloseTo(8, 0);
});

test("a long sidebar keeps its scroll height steady while rows are measured", async ({ page }) => {
  const sidebar = await seedSidebar(page, 2, 200);
  const scroller = sidebar.locator("[data-workspace-row-focus]").first().locator("xpath=ancestor::*[@data-sidebar-scroll]");
  await nextFrames(page, 4);
  const initial = await scroller.evaluate((element) => element.scrollHeight);
  for (let step = 1; step <= 12; step += 1) {
    await scroller.evaluate((element, step) => { element.scrollTop = (element.scrollHeight * step) / 12; }, step);
    await nextFrames(page, 3);
  }
  await scroller.evaluate((element) => { element.scrollTop = 0; });
  await nextFrames(page, 4);
  const settled = await scroller.evaluate((element) => element.scrollHeight);
  expect(Math.abs(settled - initial)).toBeLessThanOrEqual(40);
});

test("a focused sidebar row stays mounted and moves without re-centering", async ({ page }) => {
  const sidebar = await seedSidebar(page, 2, 200);
  const focusedItem = () => page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-workspace-item]")?.dataset.workspaceItem ?? document.activeElement?.tagName);
  const scroller = sidebar.locator("[data-workspace-row-focus]").first().locator("xpath=ancestor::*[@data-sidebar-scroll]");
  await sidebar.locator('[data-workspace-item="scale-0-1"] [data-workspace-row-focus]').focus();
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await nextFrames(page, 6);
  expect(await focusedItem()).toBe("scale-0-1");

  await scroller.evaluate((element) => { element.scrollTop = 1500; });
  await nextFrames(page, 6);
  const start = await scroller.evaluate((element) => {
    const area = element.getBoundingClientRect();
    const row = [...element.querySelectorAll<HTMLElement>("[data-workspace-item^='scale-0-'] [data-workspace-row-focus]")]
      .find((candidate) => candidate.getBoundingClientRect().top >= area.top + 40)!;
    row.focus({ preventScroll: true });
    return { item: row.closest<HTMLElement>("[data-workspace-item]")!.dataset.workspaceItem!, scrollTop: element.scrollTop };
  });
  await page.keyboard.press("ArrowDown");
  const next = `scale-0-${Number(start.item.split("-").pop()) + 1}`;
  await expect.poll(focusedItem).toBe(next);
  await nextFrames(page, 4);
  expect(Math.abs(await scroller.evaluate((element) => element.scrollTop) - start.scrollTop)).toBeLessThanOrEqual(1);
});
