import { expect, test } from "@playwright/test";

test("reviewing the last of 21 pending runs returns to the remaining 20", async ({ page }) => {
  await page.addInitScript(() => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `review-${index}`, repositoryPath: "/tmp/preview-project", repositoryName: "Project",
      workspaceId: "preview-workspace", workspaceName: "Workspace", taskId: "preview-parent", taskTitle: "Preview",
      turnId: `turn-${index}`, outcome: "completed", summary: `Saved result ${index}`,
      createdAt: new Date(Date.UTC(2026, 8, 30, 0, index)).toISOString(), reviewedAt: null,
    }));
    localStorage.setItem("stave:result-reviews:v1", JSON.stringify(rows));
  });
  await page.goto("/?stavePreview=collaboration&resultReview=1");
  await expect(page.getByRole("button", { name: "Mark reviewed", exact: true })).toHaveCount(20);
  await page.getByRole("button", { name: "Older", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark reviewed", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark reviewed", exact: true })).toHaveCount(20);
  await expect(page.getByText("20 runs", { exact: true })).toBeVisible();
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem("stave:result-reviews:v1")!).filter((row: { reviewedAt: string | null }) => !row.reviewedAt).length);
  expect(pending).toBe(20);
});

test("managed Team keeps history readable and finished details lead with the result", async ({ page }) => {
  await page.goto("/?stavePreview=collaboration&managed=1");
  await expect(page.getByText(/This task is managed externally/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Filter delegations" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New delegation", exact: true })).toHaveCount(0);
  await page.locator('[data-exchange-kind="worker"] button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Returned result", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/The close request must drain pending commands/).first()).toBeVisible();
  await expect(dialog.getByText("Assignment and execution details", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Assignment", { exact: true })).not.toBeVisible();
  await expect(dialog.locator('details').filter({ has: page.locator('summary', { hasText: "Activity log" }) })).not.toHaveAttribute("open");
  await dialog.getByText("Assignment and execution details", { exact: true }).click();
  await expect(dialog.getByText("Assignment", { exact: true })).toBeVisible();
});
