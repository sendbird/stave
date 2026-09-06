import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("the global library opens a project and creates an editable research task without sending it", async ({}, testInfo) => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-library-"));
  const stave = await launchStave();
  const errors: string[] = [];
  stave.page.on("pageerror", error => errors.push(error.message));
  const openLibrary = async () => {
    await stave.page
      .getByRole("button", { name: "Open Stave menu" })
      .click();
    await stave.page
      .getByRole("menuitem", { name: /Command Palette/ })
      .click();
    const commandPalette = stave.page.getByRole("dialog", {
      name: "Command Palette",
    });
    await commandPalette
      .getByPlaceholder("Find a command, task, workspace, or setting…")
      .fill("Open Library");
    await commandPalette
      .getByText("Open Library", { exact: true })
      .click();
  };
  try {
    await openLibrary();
    await expect(stave.page.getByRole("heading", { name: "Macros · reusable instructions" })).toBeVisible();
    await stave.page.getByRole("button", { name: "Open a project", exact: true }).click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(projectPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(stave.page.getByTestId("workspace-welcome")).toHaveCount(0);
    await openLibrary();
    await stave.page.getByLabel("Find a workflow, macro, or preset").fill("Research a question");
    await stave.page.getByText("Research a question", { exact: true }).click();
    await stave.page.getByRole("button", { name: "Start a task draft", exact: true }).click();
    const editor = stave.page.locator('[data-prompt-lexical-editor="true"]');
    await expect(editor).toContainText("Research this question:");
    await expect(stave.page.getByRole("heading", { name: "Library", exact: true })).toHaveCount(0);
    await expect(stave.page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    await stave.page.screenshot({ path: testInfo.outputPath("research-task-draft.png") });
    expect(errors).toEqual([]);
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
