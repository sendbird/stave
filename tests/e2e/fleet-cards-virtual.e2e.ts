import { expect, test, type Page } from "@playwright/test";
import { focusedFleetKey, nextFrames, seedFleetScale } from "./fleet-scale.fixture";

test.describe.configure({ timeout: 120_000 });

/** One repository of 40 workspace cards; the first card holds 100 tasks, the second none. */
async function openLargeCardGrid(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedFleetScale(page);
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    const fixture = useAppStore.getState();
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
  await expect(page.locator("[data-fleet-workspace-card]").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test("card grid rows share one height and scroll with the board", async ({ page }) => {
  await openLargeCardGrid(page);
  const rows = await page.evaluate(() => {
    const byTop = new Map<number, number[]>();
    for (const card of document.querySelectorAll<HTMLElement>("[data-fleet-workspace-card]")) {
      const box = card.getBoundingClientRect();
      const top = Math.round(box.top);
      byTop.set(top, [...(byTop.get(top) ?? []), box.height]);
    }
    return [...byTop.values()].filter((heights) => heights.length > 1);
  });
  expect(rows.length).toBeGreaterThan(0);
  expect(new Set(rows[0]!.map(Math.round)).size).toBeGreaterThan(0);
  for (const heights of rows) expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  const owner = await page.evaluate(() => {
    let element = document.querySelector("[data-fleet-workspace-card]")?.parentElement ?? null;
    while (element && !/(auto|scroll)/.test(getComputedStyle(element).overflowY)) element = element.parentElement;
    return element?.hasAttribute("data-fleet-board-scroll") ?? false;
  });
  expect(owner).toBe(true);
});

test("Shift+ArrowDown moves focus into a card that was not yet rendered", async ({ page }) => {
  await openLargeCardGrid(page);
  const step = await page.evaluate(async () => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    const targets = useFleetSelectionStore.getState().visibleTargets;
    const mounted = (key: string) => [...document.querySelectorAll<HTMLElement>("[data-fleet-select-key]")].some((row) => row.dataset.fleetSelectKey === key);
    const index = targets.findIndex((target, position) => mounted(target.key) && targets[position + 1] && !mounted(targets[position + 1]!.key));
    return index < 0 ? null : { from: targets[index]!.key, to: targets[index + 1]!.key };
  });
  expect(step).not.toBeNull();
  await page.evaluate((key) => {
    const row = [...document.querySelectorAll<HTMLElement>("[data-fleet-select-key]")].find((element) => element.dataset.fleetSelectKey === key)!;
    row.scrollIntoView({ block: "end" });
    row.querySelector<HTMLElement>("[data-fleet-task-row]")!.focus();
  }, step!.from);
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => focusedFleetKey(page)).toBe(step!.to);
});

async function expandFirstCard(page: Page) {
  const first = page.locator('[data-fleet-workspace-card*="scale-workspace-0"]').first();
  await first.getByRole("button", { name: /more tasks/ }).click();
  await expect(first.locator("[data-fleet-task-row]").first()).toBeVisible();
  return first;
}

test("a long in-card task list counts its Show fewer item in the set size", async ({ page }) => {
  await openLargeCardGrid(page);
  const first = await expandFirstCard(page);
  const items = first.locator("[role=listitem]");
  await expect(items.first()).toHaveAttribute("aria-setsize", "101");
  const showFewer = first.locator("[role=listitem]").filter({ has: page.getByRole("button", { name: /Show fewer/ }) });
  await expect(showFewer).toHaveAttribute("aria-setsize", "101");
  await expect(showFewer).toHaveAttribute("aria-posinset", "101");
});

test("a long in-card task list moves at its ends without re-centering", async ({ page }) => {
  await openLargeCardGrid(page);
  const first = await expandFirstCard(page);
  const taskRows = first.locator("[data-fleet-task-row]");
  await taskRows.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(taskRows.filter({ hasText: "Scale task 0001" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(taskRows.filter({ hasText: "Scale task 0099" })).toBeFocused();
  await nextFrames(page, 4);
  const scrollTopOf = () => page.evaluate(() => {
    let element = document.activeElement?.parentElement ?? null;
    while (element && !/(auto|scroll)/.test(getComputedStyle(element).overflowY)) element = element.parentElement;
    return element!.scrollTop;
  });
  const atEnd = await scrollTopOf();
  await page.keyboard.press("ArrowUp");
  await expect(taskRows.filter({ hasText: "Scale task 0098" })).toBeFocused();
  await nextFrames(page, 4);
  expect(Math.abs(await scrollTopOf() - atEnd)).toBeLessThanOrEqual(1);
});

test("a focused card task stays mounted when the board scrolls away", async ({ page }) => {
  await openLargeCardGrid(page);
  const row = page.locator("[data-fleet-task-row]").first();
  const key = await row.evaluate((element) => element.closest<HTMLElement>("[data-fleet-select-key]")!.dataset.fleetSelectKey!);
  await row.focus();
  await row.evaluate((element) => {
    let owner = element.closest("[data-fleet-workspace-card]")?.parentElement ?? null;
    while (owner && !(/(auto|scroll)/.test(getComputedStyle(owner).overflowY) && owner.scrollHeight > owner.clientHeight)) owner = owner.parentElement;
    owner!.scrollTop = owner!.scrollHeight;
  });
  await nextFrames(page, 6);
  expect(await focusedFleetKey(page)).toBe(key);
});
