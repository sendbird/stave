import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

for (const width of [1440, 1024]) {
  for (const [language, theme] of [["en", "light"], ["ko", "dark"]] as const) {
    test(`feature hints and public resource manager ${language} ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?stavePreview=resource-manager&discovery=1&lang=${language}&theme=${theme}`);
      const hints = page.locator("[data-discovery-hints]");
      await expect(hints.locator("[data-feature-hint]")).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await hints.locator("[data-feature-hint]").evaluateAll((rows) => rows.map((row) => {
        const text = row.querySelector("span")!.getBoundingClientRect();
        const button = row.querySelector("button")!.getBoundingClientRect();
        const rect = row.getBoundingClientRect();
        return { center: Math.abs((text.top + text.bottom - button.top - button.bottom) / 2), contained: text.left >= rect.left && button.right <= rect.right + 1 };
      }));
      for (const row of geometry) {
        expect(row.center).toBeLessThanOrEqual(1);
        expect(row.contained).toBe(true);
      }
      await mkdir("/tmp/gap-h1/after2", { recursive: true });
      await hints.screenshot({ path: `/tmp/gap-h1/after2/hints-${language}-${theme}-${width}.png` });
      // Closing a tip remembers it.
      await hints.locator('[data-feature-hint="steering"]').getByRole("button", { name: language === "en" ? "Dismiss tip" : "팁 닫기", exact: true }).click();
      await expect(hints.locator('[data-feature-hint="steering"]')).toHaveCount(0);
      expect(await page.evaluate(async () => {
        const { useAppStore } = await import(performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname === "/src/store/app.store.ts").at(-1)!.name);
        return useAppStore.getState().settings.dismissedFeatureTips;
      })).toEqual(["steering"]);
      await expect(hints.locator("[data-feature-hint]")).toHaveCount(0);
      await page.getByRole("button", { name: language === "en" ? "Resource Manager" : "리소스 관리자", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(language === "en" ? "Diagnostics and storage" : "진단 및 저장 공간", { exact: true })).toHaveCount(0);
      await expect(dialog.getByText(language === "en" ? "Memory diagnostics and storage" : "메모리 진단 및 저장 공간", { exact: true })).toHaveCount(0);
      await page.screenshot({ path: `/tmp/gap-h1/after2/resources-${language}-${theme}-${width}.png` });
      expect(await dialog.evaluate((node) => node.getBoundingClientRect().right <= innerWidth)).toBe(true);
    });

    test(`palette discovery descriptions ${language} ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?stavePreview=command-palette&lang=${language}&theme=${theme}`);
      const input = page.getByRole("combobox").first();
      await expect(input).toBeVisible();
      for (const query of ["resources", "secret requests", "check back"]) {
        await input.fill(query);
        await expect(page.locator('[data-slot="command-item"]').first()).toBeVisible();
      }
      await input.fill("resources");
      await page.evaluate(() => document.fonts.ready);
      await mkdir("/tmp/gap-h1/after2", { recursive: true });
      await page.screenshot({ path: `/tmp/gap-h1/after2/palette-${language}-${theme}-${width}.png` });
    });
  }
}

test("resource diagnostics remain available only in developer mode", async ({ page }) => {
  await page.goto("/?stavePreview=resource-manager&discovery=1&developer=1");
  await page.getByRole("button", { name: "Resource Manager", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Diagnostics and storage", { exact: true })).toBeVisible();
});
