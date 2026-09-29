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

  test("Start now in Kickoff shows where the work started and offers to open the task", async ({ page }) => {
    await page.goto("/?stavePreview=kickoff&agent=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Kick off workspace")).toBeVisible();
    await dialog.getByRole("button", { name: "Start now" }).click();
    await expect(dialog.getByRole("button", { name: "Open task" })).toBeVisible();
  });

  test("Kickoff opens with an agent preselected in both phases", async ({ page }) => {
    await page.goto("/?stavePreview=kickoff&agent=1");
    const dialog = page.getByRole("dialog");
    // Source phase shows Who with the agent chosen and a Start now quick path.
    await expect(dialog.getByText("Who")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Start now" })).toBeVisible();
  });

  test("the Agents surface shows all three tabs and switches between them", async ({ page }) => {
    await page.goto("/?stavePreview=agents&surface=1");
    const tabs = page.getByRole("navigation", { name: "Agents views" });
    await expect(tabs.getByRole("button", { name: "Agents", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Playbooks", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "My standards", exact: true })).toBeVisible();
    await expect(page.getByTestId("agents-tab")).toBeVisible();
    await tabs.getByRole("button", { name: "Playbooks", exact: true }).click();
    await expect(page.getByTestId("playbooks-tab")).toBeVisible();
    await tabs.getByRole("button", { name: "My standards", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "My standards" })).toBeVisible();
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
