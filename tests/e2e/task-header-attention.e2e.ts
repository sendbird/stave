import { expect, test } from "@playwright/test";

for (const lang of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`task header opens the exact pending question from Review in ${lang}, ${theme}`, async ({ page }) => {
      const width = theme === "light" ? 420 : 850;
      await page.goto(`/?stavePreview=task-panel&attention=1&task=agent-run&older=question&panelWidth=${width}&lang=${lang}&theme=${theme}`);
      const label = lang === "ko" ? "응답 필요" : "Needs you";
      const status = page.getByRole("button", { name: label, exact: true });
      await expect(status).toBeVisible();
      await expect(page.getByText(lang === "ko" ? /확인이 필요합니다 \(/ : /Needs your attention \(/)).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const header = page.locator(".dv-tabs-and-actions-container");
      const mode = page.getByTestId("pane-header-mode-switch");
      const [headerBox, statusBox, modeBox] = await Promise.all([header.boundingBox(), status.boundingBox(), mode.boundingBox()]);
      expect(Math.abs(statusBox!.y + statusBox!.height / 2 - modeBox!.y - modeBox!.height / 2)).toBeLessThanOrEqual(1);
      expect(statusBox!.x).toBeGreaterThanOrEqual(headerBox!.x);
      expect(modeBox!.x + modeBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width);

      await mode.getByRole("radio", { name: lang === "ko" ? /^검토/ : /^Review/ }).click();
      await expect(page.getByTestId("task-review-surface")).toBeVisible();
      await status.click();
      await expect(page.getByTestId("task-review-surface")).toHaveCount(0);
      await expect(page.locator('[data-user-input-request-id="preview-older-question"]')).toBeFocused();
      await expect(page.getByTestId("composer-approval-row").locator('[data-approval-request-id="preview-live-approval"]')).toBeVisible();
    });
  }
}

test("the header selects the exact approval in a composer queue", async ({ page }) => {
  await page.goto("/?stavePreview=task-panel&attention=1&task=agent-run&pending=approval&panelWidth=560");
  const queue = page.getByTestId("composer-approval-row");
  await expect(queue.locator('[data-approval-request-id="preview-live-approval"]')).toBeVisible();
  await page.getByTestId("pane-header-mode-switch").getByRole("radio", { name: /^Review/ }).click();
  await expect(page.getByTestId("task-review-surface")).toBeVisible();
  await page.getByRole("button", { name: "Needs you", exact: true }).click();
  await expect(queue.locator('[data-approval-request-id="preview-first-approval"]')).toBeVisible();
  await expect(queue).toBeFocused();
});
