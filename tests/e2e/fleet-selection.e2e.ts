import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function seed(page: Page) {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/fleet-selection";
    const updatedAt = new Date().toISOString();
    const tasks = Array.from({ length: 8 }, (_, index) => ({ id: `bulk-${index}`, title: `Task ${index}`, provider: "codex", updatedAt, unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave" }));
    const workspace = { id: "bulk-workspace", name: "bulk-workspace", updatedAt };
    const snapshot = { activeTaskId: tasks[0]!.id, tasks, messagesByTask: {}, openTaskTabIds: tasks.map((task) => task.id) };
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{ ...workspace, snapshot }]));
    localStorage.setItem("stave-store", JSON.stringify({ state: {
      ...snapshot, repositoryPath, repositoryName: "Fleet selection", workspaces: [workspace], activeWorkspaceId: workspace.id,
      workspacePathById: { [workspace.id]: repositoryPath }, workspaceDefaultById: { [workspace.id]: true }, settings: { fleetBoardLayout: "table" },
    }, version: 0 }));
    (window as unknown as { api: unknown }).api = { provider: { streamTurn: async () => [] }, terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) }, sourceControl: { getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }), getHistory: async () => ({ ok: true, items: [], stderr: "" }) } };
  });
  await page.goto("/");
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  await page.getByRole("radiogroup", { name: "Board layout" }).getByRole("radio", { name: "Table" }).click();
  await expect(page.locator("[data-fleet-task-table-row]")).toHaveCount(8);
  await page.evaluate(async () => { await document.fonts.ready; });
}

test("Fleet selection follows keyboard, mouse, filters, sorting and layout changes", async ({ page }) => {
  await seed(page);
  const rows = page.locator("[data-fleet-task-table-row]");
  const check = async (count: number) => expect.poll(() => page.evaluate(async () => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    return useFleetSelectionStore.getState().selectedKeys.size;
  })).toBe(count);
  await rows.first().getByRole("button").last().focus();
  await page.keyboard.press("x"); await check(1);
  await page.keyboard.press("Shift+ArrowDown"); await check(2);
  await rows.nth(3).click({ modifiers: ["Meta"] }); await check(3);
  await rows.nth(5).click({ modifiers: ["Shift"] }); await check(5);
  await page.keyboard.press("Meta+a"); await check(8);
  await page.keyboard.press("Escape"); await check(0);
  await rows.first().hover();
  await rows.first().getByRole("checkbox").click(); await check(1);
  await page.locator('[data-fleet-task-column="task"]').click(); await check(1);
  const search = page.getByRole("textbox", { name: "Find tasks" });
  await search.fill("Task 0"); await expect(rows).toHaveCount(1); await check(1);
  await search.fill("Task 1"); await expect(rows).toHaveCount(1); await check(0);
  await search.fill(""); await expect(rows).toHaveCount(8);
  await rows.first().hover(); await rows.first().getByRole("checkbox").click(); await check(1);
  await page.getByRole("radiogroup", { name: "Board layout" }).getByRole("radio", { name: "Tree" }).click();
  await expect(page.locator("[data-agent-fleet-card]")).toHaveCount(8); await check(1);
  const card = page.locator("[data-agent-fleet-card]").first();
  await card.focus(); await page.keyboard.press("Meta+a"); await check(8);
  await page.keyboard.press("Escape"); await check(0);
  await page.getByRole("radiogroup", { name: "Group tasks" }).getByRole("radio", { name: "Repository" }).click();
  await page.getByRole("checkbox", { name: "Fleet selection (8)" }).click(); await check(8);
  await page.getByRole("radiogroup", { name: "Board layout" }).getByRole("radio", { name: "Cards" }).click();
  await expect(page.locator("[data-fleet-task-row]")).not.toHaveCount(0);
  await page.locator("[data-fleet-task-row]").first().focus();
  await page.keyboard.press("Escape"); await check(0);
  await page.keyboard.press("x"); await check(1);
});

for (const [language, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
    test(`Fleet selection geometry ${language} ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await seed(page);
      await page.evaluate(async ({ language, theme }) => {
        const { i18n } = await import("/src/i18n/index.ts");
        const { useAppStore } = await import("/src/store/app.store.ts");
        await i18n.changeLanguage(language);
        useAppStore.getState().updateSettings({ patch: { theme } });
      }, { language, theme });
      await mkdir("/tmp/fleet-bulk/after", { recursive: true });
      for (const selected of [0, 1, 8]) {
        await page.evaluate(async (count) => {
          const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
          const state = useFleetSelectionStore.getState(); state.clear();
          for (const target of state.visibleTargets.slice(0, count)) state.toggle(target.key);
        }, selected);
        const row = page.locator("[data-fleet-task-table-row]").first();
        await row.hover();
        const checkbox = row.getByRole("checkbox");
        const box = await checkbox.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(24); expect(box!.height).toBeGreaterThanOrEqual(24);
        const open = row.getByRole("button").last();
        const titleBox = await open.boundingBox();
        expect(Math.abs((box!.y + box!.height / 2) - (titleBox!.y + titleBox!.height / 2))).toBeLessThanOrEqual(2);
        await page.screenshot({ path: `/tmp/fleet-bulk/after/${language}-${theme}-${width}-${selected}.png`, fullPage: true, animations: "disabled" });
      }
    });
  }
}
