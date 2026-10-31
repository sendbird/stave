import { expect, test } from "@playwright/test";

// Use actual product markup and resolved tokens; compact density changes the
// 12-step padding, so a hardcoded pixel assertion would encode the wrong rule.
for (const locale of ["en", "ko"] as const) {
  for (const mode of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`return summary spacing and first-line alignment: ${locale}/${mode}/${density}`, async ({ page }) => {
        await page.goto(`/?stavePreview=task-panel&return=idle&theme=${mode}`);
        const card = page.getByTestId("return-summary");
        await expect(card).toBeVisible();
        await page.evaluate(async ({ locale, density }) => {
          const { applyAppLocale } = await import("/src/i18n/index.ts");
          applyAppLocale(locale);
          document.documentElement.dataset.uiDensity = density;
          await document.fonts.ready;
        }, { locale, density });
        await expect(page.locator("html")).toHaveAttribute("lang", locale === "ko" ? "ko-KR" : "en-US");
        expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(mode === "dark");
        expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status === "error").map((font) => font.family))).toEqual([]);
        const row = card.locator('[data-return-line="status"]');
        const title = row.locator("p").first();
        const initialTitle = await title.innerText();
        expect(initialTitle.length).toBeGreaterThan(0);
        for (const width of [640, 300]) {
          await page.getByTestId("side-chat-frame").evaluate((element, width) => {
            element.style.cssText = `flex:0 0 ${width}px;min-width:0;width:${width}px`;
          }, width);
          await expect.poll(async () => row.evaluate(async (element) => {
            const { vars } = await import("/src/components/ads/tokens/tokens.stylex.ts");
            const probe = document.createElement("div");
            probe.style.padding = vars["--ads-space-12"];
            probe.style.columnGap = vars["--ads-space-8"];
            element.append(probe);
            const padding = Number.parseFloat(getComputedStyle(probe).paddingLeft);
            const gap = Number.parseFloat(getComputedStyle(probe).columnGap);
            probe.remove();
            const style = getComputedStyle(element);
            const copy = element.querySelector("p")!;
            const glyph = element.querySelector("svg")!;
            const iconBox = glyph.getBoundingClientRect();
            const textBox = copy.getBoundingClientRect();
            const content = element.firstElementChild!;
            const mark = content.firstElementChild!.getBoundingClientRect();
            const textColumn = copy.parentElement!.getBoundingClientRect();
            const iconDelta = iconBox.y + iconBox.height / 2 - (textBox.y + Number.parseFloat(getComputedStyle(copy).lineHeight) / 2);
            const box = element.getBoundingClientRect();
            const action = element.querySelector("button")!.getBoundingClientRect();
            const margins = getComputedStyle(copy);
            return Math.max(
              ...[style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map((value) => Math.abs(Number.parseFloat(value) - padding)),
              Math.abs(textColumn.left - mark.right - gap), Math.abs(iconDelta),
              Math.abs(Number.parseFloat(margins.marginTop)), Math.abs(Number.parseFloat(margins.marginBottom)),
              Math.max(0, textBox.right - box.right, action.right - box.right),
            );
          })).toBeLessThanOrEqual(0.5);
        }
      });
    }
  }
}
