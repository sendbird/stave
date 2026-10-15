import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`an editing agent offers Review before done in its Workflow (${theme})`, async ({ page }, testInfo) => {
    await page.goto(`/?stavePreview=agents&edit=1&theme=${theme}`);
    const label = page.locator("dt", { hasText: "Review before done" });
    await expect(label).toBeVisible();
    const section = label.locator("xpath=ancestor::dl/..");
    await expect(section).toContainText("When behavior changes");
    await expect(section).toContainText("only passes without findings");
    await section.screenshot({ path: testInfo.outputPath("review-before-done.png") });
    await page.getByRole("combobox", { name: "Review before done" }).click();
    await page.getByRole("option", { name: "Off" }).click();
    await expect(section).toContainText("A run ends when the work is done and verified, without a review.");
  });
}
