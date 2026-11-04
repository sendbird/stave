import { expect, test } from "@playwright/test";
import { mountSegmented, segmentGeometry } from "./segmented-mount";

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

// A segmented choice: every segment is the xs control rung (28px at regular
// density), and its icon, label and count share one centre line with a
// token gap before the count, in both languages, themes and densities.
for (const locale of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`segmented control geometry: ${locale}/${theme}/${density}`, async ({ page }) => {
        // Mounting must not depend on the browser retaining resource timing entries.
        await page.addInitScript(() => performance.setResourceTimingBufferSize(0));
        await mountSegmented(page, { density, count: true, icons: true, locale, theme });
        const { expectedHeight, segments } = await segmentGeometry(page);
        if (density === "regular") expect(expectedHeight).toBe(28);
        expect(segments).toHaveLength(4);
        for (const segment of segments) {
          expect(segment.height).toBeCloseTo(expectedHeight, 0);
          expect(segment.labelOffset).toBeLessThanOrEqual(1);
          expect(segment.badgeOffset).toBeLessThanOrEqual(1);
          expect(segment.iconOffset).toBeLessThanOrEqual(1);
          expect(segment.badgeGapDelta).toBeLessThanOrEqual(0.5);
          expect(segment.badgeInside).toBe(true);
        }
      });
    }
  }
}

for (const locale of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`default workspace identity stays inline: ${locale}/${theme}/${density}`, async ({ page }) => {
        await page.goto(`/?stavePreview=sidebar-run-states&lang=${locale}&theme=${theme}`);
        const row = page.locator('[data-preview-workspace="default"]');
        await expect(row).toBeVisible();
        await page.evaluate(async (density) => {
          document.documentElement.dataset.uiDensity = density;
          await document.fonts.ready;
        }, density);
        for (const width of [200, 360]) {
          await page.locator('nav').evaluate((element, width) => { element.style.width = `${width}px`; }, width);
          for (const id of ["default", "default-long"]) {
            const branch = page.locator(`[data-preview-workspace="${id}"] [data-workspace-row-branch]`);
            const geometry = await branch.evaluate((element) => {
              const separator = element.previousElementSibling!;
              const title = separator.previousElementSibling!;
              const parent = element.parentElement!;
              const boxes = [title, separator, element].map((node) => node.getBoundingClientRect());
              const gap = Number.parseFloat(getComputedStyle(parent).gap);
              return {
                centerDelta: Math.max(...boxes.map((box) => Math.abs(box.y + box.height / 2 - (boxes[0].y + boxes[0].height / 2)))),
                gapDelta: Math.max(Math.abs(boxes[1].left - boxes[0].right - gap), Math.abs(boxes[2].left - boxes[1].right - gap)),
                overflow: boxes[2].right - parent.getBoundingClientRect().right,
                truncated: element.scrollWidth > element.clientWidth,
                titleTruncated: title.scrollWidth > title.clientWidth,
                separator: separator.textContent,
              };
            });
            // Subpixel layout can round each edge by half a CSS pixel.
            expect(geometry.centerDelta).toBeLessThanOrEqual(0.5);
            expect(geometry.gapDelta).toBeLessThanOrEqual(0.5);
            expect(geometry.overflow).toBeLessThanOrEqual(0.5);
            expect(geometry.titleTruncated).toBe(false);
            expect(geometry.separator).toBe("·");
            if (id === "default-long" && width === 200) expect(geometry.truncated).toBe(true);
            await expect(branch).toHaveCSS("text-overflow", "ellipsis");
          }
        }
        const noBranch = page.locator('[data-preview-workspace="default-no-branch"]');
        await expect(noBranch.locator('[data-workspace-row-branch]')).toHaveCount(0);
        await expect(noBranch).not.toContainText("·");
      });
    }
  }
}
