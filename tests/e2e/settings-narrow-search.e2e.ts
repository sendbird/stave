import { expect, test } from "@playwright/test";

/**
 * Below 640px Settings hides its sidebar, which is where search results used
 * to appear. The narrow header lists them under its own input instead.
 */
for (const mode of ["light", "dark"] as const) {
  test(`a narrow Settings window finds, opens and changes a setting in another section (${mode})`, async ({ page }) => {
    await page.addInitScript((themeMode) => {
      if (!localStorage.getItem("stave-store")) {
        localStorage.setItem("stave-store", JSON.stringify({
          state: { settings: { language: "en", themeMode } }, version: 0,
        }));
      }
    }, mode);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings.getByRole("heading", { name: "General" })).toBeVisible();

    await page.setViewportSize({ width: 600, height: 900 });
    // Only the narrow header's input is on screen at this width.
    const search = settings.getByRole("textbox", { name: "Search settings" });
    await expect(search).toHaveCount(1);
    const results = settings.getByRole("group", { name: "Search results" });

    await search.fill("zzqx");
    const noMatches = settings.getByRole("status").filter({ hasText: "No settings match" });
    await expect(noMatches).toHaveText('No settings match "zzqx".');
    await settings.getByRole("button", { name: "Clear settings search" }).click();
    await expect(search).toHaveValue("");
    await expect(noMatches).toHaveCount(0);

    await search.fill("usage limit");
    await results.getByRole("button", { name: /Stop turns at 100% usage/ }).click();
    await expect(settings.getByRole("combobox", { name: "Settings section" })).toContainText("Providers");
    await expect(settings.locator("#settings-field-account-usage-limit")).toBeInViewport();
    const toggle = settings.getByRole("switch", { name: "Stop turns at 100% usage" });
    await expect(toggle).toBeInViewport();
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem("stave-store") ?? "{}").state?.settings?.blockTurnsWhenAccountLimitReached,
    )).toBe(false);

    // A section that only matches by name is a result here too, since the
    // narrow layout has no section list to narrow.
    await search.fill("editor");
    await results.getByRole("button", { name: "Editor", exact: true }).click();
    await expect(settings.getByRole("combobox", { name: "Settings section" })).toContainText("Editor");
  });
}
