import { expect, test } from "@playwright/test";

/**
 * The composer's Thinking control is a menu on one trigger: its label says the
 * mode in use, the menu explains each mode, and only choosing one changes it.
 */
test("Thinking shows its mode and changes only when a mode is chosen", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?stavePreview=composer-frame&case=idle&theme=light", {
    waitUntil: "domcontentloaded",
  });
  const trigger = page.getByRole("button", { name: /^Thinking · / });
  const menu = page.getByRole("menu");
  // The menu moves focus onto its first item a frame after it opens.
  const focusInMenu = () =>
    expect
      .poll(() =>
        page.evaluate(() => Boolean(document.activeElement?.closest('[role="menu"]'))),
      )
      .toBe(true);
  await expect(trigger).toBeVisible();
  const initial = await trigger.getAttribute("aria-label");
  expect(initial).toMatch(/^Thinking · (Adaptive|Enabled|Disabled)$/);

  // Every mode is listed with what it does, the current one checked, and the
  // menu says the choice applies to every task.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("Applies to every Claude task");
  const options = page.getByRole("menuitemradio");
  await expect(options).toHaveCount(3);
  await expect(options.filter({ hasText: "Claude decides when deeper thinking" })).toHaveCount(1);
  await expect(page.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(1);

  // Esc and Tab close the menu without changing the mode, and focus is back
  // on the trigger.
  await focusInMenu();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-label", initial!);
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await focusInMenu();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-label", initial!);

  // A click outside leaves it as it was too.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-label", initial!);

  // Choosing a mode commits it and closes the menu.
  const next = initial === "Thinking · Disabled" ? "Adaptive" : "Disabled";
  await trigger.click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${next}`) }).click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-label", `Thinking · ${next}`);
});
