import { expect, test, type Page } from "@playwright/test";

async function openReview(page: Page) {
  await page.goto("/?stavePreview=projects&taskIntegration=1");
  await page.getByText("Record or review integration", { exact: true }).click();
  await page.getByRole("combobox", { name: "Integration owner", exact: true }).click();
  await page.getByRole("option", { name: "Settings form", exact: true }).click();
  await page.getByRole("textbox", { name: "Combined result", exact: true }).fill("API and form behavior reviewed together.");
  await page.getByRole("textbox", { name: "Acceptance criteria (one per line)", exact: true }).fill("Form and API use the same contract");
  await page.getByRole("checkbox", { name: "Form and API use the same contract", exact: true }).check();
  await page.getByRole("textbox", { name: "Evidence 1", exact: true }).fill("Combined walkthrough");
  await page.getByRole("textbox", { name: "Evidence reference 1", exact: true }).fill("review-42");
}

test("linking dependencies and an explicit review accept the combined result", async ({ page }) => {
  await page.goto("/?stavePreview=projects&taskIntegration=1");
  await expect(page.getByText("Integration not recorded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Link a task", exact: true }).click();
  await page.getByRole("combobox", { name: "Task", exact: true }).click();
  await page.getByRole("option", { name: "Combined behavior review · Integration", exact: true }).click();
  await page.getByRole("checkbox", { name: "Settings form", exact: true }).check();
  await page.getByRole("button", { name: "Link task", exact: true }).click();
  await expect(page.getByText("Depends on Settings form", { exact: true })).toBeVisible();
  await page.getByText("Record or review integration", { exact: true }).click();
  await page.getByRole("combobox", { name: "Integration owner", exact: true }).click();
  await page.getByRole("option", { name: "Combined behavior review", exact: true }).click();
  await page.getByRole("textbox", { name: "Combined result", exact: true }).fill("API and form behavior reviewed together.");
  await page.getByRole("textbox", { name: "Acceptance criteria (one per line)", exact: true }).fill("Form and API use the same contract");
  await page.getByRole("checkbox", { name: "Form and API use the same contract", exact: true }).check();
  await page.getByRole("textbox", { name: "Evidence 1", exact: true }).fill("Combined walkthrough");
  await page.getByRole("textbox", { name: "Evidence reference 1", exact: true }).fill("review-42");
  await expect(page.getByRole("button", { name: "Accept combined result", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save integration report", exact: true }).click();
  await expect(page.getByText("Integration needs review", { exact: true })).toBeVisible();
  await page.getByText("Record or review integration", { exact: true }).click();
  await page.getByRole("checkbox", { name: "I reviewed this evidence for the combined result", exact: true }).check();
  await page.getByRole("button", { name: "Accept combined result", exact: true }).click();
  await expect(page.getByText("Integration accepted by you", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs you", { exact: true })).toBeVisible();
  await page.getByText("Record or review integration", { exact: true }).click();
  await page.getByRole("checkbox", { name: "I reviewed this evidence for the combined result", exact: true }).check();
  await page.getByRole("textbox", { name: "Evidence reference 1", exact: true }).fill("updated-review-43");
  await expect(page.getByRole("checkbox", { name: "I reviewed this evidence for the combined result", exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Accept combined result", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "I reviewed this evidence for the combined result", exact: true }).check();
  await page.getByRole("textbox", { name: "Acceptance criteria (one per line)", exact: true }).fill("Updated contract criterion");
  await expect(page.getByRole("checkbox", { name: "I reviewed this evidence for the combined result", exact: true })).not.toBeChecked();
});

test("a draft review keeps its snapshot until changed work is checked again", async ({ page }) => {
  await openReview(page);
  await page.getByRole("checkbox", { name: "I reviewed this evidence for the combined result", exact: true }).check();
  await expect(page.getByRole("button", { name: "Accept combined result", exact: true })).toBeEnabled();
  const ui = page.getByRole("listitem").filter({ has: page.getByText("Settings form", { exact: true }) });
  await ui.getByRole("button", { name: "Dependencies", exact: true }).click();
  await page.getByRole("checkbox", { name: "API contract", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save dependencies", exact: true }).click();
  await expect(page.getByText(/Linked work changed while this review was open/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Combined result", exact: true })).toHaveValue("API and form behavior reviewed together.");
  await expect(page.getByRole("button", { name: "Accept combined result", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Review current work", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "I reviewed this evidence for the combined result", exact: true })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "I reviewed this evidence for the combined result", exact: true }).check();
  await page.getByRole("button", { name: "Accept combined result", exact: true }).click();
  await expect(page.getByText("Integration accepted by you", { exact: true })).toBeVisible();
});
