import { expect, test } from "@playwright/test";

/**
 * The provider-mode presets are one radio group: a single Tab stop, and arrow
 * keys that move the radio with the action list following it. Moving is not
 * choosing: only a click, Space or Enter applies a preset, so reading what a
 * more permissive preset does never grants it.
 */
test("mode presets are a radio group with one Tab stop and arrow keys", async ({ page }, testInfo) => {
  await page.goto("/?stavePreview=composer-frame&case=idle");
  const pill = page.getByRole("button", { name: /^Claude (Manual|Guided|Auto|Custom):/ });
  await expect(pill).toHaveAccessibleName(/^Claude Guided:/);
  await pill.click();
  const menu = page.getByRole("dialog", { name: "Claude mode presets" });
  await expect(menu).toBeVisible();
  const group = menu.getByRole("radiogroup", { name: "Claude mode presets" });
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(3);
  const guided = group.getByRole("radio", { name: /^Guided/ });
  const manual = group.getByRole("radio", { name: /^Manual/ });
  const auto = group.getByRole("radio", { name: /^Auto/ });
  await expect(guided).toHaveAttribute("aria-checked", "true");
  await expect(guided).toBeFocused();
  // One Tab stop: only the checked radio is in the tab order.
  expect(await radios.evaluateAll((nodes) => nodes.filter((node) => node.getAttribute("tabindex") === "0").length)).toBe(1);
  await expect(menu.getByText("What Claude does in Guided")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("autonomy-dial-radiogroup.png") });

  // An arrow key moves focus and the radio, and the action list follows it;
  // the preset itself has not changed yet.
  await page.keyboard.press("ArrowDown");
  await expect(manual).toBeFocused();
  await expect(manual).toHaveAttribute("aria-checked", "true");
  await expect(guided).toHaveAttribute("aria-checked", "false");
  await expect(menu.getByText("What Claude does in Manual")).toBeVisible();
  await expect(menu.getByText("What Claude does in Guided")).toHaveCount(0);
  await expect(pill).toHaveAccessibleName(/^Claude Guided:/);

  // Tab leaves the group; Shift+Tab comes back to the checked radio.
  await page.keyboard.press("Tab");
  expect(await group.evaluate((node) => node.contains(document.activeElement))).toBe(false);
  await page.keyboard.press("Shift+Tab");
  await expect(manual).toBeFocused();

  // Esc leaves the preset as it was; reopening starts from it.
  await page.keyboard.press("ArrowDown");
  await expect(auto).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(pill).toHaveAccessibleName(/^Claude Guided:/);
  await pill.click();
  await expect(guided).toHaveAttribute("aria-checked", "true");
  await expect(guided).toBeFocused();

  // Space applies the focused radio and closes the menu.
  await page.keyboard.press("ArrowUp");
  await expect(auto).toBeFocused();
  await page.keyboard.press("Space");
  await expect(menu).toBeHidden();
  await expect(pill).toHaveAccessibleName(/^Claude Auto:/);

  // Enter does too.
  await pill.click();
  await expect(auto).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(guided).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(pill).toHaveAccessibleName(/^Claude Guided:/);

  // A pointer click picks and closes as before.
  await pill.click();
  await menu.getByRole("radio", { name: /^Manual/ }).click();
  await expect(menu).toBeHidden();
  await expect(pill).toHaveAccessibleName(/^Claude Manual:/);
});
