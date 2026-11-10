import { expect, test } from "@playwright/test";

for (const [lang, theme] of [["en", "light"], ["ko", "dark"]] as const) {
  for (const width of [390, 1100]) {
    test(`restart notice and settings (${lang} ${theme} ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?stavePreview=restart-notifications&lang=${lang}&theme=${theme}`, { waitUntil: "domcontentloaded" });
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(dialog.getByRole("button", { name: lang === "en" ? "Continue" : "이어가기", exact: true })).toHaveCount(2);
      expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      const rows = await dialog.locator('button').evaluateAll((buttons) => buttons.filter((button) => button.textContent === "Continue" || button.textContent === "이어가기").map((button) => {
        const text = button.previousElementSibling!.getBoundingClientRect();
        const action = button.getBoundingClientRect();
        return { gap: action.left - text.right, center: Math.abs(text.top + text.height / 2 - action.top - action.height / 2) };
      }));
      for (const row of rows) { expect(row.gap).toBeGreaterThanOrEqual(11); expect(row.center).toBeLessThanOrEqual(1); }
      await page.screenshot({ path: `/tmp/gap-h3/${lang}-${theme}-${width}-notice.png` });
      await dialog.getByRole("button", { name: lang === "en" ? "Continue" : "이어가기", exact: true }).first().click();
      await expect(dialog.getByRole("button", { name: lang === "en" ? "Continue" : "이어가기", exact: true })).toHaveCount(1);
      await dialog.getByRole("button", { name: lang === "en" ? "Dismiss" : "닫기", exact: true }).first().click();
      await expect(dialog).toHaveCount(0);
      const title = lang === "en" ? "After a restart, continue interrupted work" : "앱을 다시 시작한 뒤 중단된 작업 이어가기";
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      const toggle = page.getByRole("switch", { name: lang === "en" ? "Answer from notifications" : "알림에서 응답", exact: true });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await page.screenshot({ path: `/tmp/gap-h3/${lang}-${theme}-${width}-settings.png` });
    });
  }
}

test("native response preference is hidden on unsupported platforms", async ({ page }) => {
  await page.goto("/?stavePreview=restart-notifications&platform=linux", { waitUntil: "domcontentloaded" });
  await page.getByRole("dialog").getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Answer from notifications", exact: true })).toHaveCount(0);
});

test("continue all closes the notice and restart choices update the preference", async ({ page }) => {
  await page.goto("/?stavePreview=restart-notifications", { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Continue all", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const select = page.getByRole("combobox").first();
  await expect(select).toContainText("Ask");
  for (const label of ["Automatically", "Never", "Ask"]) {
    await select.click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await expect(select).toContainText(label);
  }
});
