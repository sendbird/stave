import { expect, test, type Page } from "@playwright/test";

/**
 * Review with two more results waiting in Fleet (`queue=1`): "Tidy the
 * invoice export" waited longest, then this task, then "Audit the settings
 * sidebar".
 */
async function open(page: Page) {
  await page.goto("/?stavePreview=review&queue=1");
  await expect(page.getByTestId("task-review-surface")).toBeVisible();
}

const decisions = (page: Page) => page.getByRole("region", { name: "Decision" });
const writes = (page: Page) => page.evaluate(() => (window as unknown as { __staveResultWrites?: unknown[] }).__staveResultWrites ?? []);

test("the scope bar says J / K and how many reviews wait besides this one", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("review-queue-hint")).toHaveText(/Next \/ previous review · 2 left/);
});

test("after Mark reviewed, focus goes to Next review, and Undo restores the result", async ({ page }) => {
  await open(page);
  const bar = decisions(page);
  await expect(bar).toContainText("Not reviewed yet");
  await bar.getByRole("button", { name: "Mark reviewed" }).click();

  const next = bar.getByRole("button", { name: /Next review · Audit the settings sidebar/ });
  await expect(next).toBeFocused();
  await expect(bar).toContainText("Reviewed");

  const toast = page.getByText("Marked reviewed", { exact: true });
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(bar.getByRole("button", { name: "Mark reviewed" })).toBeVisible();
  await expect(bar).toContainText("Not reviewed yet");
  // The mark read the unread result, so Undo takes back both.
  expect(await writes(page)).toEqual([
    { kind: "marked", repositoryPath: "/tmp/preview-repo", workspaceId: "preview-workspace", taskId: "preview-task", turnId: "turn-2", markedReviewed: true },
    { kind: "marked", repositoryPath: "/tmp/preview-repo", workspaceId: "preview-workspace", taskId: "preview-task", turnId: "turn-2", markedReviewed: false },
    { kind: "read", repositoryPath: "/tmp/preview-repo", workspaceId: "preview-workspace", taskId: "preview-task", turnId: "turn-2", reviewed: false },
  ]);
});

test("Next review opens the following task's review, and J / K move through the queue", async ({ page }) => {
  await open(page);
  const bar = decisions(page);
  await bar.getByRole("button", { name: "Mark reviewed" }).click();
  await bar.getByRole("button", { name: /Next review · Audit the settings sidebar/ }).press("Enter");
  // The later task's own review, with focus inside it.
  await expect(page.getByTestId("review-queue-hint")).toHaveText(/2 left/);
  await expect(bar.getByRole("button", { name: "Mark reviewed" })).toBeVisible();
  await expect(page.getByTestId("task-review-surface")).toBeFocused();
  const activeTask = () => page.evaluate(() => document.querySelector("[data-testid=task-review-surface]")?.closest("main")?.dataset.taskId ?? null);
  expect(await activeTask()).toBe("preview-task-later");

  // From the last, J wraps to the review that waited longest, and K comes back.
  await page.keyboard.press("j");
  await expect.poll(activeTask).toBe("preview-task-earlier");
  await page.keyboard.press("k");
  await expect.poll(activeTask).toBe("preview-task-later");
});

test("J typed into a text field stays a letter", async ({ page }) => {
  await open(page);
  await page.getByTestId("task-review-surface").focus();
  await page.evaluate(() => {
    const field = document.createElement("textarea");
    field.id = "probe";
    document.querySelector("[data-testid=task-review-surface]")?.append(field);
  });
  await page.locator("#probe").fill("");
  await page.locator("#probe").press("j");
  await expect(page.locator("#probe")).toHaveValue("j");
  await expect(page.locator("main")).toHaveAttribute("data-task-id", "preview-task");
});
