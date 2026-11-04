import { expect, test } from "@playwright/test";

test("plain fences and composer reader geometry", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    for (const width of [360, 1000]) {
      await page.setViewportSize({ width, height: 800 });
      for (const variant of ["", "&panel", "&minimal"]) {
        await page.goto(`/?stavePreview=reader-sizing&size=20&theme=${theme}${variant}`);
        const editor = page.locator('[contenteditable="true"]');
        await expect(editor).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const fontSize = variant === "&panel" ? 14 : variant === "&minimal" ? 18.75 : 20;
        await expect(editor).toHaveCSS("font-size", `${fontSize}px`);
        await expect(editor).toHaveCSS("line-height", `${fontSize * 1.68}px`);
        const geometry = await editor.evaluate((element) => {
          const style = getComputedStyle(element);
          return { height: element.getBoundingClientRect().height, min: parseFloat(style.minBlockSize), line: parseFloat(style.lineHeight) };
        });
        expect(Math.abs(geometry.min - geometry.line * 2)).toBeLessThan(0.1);
        expect(geometry.height).toBeGreaterThanOrEqual(geometry.min - 0.1);
        await expect(page.locator("pre span")).toHaveCount(0);
        const colors = await page.locator("pre").evaluate((element) => [getComputedStyle(element).color, getComputedStyle(element.parentElement!).color]);
        expect(colors[0]).toBe(colors[1]);
      }
    }
  }
});
