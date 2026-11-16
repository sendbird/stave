import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function seed(page: Page, attention = false) {
  await page.addInitScript((attention) => {
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
    if (attention) localStorage.setItem("stave:notifications-fallback:v1", JSON.stringify([{
      id: "attention-retained", kind: "task.approval_requested", title: "Approve task", body: "Allow the command.",
      repositoryPath, repositoryName: "Fleet selection", workspaceId: workspace.id, workspaceName: workspace.name,
      taskId: tasks[0]!.id, taskTitle: tasks[0]!.title, turnId: "ended-turn", providerId: "codex",
      action: { type: "approval", requestId: "retained-request", messageId: "retained-message" },
      payload: {}, createdAt: updatedAt, readAt: null, resolvedAt: null, expiresAt: null,
    }]));
    (window as unknown as { api: unknown }).api = { provider: { streamTurn: async () => [] }, terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) }, sourceControl: { getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }), getHistory: async () => ({ ok: true, items: [], stderr: "" }) } };
  }, attention);
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
  const repositoryGroup = page.getByRole("checkbox", { name: "Fleet selection (3)" });
  await repositoryGroup.click(); await check(3);
  const groupBox = await repositoryGroup.boundingBox();
  expect(groupBox!.height).toBeGreaterThanOrEqual(24);
  expect(groupBox!.width).toBeGreaterThanOrEqual(24);
  await repositoryGroup.click(); await check(0);
  await page.locator("[data-fleet-task-row]").first().focus();
  await page.keyboard.press("x"); await check(1);
});

for (const [language, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
    test(`Fleet selection geometry ${language} ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await seed(page, true);
      await page.evaluate(async ({ language, theme }) => {
        const { i18n } = await import("/src/i18n/index.ts");
        const { useAppStore } = await import("/src/store/app.store.ts");
        await i18n.changeLanguage(language);
        useAppStore.getState().updateSettings({ patch: { themeMode: theme } });
      }, { language, theme });
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*\bdark\b).*$/);
      expect(await page.evaluate(async () => (await import("/src/store/fleet-selection-store.ts")).useFleetSelectionStore.getState().scopes.get("attention")?.[0]?.activeTurnId)).toBeNull();
      await mkdir("/tmp/fleet-bulk/after2", { recursive: true });
      for (const selected of [0, 1, 8]) {
        await page.evaluate(async (count) => {
          const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
          const state = useFleetSelectionStore.getState(); state.clear();
          for (const target of state.visibleTargets.slice(0, count)) state.toggle(target.key);
        }, selected);
        await expect(page.locator("[data-fleet-task-table] thead").getByRole("checkbox")).toHaveAttribute("aria-checked", selected === 0 ? "false" : selected === 8 ? "true" : "mixed");
        const row = page.locator("[data-fleet-task-table-row]").first();
        await row.hover();
        const checkbox = row.getByRole("checkbox");
        const box = await checkbox.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(24); expect(box!.height).toBeGreaterThanOrEqual(24);
        const attentionBox = await page.locator("[data-fleet-inbox-band]").getByRole("checkbox", { name: language === "en" ? "Select Task 0" : "Task 0 선택" }).boundingBox();
        expect(attentionBox).not.toBeNull();
        expect(Math.abs(box!.x - attentionBox!.x)).toBeLessThanOrEqual(0.5);
        console.log(JSON.stringify({ language, theme, width, selected, tableCheckboxX: box!.x, attentionCheckboxX: attentionBox!.x }));
        const open = row.getByRole("button").last();
        const titleBox = await open.boundingBox();
        expect(Math.abs((box!.y + box!.height / 2) - (titleBox!.y + titleBox!.height / 2))).toBeLessThanOrEqual(2);
        await page.screenshot({ path: `/tmp/fleet-bulk/after2/${language}-${theme}-${width}-${selected}.png`, fullPage: true, animations: "disabled" });
      }
    });
  }
}

test("collapsed repository rows are excluded from select-all and group selection", async ({ page }) => {
  await seed(page);
  await page.getByRole("radiogroup", { name: "Board layout" }).getByRole("radio", { name: "Cards" }).click();
  await expect(page.locator("[data-fleet-task-row]:visible")).toHaveCount(3);
  await page.getByRole("button", { name: "Collapse Fleet selection" }).click();
  await expect(page.locator("[data-fleet-task-row]:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Fleet selection" }).focus();
  await page.keyboard.press("Meta+a");
  expect(await page.evaluate(async () => (await import("/src/store/fleet-selection-store.ts")).useFleetSelectionStore.getState().selectedKeys.size)).toBe(0);
  await expect(page.getByRole("checkbox", { name: "Fleet selection (0)" })).toBeDisabled();
});

test("selection shortcuts leave an open confirmation dialog in control", async ({ page }) => {
  await seed(page);
  await page.locator("[data-fleet-task-table-row]").first().getByRole("checkbox").click();
  await page.getByRole("button", { name: "Archive (1)" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Meta+a");
  expect(await page.evaluate(async () => (await import("/src/store/fleet-selection-store.ts")).useFleetSelectionStore.getState().selectedKeys.size)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(async () => (await import("/src/store/fleet-selection-store.ts")).useFleetSelectionStore.getState().selectedKeys.size)).toBe(1);
});

test("tree arrows cross status group boundaries", async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState({ activeTurnIdsByTask: { "bulk-0": "turn-live" } });
  });
  await page.getByRole("radiogroup", { name: "Board layout" }).getByRole("radio", { name: "Tree" }).click();
  await page.getByRole("radiogroup", { name: "Group tasks" }).getByRole("radio", { name: "Status" }).click();
  const cards = page.locator("[data-agent-fleet-card]");
  await expect(cards).toHaveCount(8);
  await cards.first().focus();
  await page.keyboard.press("ArrowUp");
  await expect(cards.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(cards.first()).toBeFocused();
});
