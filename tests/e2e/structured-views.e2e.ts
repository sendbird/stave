import { expect, test, type Page } from "@playwright/test";

/** The dev preview: one finished reply with every structured view type. */
async function openPreview(page: Page, theme: "light" | "dark") {
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?stavePreview=structured-views&theme=${theme}`);
  await expect(page.locator('[data-structured-view="table"] tbody tr').first()).toBeVisible();
}

const cellTexts = (page: Page, column: number) =>
  page
    .locator('[data-structured-view="table"] tbody tr')
    .evaluateAll((rows, index) => rows.map((row) => row.children[index]?.textContent?.trim() ?? ""), column);

for (const theme of ["light", "dark"] as const) {
  test(`draws every view type from tool results and fences (${theme})`, async ({ page }) => {
    await openPreview(page, theme);
    for (const type of ["table", "chart", "timeline", "heatmap"]) {
      await expect(page.locator(`[data-structured-view="${type}"]`)).toHaveCount(1);
    }
    // One stats view from the tool, one from the fence.
    await expect(page.locator('[data-structured-view="stats"]')).toHaveCount(2);
    // The chart is drawn as SVG, not left as a placeholder.
    await expect(page.locator('[data-structured-view="chart"] svg').first()).toBeVisible();
    await expect(page.locator("[data-structured-view-placeholder]")).toHaveCount(0);
    // The invalid fence keeps its source and says why.
    await expect(page.locator("[data-structured-view-error]")).toContainText("Unknown view type");

    // Each view stays inside the reply column.
    const column = await page.locator("[data-preview-reply]").boundingBox();
    for (const view of await page.locator("[data-structured-view]").all()) {
      const box = await view.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(column!.x - 0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(column!.x + column!.width + 0.5);
    }
    await test.info().attach(`structured-views-${theme}`, {
      body: await page.locator("[data-preview-reply]").screenshot(),
      contentType: "image/png",
    });
  });
}

test("the table view sorts, searches and pages its inline rows", async ({ page }) => {
  await openPreview(page, "light");
  const table = page.locator('[data-structured-view="table"]');
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(table).toContainText("Page 1 of 4");

  // The view's own sort: duration, longest first.
  const durations = await cellTexts(page, 3);
  expect(durations[0]).toBe("3.1m");

  await table.getByRole("button", { name: "Tests" }).click();
  const ascending = (await cellTexts(page, 1)).map((text) => Number(text.replaceAll(",", "")));
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

  await table.getByRole("searchbox").fill("renderer");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  for (const suite of await cellTexts(page, 0)) expect(suite).toContain("renderer");
  await expect(table).toContainText("4 of 32 rows");

  await table.getByRole("searchbox").fill("");
  await table.getByRole("button", { name: "Next" }).click();
  await expect(table).toContainText("Page 2 of 4");
});
