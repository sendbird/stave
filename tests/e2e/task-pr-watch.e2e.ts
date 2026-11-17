import { expect, test } from "@playwright/test";

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
    test(`task watch record stops the saved watch (${lang}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?stavePreview=transcript-rows&lang=${lang}&theme=${theme}&prWatch=1`);
      await expect(page.getByText("Plan the next settings pass.", { exact: true })).toBeVisible();
      const notice = page.getByTestId("task-pr-watch-notice");
      await expect(notice).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const icon = notice.locator("svg");
      const text = notice.locator("p").first();
      const iconBox = await icon.boundingBox();
      const textBox = await text.boundingBox();
      expect(Math.abs(iconBox!.y + iconBox!.height / 2 - textBox!.y - textBox!.height / 2)).toBeLessThanOrEqual(1);
      expect(await notice.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/gap-h2/watch-after-${lang}-${theme}-${width}.png` });
      await notice.getByRole("button", { name: lang === "ko" ? "감시 중지" : "Stop watching", exact: true }).click();
      await expect(notice).toHaveCount(0);
    });
  }
}

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [1440, 1024]) {
  test(`repository watch setting preserves its saved value (${lang}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?stavePreview=transcript-rows&lang=${lang}&theme=${theme}&watchSettings=1`);
    const toggle = page.getByRole("switch", { name: lang === "ko" ? "에이전트가 만든 PR 감시" : "Watch pull requests agents open", exact: true });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await toggle.evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `/tmp/gap-h2/watch-setting-after-${lang}-${theme}-${width}.png` });
  });
  }
}
