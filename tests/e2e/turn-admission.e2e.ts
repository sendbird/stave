import { expect, test } from "@playwright/test";

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]]) {
  test(`turn cap setting is opt-in and queue position is visible ${lang} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`/?stavePreview=command-palette&turnCapPreview=1&lang=${lang}&theme=${theme}`);
    const title = lang === "en" ? "Run at most N agent turns at once" : "동시에 실행할 에이전트 턴 수 제한";
    const toggle = page.getByRole("switch", { name: title });
    await expect(toggle).not.toBeChecked();
    await expect(page.getByTestId("global-turn-limit")).toHaveCount(0);
    await expect(page.locator("[data-fleet-activity-line]")).toHaveText(lang === "en" ? "Waiting for a free slot (3 ahead)" : "실행 자리 대기 중 (앞에 3개)");
    await toggle.click();
    const input = page.getByTestId("global-turn-limit");
    await expect(input).toHaveValue("4");
    await input.fill("2");
    await input.blur();
    await expect(input).toHaveValue("2");
    await page.evaluate(() => document.fonts.ready);
    const geometry = await input.evaluate(el => { const box = el.getBoundingClientRect(); return { right: box.right, width: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth }; });
    expect(geometry.right).toBeLessThanOrEqual(geometry.width);
    expect(geometry.overflow).toBe(false);
    await page.screenshot({ path: `/tmp/gap-h5/turn-cap-${lang}-${theme}.png`, animations: "disabled" });
    await toggle.click();
    await expect(input).toHaveCount(0);
  });
}
