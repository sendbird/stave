import { expect, test } from "@playwright/test";

/*
 * The agent run surfaces on the dev preview (`?stavePreview=agent-run`), which
 * renders every state from fixtures. The request → PR flow itself is covered
 * end to end through the host runtime in `tests/agent-run-scenarios.test.ts`.
 */

test.describe("run surfaces", () => {
  test("the bar names the stage and what it does; the track marks the current stage", async ({ page }) => {
    await page.goto("/?stavePreview=agent-run");
    const live = page.locator('[data-preview-case="Composer live"]');
    const bar = live.getByTestId("agent-run-bar");
    await expect(bar).toContainText("Verify");
    await expect(bar).toContainText("Running the tests");
    await expect(bar.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(bar.getByRole("button", { name: "Take over" })).toBeVisible();
  });

  test("a sign-off asks a question and names what its button starts", async ({ page }) => {
    await page.goto("/?stavePreview=agent-run");
    const card = page.getByTestId("agent-run-sign-off");
    await expect(card).toContainText("Ready to start Verify?");
    await expect(card.getByRole("button", { name: "Start Verify" })).toBeVisible();
    await card.getByRole("button", { name: "Ask for changes" }).click();
    await expect(card.getByLabel(/What should change/)).toBeFocused();
  });

  test("the panel folds each stage's instruction until asked", async ({ page }) => {
    await page.goto("/?stavePreview=agent-run");
    const panel = page.locator('[data-preview-case="Panel"]').getByTestId("agent-run-panel");
    await expect(panel).toContainText("Done when");
    const toggle = panel.getByRole("button", { name: "Instruction" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toContainText("Done when: The relevant checks pass");
  });

  test("the run's time leaves out its pauses and each stage says what it spent", async ({ page }) => {
    await page.goto("/?stavePreview=agent-run");
    const panel = page.locator('[data-preview-case="Panel active time"]').getByTestId("agent-run-panel");
    const figures = panel.locator('dl[aria-label="Run figures"]');
    await expect(figures).toContainText("Active for");
    await expect(figures).toContainText("pauses not counted");
    // 22 minutes since the start, 4 paused and 2 waiting on you: 16 active.
    await expect(figures.locator("dd").last()).toContainText(/^16m/);
    await expect(panel.getByRole("button", { name: /^Understand/ })).toContainText("$0.12");
    await expect(panel.getByRole("button", { name: /^Build/ })).toContainText("$0.51");
    await expect(panel.getByRole("button", { name: /^Verify/ })).toContainText("now · $0.21");
    // The stage the run is on keeps its well open, below its row.
    await expect(panel.locator('[role="listitem"][aria-current="step"]')).toContainText("In progress");
    // A run from an older host still reads its age, as before.
    const older = page.locator('[data-preview-case="Panel"]').getByTestId("agent-run-panel");
    await expect(older.locator('dl[aria-label="Run figures"]')).toContainText("Running for");
  });

  test("the report leads with the outcome and offers its actions", async ({ page }) => {
    await page.goto("/?stavePreview=agent-run");
    const report = page.locator('[data-preview-case="Report only"]').getByTestId("agent-run-report");
    await expect(report).toContainText("Run stopped");
    await expect(report.getByRole("button", { name: "Copy Markdown" })).toBeVisible();
    await report.getByRole("button", { name: "Add to PR description" }).click();
    await expect(report.getByRole("status")).toContainText("Added the report");
  });
});

for (const theme of ["light", "dark"]) test(`a first-stage retry shows a stage card in ${theme} theme`, async ({ page }) => {
  await page.goto(`/?stavePreview=agent-run&only=agent-run&theme=${theme}`);
  const retry = page.locator('[data-preview-case="First stage retry"]');
  await expect(retry.getByRole("button", { name: /Stage 1 of 1/ })).toBeVisible();
  await expect(retry).not.toContainText("Fix the billing table overflow on narrow screens.");
  await retry.getByRole("button", { name: "Full prompt sent to the agent" }).click();
  await expect(retry).toContainText("Fix the billing table overflow on narrow screens.");
  await expect(page.locator('[data-preview-case="Agent run bubble"]')).toContainText("Fix the billing table overflow on narrow screens.");
});
