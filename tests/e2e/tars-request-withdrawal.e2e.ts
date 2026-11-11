import { expect, test } from "@playwright/test";

for (const [theme, lang, density] of [["light", "en", "regular"], ["dark", "ko", "compact"]] as const) {
  for (const width of [390, 1440]) {
    test(`request withdrawal remains contained and survives reload at ${width}px (${theme} ${lang} ${density})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?stavePreview=tars&withdrawal=true&theme=${theme}&lang=${lang}&density=${density}`);
      const record = page.getByTestId("tars-transcript").locator('[data-tars-action-record][data-tars-record-kind="control"]').filter({ has: page.locator('[data-tars-delivery="queued"]') }).last();
      const button = record.locator('[data-tars-record-undo="delivery"]');
      await expect(button).toHaveText(lang === "en" ? "Withdraw request" : "요청 철회");
      await button.scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
      const geometry = await record.evaluate(node => {
        const box = node.getBoundingClientRect();
        const action = node.querySelector('[data-tars-record-undo="delivery"]')!.getBoundingClientRect();
        return { overflow: node.scrollWidth - node.clientWidth, contained: action.left >= box.left && action.right <= box.right + 1 };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1); expect(geometry.contained).toBe(true);
      await button.focus(); await page.keyboard.press("Enter");
      await expect(page.locator('[data-tars-delivery="withdrawn"]')).toBeVisible();
      await expect(page.locator('[data-tars-record-undo="delivery"]')).toHaveCount(0);
      await page.reload();
      await expect(page.locator('[data-tars-delivery="withdrawn"]')).toBeVisible();
    });
  }
}

test("unreadable start acknowledgement keeps the pending withdrawal visible across reload", async ({ page }) => {
  await page.goto("/?stavePreview=tars&withdrawal=pending");
  await page.getByRole("button", { name: "Withdraw request", exact: true }).click();
  await expect(page.locator('[data-tars-delivery="queued"]')).toContainText("Checking withdrawal");
  await expect(page.locator('[data-tars-delivery="withdrawn"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-tars-delivery="queued"]')).toContainText("Checking withdrawal");
});
