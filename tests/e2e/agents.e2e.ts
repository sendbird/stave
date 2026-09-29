import { expect, test } from "@playwright/test";

/*
 * The Agents tab on the dev preview (`?stavePreview=agents`), which seeds one
 * custom agent and a repository with agent files, and stubs the assign calls.
 */

test.describe("agents", () => {
  test("repository agent files are listed with what was not carried over", async ({ page }) => {
    await page.goto("/?stavePreview=agents");
    await page.getByRole("button", { name: /^Release notes/ }).click();
    await expect(page.getByText("From repository · .claude/agents/release-notes.md", { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "Read from the file" }).getByText("hooks")).toBeVisible();

    // A clash with a built-in id and an unreadable file are reported, not hidden.
    await page.getByText("2 agent files were not used").filter({ visible: true }).click();
    await expect(page.getByText(/a built-in agent already has the id "reviewer"/).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(".cursor/agents/broken.md", { exact: true }).filter({ visible: true })).toBeVisible();
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

  test("Assign to agent from an issue prefills the ticket and offers only main agents", async ({ page }) => {
    await page.goto("/?stavePreview=agents&sheet=1");
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Assign to agent")).toBeVisible();
    await expect(sheet.getByRole("textbox", { name: "What should the agent do?" })).toHaveValue("Work on tracker ticket WEB-418.");
    await sheet.getByRole("combobox", { name: "Agent" }).click();
    await expect(page.getByRole("option", { name: "Implementer" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Reviewer" })).toHaveCount(0);
  });

  test("export shows the file and writes it only on request", async ({ page }) => {
    await page.goto("/?stavePreview=agents");
    await page.getByRole("button", { name: /^UI maintainer/ }).click();
    const exportSection = page.getByRole("region", { name: "Export" });
    await expect(exportSection.getByText(".claude/agents/ui-maintainer.md")).toBeVisible();
    await exportSection.getByRole("button", { name: "Write to repository" }).click();
    await expect(exportSection.getByRole("status")).toContainText("Wrote .claude/agents/ui-maintainer.md");
    // Switching the format shows the other file without writing it.
    await exportSection.getByRole("combobox", { name: "Export as" }).click();
    await page.getByRole("option", { name: "Codex agent file" }).click();
    await expect(exportSection.getByText(".codex/agents/ui-maintainer.toml")).toBeVisible();
  });
});
