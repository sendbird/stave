import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { seedFleetScale } from "./fleet-scale.fixture";

test("large card grid retains offscreen selection and expanded task disclosure stays bounded", async ({ page }) => {
  test.setTimeout(120_000);
  await seedFleetScale(page);
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const fixture = JSON.parse(localStorage.getItem("stave:scale-fixture")!);
    const workspaces = fixture.recentRepositories.flatMap((repository: { workspaces: unknown[] }) => repository.workspaces);
    const snapshot = JSON.parse(localStorage.getItem("stave:workspace-fallback:v1")!);
    const tasks = [...snapshot[0].snapshot.tasks, ...snapshot[1].snapshot.tasks];
    useAppStore.setState({
      workspaces, recentRepositories: [{ ...fixture.recentRepositories[0], workspaces }],
      workspacePathById: Object.fromEntries(workspaces.map((workspace: { id: string }, index: number) => [workspace.id, index === 0 ? fixture.repositoryPath : `${fixture.repositoryPath}/workspace-${index}`])),
      workspaceRuntimeCacheById: {},
      tasks, openTaskTabIds: tasks.map((task: { id: string }) => task.id),
    });
    useAppStore.getState().updateSettings({ patch: { fleetBoardLayout: "cards" } });
  });
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  await page.getByRole("radiogroup", { name: "Board filter" }).getByRole("radio", { name: "All", exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    return useFleetSelectionStore.getState().visibleTargets.length;
  })).toBe(120);
  const cards = page.locator("[data-fleet-workspace-card]");
  await expect(cards.first()).toBeVisible();
  await mkdir("/tmp/gap-h4", { recursive: true });
  for (const [language, theme] of [["en", "light"], ["ko", "dark"]] as const) {
    await page.evaluate(async ({ language, theme }) => {
      const { i18n } = await import("/src/i18n/index.ts");
      const { useAppStore } = await import("/src/store/app.store.ts");
      await i18n.changeLanguage(language);
      useAppStore.getState().updateSettings({ patch: { themeMode: theme } });
      await document.fonts.ready;
    }, { language, theme });
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(cards.first()).toBeVisible();
      await page.screenshot({ path: `/tmp/gap-h4/cards-after-${language}-${theme}-${width}.png`, animations: "disabled" });
    }
  }
  await page.evaluate(async () => {
    const { i18n } = await import("/src/i18n/index.ts");
    await i18n.changeLanguage("en");
  });
  console.log(JSON.stringify({ renderedCards: await cards.count() }));
  expect(await cards.count()).toBeLessThan(20);
  await page.evaluate(async () => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    useFleetSelectionStore.getState().selectAll();
  });
  await expect.poll(() => page.evaluate(async () => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    return useFleetSelectionStore.getState().selectedKeys.size;
  })).toBe(120);
  const first = cards.filter({ hasText: "Workspace 0" }).first();
  await first.getByRole("button", { name: /more tasks/ }).click();
  await expect.poll(() => first.locator("[data-fleet-task-row]").count()).toBeLessThan(30);
  await first.locator("[data-fleet-task-row]").first().focus();
  await page.keyboard.press("End");
  await expect(first.locator("[data-fleet-task-row]").filter({ hasText: "Scale task 0099" })).toBeFocused();
  await expect.poll(() => first.locator("[data-fleet-task-row]").count()).toBeLessThan(30);
  console.log(JSON.stringify({ expandedTaskRows: await first.locator("[data-fleet-task-row]").count() }));
});
