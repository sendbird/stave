import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const lang of ["en", "ko"]) {
    for (const width of [360, 720]) {
      test(`context tokens and compaction: ${theme}/${lang}/${width}`, async ({ page }) => {
        await page.goto(`/?stavePreview=context-progress&theme=${theme}&lang=${lang}&width=${width}`);
        await page.evaluate(() => document.fonts.ready);
        const trigger = page.getByRole("button").first();
        await expect(trigger).toHaveAccessibleName(/(?=.*720,000)(?=.*1,000,000)/);
        await expect(trigger.getByText(width < 480 ? "72%" : "720k / 1M", { exact: true })).toBeVisible();
        await expect(trigger.getByText(width < 480 ? "720k / 1M" : "72%", { exact: true })).toBeHidden();
        const label = page.locator('[data-composer-frame] > div').first();
        const initial = await label.innerText();
        expect(initial).toContain("·");
        await expect.poll(() => label.innerText()).not.toBe(initial);
        await expect(trigger).toHaveCSS("white-space", "nowrap");
      });
    }
  }
}
test("unknown compaction start keeps the existing label", async ({ page }) => {
await page.goto("/?stavePreview=context-progress&unknown");
await expect(page.getByText("Compacting conversation context…", { exact: true })).toBeVisible();
});
