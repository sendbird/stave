import { expect, test } from "@playwright/test";

/*
 * The Agents tab on the dev preview (`?stavePreview=agents`), which seeds one
 * custom agent and a repository with agent files, and stubs the assign calls.
 */

test.describe("agents", () => {
  test("repository agent files are listed with what was not carried over", async ({ page }) => {
    await page.goto("/?stavePreview=agents");
    await page.getByRole("button", { name: /^Release notes/ }).click();
    await expect(page.getByText(".claude/agents/release-notes.md", { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "Read from the file" }).getByText("hooks")).toBeVisible();

    // A clash with a built-in id and an unreadable file are reported, not hidden.
    await page.getByText("2 agent files were not used").click();
    await expect(page.getByText(/a built-in agent already has the id "reviewer"/)).toBeVisible();
    await expect(page.getByText(".cursor/agents/broken.md", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Reviewer/ })).toBeVisible();
  });

  test("assigning shows where the work started and offers to open the task", async ({ page }) => {
    await page.goto("/?stavePreview=agents");
    await page.getByRole("button", { name: /^UI maintainer/ }).click();
    await page.getByRole("textbox", { name: "What should the agent do?" }).fill("Tighten the sidebar spacing.");
    await page.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Started in a new worktree" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open task" })).toBeVisible();
  });
});
