import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { seedFleetScale } from "./fleet-scale.fixture";

const baseline = process.env.FLEET_SCALE_BASELINE === "1";
const phase = baseline ? "before" : "after";
// Measurement files and screenshots are written only on request, never in the CI gate.
const artifacts = process.env.FLEET_SCALE_ARTIFACTS ? `${process.env.FLEET_SCALE_ARTIFACTS}/${phase}` : null;

// Budgets: about 3x the values measured on the PR's shared CI runners
// (docs/developer/fleet-scale.md), so a real regression fails while runner
// noise does not. Mounted rows are deterministic: the viewport plus overscan.
const BUDGET = { renderedRows: 66, treeCards: 25, firstRenderMs: 7_500, scrollFrameMs: 450 };

for (const [language, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
    test(`Fleet scale ${language} ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 1000 });
      await seedFleetScale(page);
      const client = await page.context().newCDPSession(page);
      await client.send("Performance.enable");
      const before = await client.send("Performance.getMetrics");
      const started = Date.now();
      await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
      await expect.poll(() => page.evaluate(async () => {
        const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
        return useFleetSelectionStore.getState().scopes.get("table")?.length ?? 0;
      })).toBe(2000);
      const firstRenderMs = Date.now() - started;
      await page.evaluate(async ({ language, theme }) => {
        const { i18n } = await import("/src/i18n/index.ts");
        const { useAppStore } = await import("/src/store/app.store.ts");
        await i18n.changeLanguage(language);
        useAppStore.getState().updateSettings({ patch: { themeMode: theme } });
        await document.fonts.ready;
      }, { language, theme });
      const rows = page.locator("[data-fleet-task-table-row]");
      await expect(rows.first()).toBeVisible();
      const renderedRows = await rows.count();
      if (!baseline) await expect(page.locator("[data-fleet-task-table] table")).toHaveAttribute("aria-rowcount", "2001");
      const after = await client.send("Performance.getMetrics");
      const metric = (metrics: { metrics: Array<{ name: string; value: number }> }, name: string) => metrics.metrics.find(metric => metric.name === name)?.value ?? 0;
      const frameMs = await page.evaluate(async () => {
        const row = document.querySelector("[data-fleet-task-table-row]");
        let scroll = row?.parentElement;
        while (scroll && (!/(auto|scroll)/.test(getComputedStyle(scroll).overflowY) || scroll.scrollHeight <= scroll.clientHeight)) scroll = scroll.parentElement;
        if (!scroll) throw new Error("Missing table scroll owner");
        const start = performance.now();
        scroll.scrollTop = scroll.scrollHeight / 2;
        if (scroll.scrollTop <= 0) throw new Error("Table scroll did not move");
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return performance.now() - start;
      });
      const measurements = {
        phase, language, theme, width, tasks: 2000, workspaces: 40, repositories: 8,
        renderedRows, firstRenderMs, scrollFrameMs: frameMs,
        scriptingMs: (metric(after, "ScriptDuration") - metric(before, "ScriptDuration")) * 1000,
        heapBytes: metric(after, "JSHeapUsedSize"),
      };
      console.log(JSON.stringify(measurements));
      if (artifacts) {
        await mkdir(artifacts, { recursive: true });
        await writeFile(`${artifacts}/${language}-${theme}-${width}.json`, JSON.stringify(measurements, null, 2));
        await page.screenshot({ path: `${artifacts}/${language}-${theme}-${width}.png`, fullPage: true, animations: "disabled" });
      }
      if (baseline) {
        if (process.env.FLEET_SCALE_ENFORCE_BOUNDS === "1") expect(renderedRows).toBeLessThan(BUDGET.renderedRows);
        return;
      }

      expect(renderedRows).toBeLessThan(BUDGET.renderedRows);
      expect(firstRenderMs).toBeLessThan(BUDGET.firstRenderMs);
      expect(frameMs).toBeLessThan(BUDGET.scrollFrameMs);
      await rows.first().getByRole("button").last().focus();
      await page.keyboard.press("Home");
      await expect.poll(() => page.evaluate(async () => {
        const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
        return document.activeElement?.closest("[data-fleet-select-key]")?.getAttribute("data-fleet-select-key") === useFleetSelectionStore.getState().scopes.get("table")?.[0]?.key;
      })).toBe(true);
      await page.keyboard.press("x");
      await page.keyboard.press("End");
      const lastTitle = await page.evaluate(async () => {
        const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
        const targets = useFleetSelectionStore.getState().scopes.get("table")!;
        return targets[targets.length - 1]!.task!.title;
      });
      const last = page.locator('[data-fleet-task-table-row]').filter({ has: page.getByText(lastTitle, { exact: true }) });
      await expect.poll(() => page.evaluate(async () => {
        const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
        const targets = useFleetSelectionStore.getState().scopes.get("table")!;
        return document.activeElement?.closest("[data-fleet-select-key]")?.getAttribute("data-fleet-select-key") === targets[targets.length - 1]?.key;
      })).toBe(true);
      await last.click({ modifiers: ["Shift"] });
      await expect.poll(() => page.evaluate(async () => {
        const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
        return useFleetSelectionStore.getState().selectedKeys.size;
      })).toBe(2000);
      await expect.poll(() => rows.count()).toBeLessThan(BUDGET.renderedRows);
      await client.detach();
    });
  }
}


test("Fleet tree keeps 2,000 logical tasks reachable with bounded cards", async ({ page }) => {
  test.skip(baseline, "Baseline capture measures the table; its DOM bound fails separately.");
  await seedFleetScale(page);
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  await page.getByRole("radiogroup", { name: "Board layout" }).getByRole("radio", { name: "Tree" }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    return useFleetSelectionStore.getState().scopes.get("tree")?.length ?? 0;
  })).toBe(2000);
  const cards = page.locator("[data-agent-fleet-card]");
  await expect(cards.first()).toBeVisible();
  const mountedCards = await cards.count();
  console.log(JSON.stringify({ mountedCards }));
  expect(mountedCards).toBeLessThan(BUDGET.treeCards);
  await cards.first().focus();
  await page.keyboard.press("End");
  await expect.poll(() => page.evaluate(async () => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    const targets = useFleetSelectionStore.getState().scopes.get("tree")!;
    return document.activeElement?.closest("[data-fleet-select-key]")?.getAttribute("data-fleet-select-key") === targets[targets.length - 1]?.key;
  })).toBe(true);
  await page.keyboard.press("Meta+a");
  await expect.poll(() => page.evaluate(async () => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    return useFleetSelectionStore.getState().selectedKeys.size;
  })).toBe(2000);
  expect(await cards.count()).toBeLessThan(BUDGET.treeCards);
});


test("grouped table keeps group controls sticky and exposes logical row counts", async ({ page }) => {
  test.skip(baseline, "Rendered regression for the virtual table.");
  await seedFleetScale(page);
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  await expect.poll(() => page.evaluate(async () => (await import("/src/store/fleet-selection-store.ts")).useFleetSelectionStore.getState().scopes.get("table")?.length)).toBe(2000);
  await page.getByRole("radiogroup", { name: "Group tasks" }).getByRole("radio", { name: "Repository", exact: true }).click();
  const table = page.locator("[data-fleet-task-table] table");
  await expect(table).toHaveAttribute("aria-rowcount", "2009");
  // The table frame is its own scroller.
  const scroller = page.locator("[data-fleet-task-table]");
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight / 2; });
  // The sticky group row of the first visible row carries the group's only control.
  const group = page.locator('[data-fleet-task-table-group] [role=checkbox][aria-label^="Repository 4 (300)"]');
  await expect(group).toHaveCount(1);
  await expect(group).toBeVisible();
  const bounds = await scroller.boundingBox();
  const header = await table.locator("thead").boundingBox();
  expect(Math.abs(header!.y - bounds!.y)).toBeLessThanOrEqual(2);
  expect(header!.y + header!.height).toBeLessThan(bounds!.y + bounds!.height);
  const groupBox = await group.boundingBox();
  expect(groupBox!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  expect(await page.locator("[data-fleet-task-table-row]").count()).toBeLessThan(BUDGET.renderedRows);
  await expect.poll(() => page.locator("[data-fleet-task-table-row]").first().getAttribute("aria-rowindex").then(Number)).toBeGreaterThan(900);
  await group.click();
  await expect.poll(() => page.evaluate(async () => (await import("/src/store/fleet-selection-store.ts")).useFleetSelectionStore.getState().selectedKeys.size)).toBe(300);
});
