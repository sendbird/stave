import { expect, test } from "@playwright/test";
import { mountSegmented } from "./segmented-mount";

test("one Tab stop; arrows move and select, wrap and skip disabled; Home and End; never empty", async ({ page }) => {
  await mountSegmented(page, { density: "compact" });
  const group = page.getByRole("radiogroup", { name: "Layout" });
  const value = page.locator("#value");
  await page.locator("#before").focus();
  await page.keyboard.press("Tab");
  // The checked segment takes the group's single Tab stop.
  await expect(group.getByRole("radio", { name: "Board" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  // Table is disabled: the arrow skips it.
  await expect(value).toHaveText("timeline");
  await expect(group.getByRole("radio", { name: "Timeline" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await expect(value).toHaveText("list");
  await page.keyboard.press("ArrowLeft");
  await expect(value).toHaveText("timeline");
  await page.keyboard.press("Home");
  await expect(value).toHaveText("list");
  await expect(group.getByRole("radio", { name: "List" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(value).toHaveText("timeline");
  // Tab leaves the group in one step.
  await page.keyboard.press("Tab");
  await expect(page.locator("#after")).toBeFocused();
  // Pressing the checked segment again keeps it: there is no empty state.
  await group.getByRole("radio", { name: "Timeline" }).click();
  await expect(value).toHaveText("timeline");
  await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
});

test("migrated rows share the 28px segment and one Tab stop: command palette scope", async ({ page }) => {
  await page.goto("/?stavePreview=command-palette");
  const scope = page.getByRole("radiogroup", { name: /Tasks in/ });
  await expect(scope).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const scopeHeights = await scope.getByRole("radio").evaluateAll((radios) => radios.map((radio) => radio.getBoundingClientRect().height));
  expect(scopeHeights.length).toBe(2);
  for (const height of scopeHeights) expect(height).toBeCloseTo(28, 0);
  const tabbable = await scope.getByRole("radio").evaluateAll((radios) => radios.filter((radio) => radio.tabIndex === 0).length);
  expect(tabbable).toBe(1);
});
