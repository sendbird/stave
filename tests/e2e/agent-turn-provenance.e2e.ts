import { expect, test } from "@playwright/test";

test("Agent run details remain readable at compact widths in both themes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 960, height: 900 });
  for (const width of [320, 384]) {
    await page.goto(`/?stavePreview=collaboration&inspector&agentEvidence&panelWidth=${width}`);
    await page.getByText("Run details", { exact: true }).click();
    const overview = page.getByTestId("task-run-overview");
    await expect(overview.getByText("Saved implementation Agent", { exact: true })).toBeVisible();
    await expect(overview.getByText("Configured; delivery not confirmed", { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => [...document.fonts].some((font) => font.family === "Geist Variable" && font.status === "loaded"))).toBe(true);
    for (const theme of ["dark", "light"] as const) {
      if (theme === "light") await page.getByRole("button", { name: "Light theme", exact: true }).click();
      expect(await overview.evaluate((element) => element.clientWidth)).toBe(width);
      expect(await overview.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await overview.screenshot({ path: testInfo.outputPath(`agent-details-${theme}-${width}.png`) });
    }
  }
});
