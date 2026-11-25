import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * A GlobalPageHeader inside a centered page column (`placement="column"`)
 * adds no inline inset of its own: the title, the body and the actions share
 * the column's content edges. Before, the header's own surface inset stacked
 * on the column's, so the title sat 20px right of the body.
 */
const SURFACES = [
  {
    id: "activity",
    // The summary line is an h2 announced as a status, so it is found by text.
    body: (page: Page, lang: string) => page.locator("main h2").filter({ hasText: lang === "ko" ? /실행 중/ : /agents running/ }),
    close: (lang: string) => (lang === "ko" ? "활동 닫기" : "Close Activity"),
  },
  {
    id: "usage",
    body: (page: Page, lang: string) => page.getByRole("tablist", { name: lang === "ko" ? "사용량 보기" : "Usage views" }),
    close: (lang: string) => (lang === "ko" ? "사용량 닫기" : "Close usage"),
  },
] as const;

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

for (const surface of SURFACES) for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) {
  test(`${surface.id} header shares the page column edges: ${lang}/${theme}`, async ({ page }) => {
    for (const width of [700, 1400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?stavePreview=${surface.id}&theme=${theme}&lang=${lang}`);
      const main = page.locator("main[aria-label]");
      const title = main.getByRole("heading", { level: 1 });
      const body = surface.body(page, lang);
      await expect(title).toBeVisible();
      await expect(body).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      const header = main.locator('[data-placement="column"]');
      await expect(header).toHaveCount(1);
      const column = await main.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return { left: rect.left + parseFloat(style.paddingLeft), right: rect.right - parseFloat(style.paddingRight) };
      });
      const [titleBox, bodyBox, headerBox] = await Promise.all([box(title), box(body), box(header)]);
      // Title and body start on the column's content edge; the divider spans the column.
      expect(Math.abs(titleBox.x - bodyBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(titleBox.x - column.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(headerBox.x - column.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(headerBox.x + headerBox.width - column.right)).toBeLessThanOrEqual(1);
      // The last action ends on the column's content edge too.
      const closeBox = await box(header.getByRole("button", { name: surface.close(lang), exact: true }));
      expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(column.right + 1);
      expect(closeBox.x).toBeGreaterThanOrEqual(column.left - 1);
    }
  });
}
