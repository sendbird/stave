import { expect, test } from "@playwright/test";

for (const mode of ["light", "dark"] as const) {
  test(`home menu changes and restores the display language in ${mode} mode`, async ({ page }) => {
    await page.addInitScript((themeMode) => {
      if (!localStorage.getItem("stave-store")) {
        localStorage.setItem("stave-store", JSON.stringify({
          state: { settings: { language: "en", themeMode } }, version: 0,
        }));
      }
    }, mode);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const trigger = page.getByRole("button", { name: "Open Stave menu", exact: true });
    await trigger.click();
    const language = page.getByRole("menuitem", { name: "Language", exact: true });
    await language.focus();
    await language.press("ArrowRight");
    await expect(page.getByRole("menuitemradio", { name: "English", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemradio", { name: "한국어", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
    await expect(page.getByRole("menuitem", { name: "언어", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("stave-store")!).state.settings.language)).toBe("ko");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
    await page.getByRole("button", { name: "Stave 메뉴 열기", exact: true }).click();
    await page.getByRole("menuitem", { name: "언어", exact: true }).hover();
    const korean = page.getByRole("menuitemradio", { name: "한국어", exact: true });
    await expect(korean).toHaveAttribute("aria-checked", "true");
    await korean.focus();
    await korean.press("ArrowUp");
    const english = page.getByRole("menuitemradio", { name: "English", exact: true });
    await expect(english).toBeFocused();
    await english.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: "한국어", exact: true })).not.toBeChecked();
    if (mode === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
}
