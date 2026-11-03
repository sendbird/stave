import { expect, test, type Page } from "@playwright/test";

/*
 * The usage view on its dev preview (`?stavePreview=usage`, fixture data
 * pinned to 2026-10-04): the chart is one tab stop with a read-out line, the
 * custom period is one range field in the filter row, and the figures say how
 * they moved against the period before.
 */

async function openTokens(page: Page, options: { locale: "en" | "ko"; mode: "light" | "dark"; density: "regular" | "compact" }) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`/?stavePreview=usage&theme=${options.mode}&lang=${options.locale}`);
  await page.evaluate(async (density) => {
    document.documentElement.dataset.uiDensity = density;
    await document.fonts.ready;
  }, options.density);
  // The second view tab is Tokens & cost in either language.
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator("[data-usage-chart]")).toBeVisible();
  expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(options.mode === "dark");
}

for (const locale of ["en", "ko"] as const) {
  for (const mode of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`usage chart is one tab stop with a read-out above the bars: ${locale}/${mode}/${density}`, async ({ page }) => {
        await openTokens(page, { locale, mode, density });
        const bars = page.locator("[data-usage-bar]");
        await expect(bars).toHaveCount(30);
        await expect(page.locator('[data-usage-bar][tabindex="0"]')).toHaveCount(1);
        const readout = page.locator("[data-usage-chart-readout]");
        const chart = page.locator("[data-usage-chart]");
        // The read-out sits on its own line between the controls and the bars, never over them.
        const [readBox, chartBox] = await Promise.all([readout.boundingBox(), chart.boundingBox()]);
        expect(readBox!.y + readBox!.height).toBeLessThanOrEqual(chartBox!.y + 1);
        const lineHeight = await readout.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight));
        expect(readBox!.height).toBeLessThan(lineHeight * 1.6);

        // One Tab reaches the newest bar; arrows move within the group and the read-out follows.
        const newest = page.locator('[data-usage-bar][tabindex="0"]');
        await newest.focus();
        const newestDate = await newest.getAttribute("data-usage-bar");
        await expect(readout).toContainText(newestDate!);
        await page.keyboard.press("ArrowLeft");
        const previous = bars.nth(28);
        await expect(previous).toBeFocused();
        await expect(previous).toHaveAttribute("tabindex", "0");
        await expect(readout).toContainText((await previous.getAttribute("data-usage-bar"))!);
        await page.keyboard.press("Home");
        await expect(bars.first()).toBeFocused();
        // Tab leaves the bars in one step: the next stop is not another bar.
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-usage-bar"))).toBe(false);

        // The pointer reads a bar without moving the tab stop.
        await bars.nth(10).hover();
        await expect(readout).toContainText((await bars.nth(10).getAttribute("data-usage-bar"))!);
      });
    }
  }
}

test("split by provider stacks each bar and the legend shows or hides a provider", async ({ page }) => {
  await openTokens(page, { locale: "en", mode: "dark", density: "regular" });
  await page.getByRole("combobox", { name: "Split" }).click();
  await page.getByRole("option", { name: "Split by provider" }).click();
  const legend = page.getByRole("group", { name: "Providers in the chart" });
  const claude = legend.getByRole("button", { name: "Claude" });
  await expect(claude).toHaveAttribute("aria-pressed", "true");
  const readout = page.locator("[data-usage-chart-readout]");
  await page.locator("[data-usage-bar]").nth(12).hover();
  await expect(readout).toContainText("Claude");
  await expect(readout).toContainText("Codex");
  await claude.click();
  await expect(claude).toHaveAttribute("aria-pressed", "false");
  await page.locator("[data-usage-bar]").nth(12).hover();
  await expect(readout).not.toContainText("Claude");
  // Enter on a day shows its hours (the first day reported tokens, so its hours draw bars).
  await page.locator('[data-usage-bar][tabindex="0"]').focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-usage-bar]").first()).toHaveAttribute("data-usage-bar", /GMT/);
});

for (const locale of ["en", "ko"] as const) {
  for (const mode of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`custom dates are one range field in the filter row: ${locale}/${mode}/${density}`, async ({ page }) => {
        await openTokens(page, { locale, mode, density });
        // Period is the third filter (after provider and account); its last option is custom dates.
        await page.getByRole("combobox").nth(2).click();
        await page.getByRole("option").last().click();
        const field = page.locator("[data-usage-date-range]");
        const trigger = page.locator("[data-usage-date-range-trigger]");
        await expect(trigger).toBeVisible();
        // It continues the period that was on screen.
        await expect(trigger).toContainText("2026");
        const filters = await page.getByRole("combobox").evaluateAll((elements) => elements.slice(0, 5).map((element) => {
          const box = element.getBoundingClientRect();
          return { top: box.top, height: box.height };
        }));
        const triggerBox = await trigger.boundingBox();
        // One row, one control height: the field lines up with the selects beside it.
        expect(Math.abs(triggerBox!.y - filters[0]!.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(triggerBox!.height - filters[0]!.height)).toBeLessThanOrEqual(1);
        const label = field.locator("span").first();
        const lineHeight = await trigger.evaluate((element) => Number.parseFloat(getComputedStyle(element.querySelector("span")!).lineHeight));
        expect((await trigger.locator("span").first().boundingBox())!.height).toBeLessThan(lineHeight * 1.6);
        await expect(label).toBeVisible();

        const before = await trigger.innerText();
        await trigger.click();
        const popup = page.locator('[data-slot="popover-content"]');
        await expect(popup).toBeVisible();
        await popup.locator('[data-usage-range-preset="7"]').click();
        await expect(popup.locator('[data-usage-range-preset="7"]')).toHaveAttribute("aria-pressed", "true");
        await expect(popup.locator("[data-usage-range-summary]")).toContainText(locale === "en" ? "7 days" : "7일");
        // Escape discards the draft and keeps the usage view open.
        await page.keyboard.press("Escape");
        await expect(popup).toHaveCount(0);
        await expect(trigger).toHaveText(before);
        await expect(page.locator("[data-usage-chart]")).toBeVisible();

        await trigger.click();
        await popup.locator('[data-usage-range-preset="7"]').click();
        await popup.getByRole("button").last().click();
        await expect(popup).toHaveCount(0);
        await expect(trigger).not.toHaveText(before);
        await expect(trigger).toBeFocused();
      });
    }
  }
}

test("the figures compare with the period before, and say when they cannot", async ({ page }) => {
  await openTokens(page, { locale: "en", mode: "light", density: "regular" });
  // The fixture's turns span 30 days, so the 30 days before have none.
  await expect(page.locator('[data-usage-delta="not-compared"]').first()).toContainText("Not compared · no turns in");
  await page.getByRole("combobox", { name: "Period" }).click();
  await page.getByRole("option", { name: "Last 7 days" }).click();
  const compared = page.locator('[data-usage-delta="compared"]').first();
  await expect(compared).toContainText(/[↑↓]\d+%/);
  await expect(compared).toContainText("vs Sep 21");
  // The direction is in words for assistive technology, not only in an arrow or a color.
  await expect(compared).toContainText(/(Up|Down) \d+% vs/);
});
