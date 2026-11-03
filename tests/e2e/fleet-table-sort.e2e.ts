import { expect, test, type Page } from "@playwright/test";

/**
 * Mounts the real Fleet table view (the ADS table with sortable headers) on
 * an otherwise empty preview page, with rows already built, so the header
 * buttons can be measured and pressed without seeding a whole workspace.
 */
async function mountTable(page: Page, options: { locale: "en" | "ko"; mode: "light" | "dark"; density: "regular" | "compact" }) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?stavePreview=ads-regressions${options.mode === "dark" ? "&theme=dark" : ""}`);
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async ({ locale, mode, density }) => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { FleetTaskTableView } = await import("/src/components/layout/FleetTaskTable.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    const { applyAppLocale } = await import("/src/i18n/index.ts");
    const { applyThemeClass } = await import("/src/lib/themes/apply.ts");
    applyAppLocale(locale);
    applyThemeClass({ enabled: mode === "dark" });
    document.documentElement.dataset.uiDensity = density;
    const now = Date.parse("2026-10-22T02:00:00.000Z");
    const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
    const row = (id: string, title: string, waited: number | null, status: string) => ({
      key: id, repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: `ws-${id}`, workspaceName: `ws-${id}`,
      workspaceBranch: null, workspaceActivity: "idle",
      task: { id, title, provider: "codex", updatedAt: ago(5), unread: false, archivedAt: null },
      status, need: waited === null ? null : { kind: "approval", id: `need-${id}` }, waitingSince: waited === null ? null : ago(waited),
      activeTurnId: null, rank: 0,
    });
    const rows = [
      row("b", "Sort the Fleet table", 13, "waiting-approval"),
      row("a", "Tighten settings sidebar spacing", 37, "waiting-approval"),
      row("c", "Shared combobox", 25, "waiting-approval"),
      row("d", "Fix the login redirect", null, "running"),
    ];
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div");
    host.id = "table-host";
    host.style.cssText = "padding:24px;width:1100px";
    document.body.append(host);
    createRoot(host).render(React.createElement(StaveDesignProvider, null,
      React.createElement(FleetTaskTableView, { rows, nowMs: now, onOpenTask: () => {} })));
    await document.fonts.ready;
  }, options);
  await expect(page.locator("[data-fleet-task-table-row]")).toHaveCount(4);
}

const titles = (page: Page) => page.locator("[data-fleet-task-table-row] button").allInnerTexts();

for (const locale of ["en", "ko"] as const) {
  for (const mode of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`sortable headers keep label and arrow on one centre line: ${locale}/${mode}/${density}`, async ({ page }) => {
        await mountTable(page, { locale, mode, density });
        const heads = page.locator("th[data-fleet-task-column]");
        await expect(heads).toHaveCount(6);
        for (const index of [0, 1, 2, 3, 4, 5]) {
          const head = heads.nth(index);
          await expect(head).toHaveAttribute("aria-sort", "none");
          const geometry = await head.evaluate((cell) => {
            const button = cell.querySelector("button")!;
            const label = button.querySelector("span")!.getBoundingClientRect();
            const icon = button.querySelector("svg")!.getBoundingClientRect();
            const box = cell.getBoundingClientRect();
            const style = getComputedStyle(cell);
            return {
              labelCentre: label.top + label.height / 2,
              iconCentre: icon.top + icon.height / 2,
              labelHeight: label.height,
              lineHeight: Number.parseFloat(getComputedStyle(button).lineHeight) || label.height,
              iconRight: icon.right,
              cellRight: box.right - Number.parseFloat(style.paddingRight),
              gap: icon.left - label.right,
            };
          });
          // The arrow is centred on the label's line, follows it with a token gap, and never wraps under it.
          expect(Math.abs(geometry.labelCentre - geometry.iconCentre)).toBeLessThanOrEqual(1);
          expect(geometry.labelHeight).toBeLessThan(geometry.lineHeight * 1.6);
          expect(geometry.gap).toBeGreaterThanOrEqual(3);
          expect(geometry.iconRight).toBeLessThanOrEqual(geometry.cellRight + 1);
        }
      });
    }
  }
}

test("a header cycles ascending, descending and the table's own order, and states aria-sort", async ({ page }) => {
  await mountTable(page, { locale: "en", mode: "light", density: "regular" });
  const own = await titles(page);
  const waiting = page.locator('th[data-fleet-task-column="waiting"]');
  const button = waiting.getByRole("button", { name: "Waiting" });
  await button.click();
  await expect(waiting).toHaveAttribute("aria-sort", "ascending");
  expect(await titles(page)).toEqual(["Sort the Fleet table", "Shared combobox", "Tighten settings sidebar spacing", "Fix the login redirect"]);
  await button.click();
  await expect(waiting).toHaveAttribute("aria-sort", "descending");
  expect(await titles(page)).toEqual(["Tighten settings sidebar spacing", "Shared combobox", "Sort the Fleet table", "Fix the login redirect"]);
  // Only the sorted column claims an order.
  await expect(page.locator('th[aria-sort="none"]')).toHaveCount(5);
  await button.press("Enter");
  await expect(waiting).toHaveAttribute("aria-sort", "none");
  expect(await titles(page)).toEqual(own);
  await expect(button).toBeFocused();
});
