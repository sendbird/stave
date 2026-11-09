import { expect, test } from "@playwright/test";

/**
 * A quota meter's track has to show its extent on the card or panel it sits
 * on, so an empty or low reading is not just a tick. Measured on the painted
 * pixels: every surface layer under the track and the track itself are drawn
 * onto a canvas in order, the way the browser composites them, and the two
 * results are compared as WCAG relative luminance.
 */

/** The floor every built-in theme meets (see `tests/theme-contrast.test.ts`). */
const TRACK_FLOOR = 1.3;
/** The default light and dark themes clear the non-text boundary step. */
const DEFAULT_THEME_FLOOR = 1.5;

test("meter tracks read on their card and panel surfaces in every built-in theme", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?stavePreview=usage");
  const meters = page.locator('[role="meter"]');
  await expect(meters.first()).toBeVisible();
  // Load the theme modules once first: on a cold dev server the first import
  // can make Vite reload the page, which would end the measuring script.
  await page
    .evaluate(() => Promise.all([import("/src/lib/themes/apply.ts"), import("/src/lib/themes/builtin-themes.ts")]))
    .catch(() => undefined);
  await page.waitForLoadState("networkidle");
  await expect(meters.first()).toBeVisible();
  expect(await meters.count()).toBeGreaterThan(2);

  const results = await page.evaluate(async () => {
    const { applyCustomTheme, applyThemeClass } = await import("/src/lib/themes/apply.ts");
    const { BUILTIN_CUSTOM_THEMES } = await import("/src/lib/themes/builtin-themes.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const luminance = (layers: string[]) => {
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        context.fillStyle = layer;
        context.fillRect(0, 0, 1, 1);
      }
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
    };
    const isTransparent = (color: string) => color === "transparent" || /\/ 0\)$|, 0\)$/.test(color);
    /** Backgrounds under an element, bottom layer first, down to the first opaque one. */
    const surfaceLayers = (element: Element) => {
      const layers: string[] = [];
      for (let node = element.parentElement; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (isTransparent(color)) continue;
        layers.unshift(color);
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        if (context.getImageData(0, 0, 1, 1).data[3] === 255) break;
      }
      return layers;
    };
    const rows: { theme: string; ratio: number; surface: string }[] = [];
    for (const theme of [null, { id: "dark", baseMode: "dark" }, ...BUILTIN_CUSTOM_THEMES]) {
      applyThemeClass({ enabled: theme?.baseMode === "dark" });
      applyCustomTheme({ theme: theme && "tokens" in theme ? theme : null });
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      for (const track of document.querySelectorAll('[role="meter"] [data-aui-slot="track"]')) {
        const surface = surfaceLayers(track);
        const trackColor = getComputedStyle(track).backgroundColor;
        const under = luminance(surface);
        const painted = luminance([...surface, trackColor]);
        const ratio = (Math.max(under, painted) + 0.05) / (Math.min(under, painted) + 0.05);
        rows.push({ theme: theme?.id ?? "light", ratio, surface: surface.at(-1) ?? "" });
      }
    }
    return rows;
  });

  // The default dark theme, for a look at the quota cards.
  await page.evaluate(async () => {
    const { applyCustomTheme, applyThemeClass } = await import("/src/lib/themes/apply.ts");
    applyThemeClass({ enabled: true });
    applyCustomTheme({ theme: null });
  });
  await page.screenshot({ path: test.info().outputPath("meter-tracks-dark.png") });

  expect(results.length).toBeGreaterThan(40);
  const surfaces = new Set(results.map((row) => row.surface));
  // Both the page background and the quota cards carry meters.
  expect(surfaces.size).toBeGreaterThan(1);
  const failures = results
    .filter((row) => row.ratio < (row.theme === "light" || row.theme === "dark" ? DEFAULT_THEME_FLOOR : TRACK_FLOOR))
    .map((row) => `${row.theme} on ${row.surface}: ${row.ratio.toFixed(2)}:1`);
  expect(failures).toEqual([]);
});
