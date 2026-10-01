import { expect, test } from "@playwright/test";

test("managed parent answers the exact child approval and question without changing its selection", async ({ page }) => {
  await page.goto("/?stavePreview=collaboration&managed=1&attention=1");
  await expect(page.getByRole("button", { name: "Review approval", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Review approval", exact: true }).first().click();
  const controls = page.getByRole("region", { name: "Controls for Implementation", exact: true });
  await expect(controls.getByRole("heading", { name: "Approval requested", exact: true })).toBeVisible();
  await expect(controls.getByText("Run first verification command", { exact: true })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Open task", exact: true })).toHaveCount(0);
  await expect(controls.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await controls.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.body.dataset.attentionResponses ?? "[]"))).toEqual([
    { kind: "approval", workspaceId: "attention-workspace", taskId: "attention-child", requestId: "first", approved: true },
  ]);
  await page.getByRole("button", { name: "Answer question", exact: true }).click();
  await expect(controls.getByRole("heading", { name: "Question", exact: true })).toBeVisible();
  await controls.getByText("Current branch", { exact: true }).click();
  await expect(controls.getByRole("radio", { name: /Current branch/ })).toBeChecked();
  await controls.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.body.dataset.attentionResponses ?? "[]").length)).toBe(2);
  const answer = await page.evaluate(() => JSON.parse(document.body.dataset.attentionResponses!)[1]);
  expect(answer).toMatchObject({ kind: "user-input", workspaceId: "attention-workspace", taskId: "attention-child", requestId: "question", answers: { "Which branch should receive the result?": "Current branch" } });
  await expect(page.getByRole("status").filter({ hasText: /Managed task/ })).toBeVisible();
  await expect(page.getByLabel("Selected task", { exact: true })).toHaveText("preview-parent");
  await expect(page.getByLabel("Selected workspace", { exact: true })).toHaveText("preview-workspace");
});

test("replacement message and child turn cannot take a response prepared for another identity", async ({ page }) => {
  await page.goto("/?stavePreview=collaboration&managed=1&attention=1");
  await page.getByRole("button", { name: "Review approval", exact: true }).first().click();
  await page.getByRole("button", { name: "Replace request message", exact: true }).click();
  const controls = page.getByRole("region", { name: "Controls for Implementation", exact: true });
  await expect(controls.getByText(/answered, expired, or belongs to another turn/)).toBeVisible();
  await expect(controls.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close request", exact: true }).click();
  await page.getByRole("button", { name: "Review approval", exact: true }).nth(1).click();
  await expect(controls.getByText("Run second verification command", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start another child turn", exact: true }).click();
  await expect(controls.getByText(/answered, expired, or belongs to another turn/)).toBeVisible();
  await expect(controls.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(document.body.dataset.attentionResponses ?? "[]"))).toEqual([]);
  await expect(page.getByLabel("Selected task", { exact: true })).toHaveText("preview-parent");
  await expect(page.getByLabel("Selected workspace", { exact: true })).toHaveText("preview-workspace");
});

test("parent composer answers a child's approval, attributed to the child, without changing its selection", async ({ page }) => {
  await page.goto("/?stavePreview=collaboration&managed=1&attention=1");
  const slot = page.getByRole("region", { name: "Requests from delegated tasks", exact: true });
  await expect(slot.getByText("Implementation", { exact: true })).toBeVisible();
  await expect(slot.getByText("Run first verification command", { exact: true })).toBeVisible();
  await expect(slot.getByText("+2 more", { exact: true })).toBeVisible();
  await slot.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.body.dataset.attentionResponses ?? "[]"))).toEqual([
    { kind: "approval", workspaceId: "attention-workspace", taskId: "attention-child", requestId: "first", approved: true },
  ]);
  // The answered request leaves the slot; the next child request takes its place.
  await expect(slot.getByText("Which branch should receive the result?", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Selected task", { exact: true })).toHaveText("preview-parent");
  await expect(page.getByLabel("Selected workspace", { exact: true })).toHaveText("preview-workspace");
});
