import { expect, test } from "@playwright/test";

/*
 * The Playbooks tab and the Start mission sheet on the dev preview
 * (`?stavePreview=playbooks`), which seeds three starter playbooks and stubs
 * the bridge calls the sheet makes.
 */

test.describe("playbooks", () => {
  test("editing a stage and its sign-off, then saving", async ({ page }) => {
    await page.goto("/?stavePreview=playbooks");
    const editor = page.getByRole("textbox", { name: "Playbook name" });
    await expect(editor).toHaveValue("Slack request → PR");

    await page.getByRole("button", { name: "Edit Build" }).click();
    await page.getByLabel("Instruction").fill("Implement the change in the smallest diff.");
    const buildRow = page.getByRole("listitem", { name: "Stage 3: Build" });
    await buildRow.getByRole("button", { name: "Ask me before this stage" }).click();
    await expect(page.getByText("Custom", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();

    await page.getByRole("button", { name: "Save playbook" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  });

  test("reordering with the keyboard moves a stage and announces it", async ({ page }) => {
    await page.goto("/?stavePreview=playbooks");
    await page.getByRole("button", { name: /^Reorder Verify/ }).focus();
    await page.keyboard.press("Alt+ArrowUp");
    await expect(page.getByRole("listitem", { name: "Stage 3: Verify" })).toBeVisible();
    await expect(page.getByText("Moved Verify to position 3 of 8.")).toBeAttached();
  });

  test("a blank playbook points at the fields it still needs", async ({ page }) => {
    await page.goto("/?stavePreview=playbooks&empty=1");
    await page.getByRole("button", { name: "Blank playbook" }).click();
    await page.getByRole("button", { name: "Save playbook" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "before saving" })).toBeVisible();
    await expect(page.getByText("Purpose is required.")).toBeVisible();
    await expect(page.getByText("Instruction is required.")).toBeVisible();
  });

  test("the Start sheet names its stops and waits for the checks", async ({ page }) => {
    await page.goto("/?stavePreview=playbooks");
    await page.getByRole("button", { name: "Start mission sheet" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Start a mission")).toBeVisible();

    const start = sheet.getByRole("button", { name: /^Start — / });
    await expect(start).toHaveText("Start — asks 3 times");
    await sheet.getByRole("radio", { name: "Only when stuck" }).click();
    await expect(start).toHaveText("Start — runs to the end");

    // Withholding consent from an external effect makes that stage ask.
    await sheet.getByRole("checkbox", { name: /Open draft PR/ }).click();
    await expect(start).toHaveText("Start — asks before Open draft PR");

    // Two uncommitted files need an acknowledgement before Start.
    await expect(start).toBeDisabled();
    await sheet.getByRole("checkbox", { name: "Start on top of these changes" }).click();
    await expect(start).toBeEnabled();
  });
});
