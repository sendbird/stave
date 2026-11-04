import { expect, test } from "@playwright/test";
for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) for (const density of ["regular", "compact"]) {
  test(`global header contains copy and actions: ${lang}/${theme}/${density}`, async ({ page }) => {
    await page.goto(`/tests/e2e/fixtures/global-page-header.html?lang=${lang}&theme=${theme}&density=${density}`);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 700 });
      const heading = page.getByRole("heading", { level: 1 });
      const close = page.getByRole("button", { name: lang === "ko" ? "닫기" : "Close", exact: true });
      await expect(heading).toBeVisible(); await expect(close).toBeVisible();
      const boxes = await Promise.all([heading.boundingBox(), close.boundingBox()]);
      for (const box of boxes) { expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width); }
      await close.focus(); await expect(close).toBeFocused();
    }
  });
}
