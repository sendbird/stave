import { expect, test } from "@playwright/test";

/*
 * The mission surfaces on the dev preview (`?stavePreview=mission`), which
 * renders every state from fixtures. The request → PR flow itself is covered
 * end to end through the host runtime in `tests/mission-scenarios.test.ts`.
 */

test.describe("mission surfaces", () => {
  test("the bar names the stage and what it does; the track marks the current stage", async ({ page }) => {
    await page.goto("/?stavePreview=mission");
    const live = page.locator('[data-preview-case="Composer live"]');
    const bar = live.getByTestId("mission-bar");
    await expect(bar).toContainText("Verify");
    await expect(bar).toContainText("Running the tests");
    await expect(bar.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(bar.getByRole("button", { name: "Take over" })).toBeVisible();
  });

  test("a sign-off asks a question and names what its button starts", async ({ page }) => {
    await page.goto("/?stavePreview=mission");
    const card = page.getByTestId("mission-sign-off");
    await expect(card).toContainText("Ready to start Verify?");
    await expect(card.getByRole("button", { name: "Start Verify" })).toBeVisible();
    await card.getByRole("button", { name: "Ask for changes" }).click();
    await expect(card.getByLabel(/What should change/)).toBeFocused();
  });

  test("the panel folds each stage's instruction until asked", async ({ page }) => {
    await page.goto("/?stavePreview=mission");
    const panel = page.locator('[data-preview-case="Panel"]').getByTestId("mission-panel");
    await expect(panel).toContainText("Done when");
    const toggle = panel.getByRole("button", { name: "Instruction" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toContainText("Done when: The relevant checks pass");
  });

  test("the report leads with the outcome and offers its actions", async ({ page }) => {
    await page.goto("/?stavePreview=mission");
    const report = page.locator('[data-preview-case="Report only"]').getByTestId("mission-report");
    await expect(report).toContainText("Mission stopped");
    await expect(report.getByRole("button", { name: "Copy Markdown" })).toBeVisible();
    await report.getByRole("button", { name: "Add to PR description" }).click();
    await expect(report.getByRole("status")).toContainText("Added the report");
  });
});
