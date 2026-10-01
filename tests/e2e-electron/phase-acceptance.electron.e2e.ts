import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("schedule controls persist without executing and returning from Schedules preserves the task draft", async ({}, testInfo) => {
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "stave-acceptance-"));
  const stave = await launchStave();
  try {
    await stave.page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a project" }).click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await stave.page.getByRole("button", { name: "New Task", exact: true }).click();
    const editor = stave.page.locator('[data-prompt-lexical-editor="true"]');
    await editor.fill("Draft a document describing the release changes.");
    const input = {
      name: "Document review", prompt: "Review the release document.", enabled: false,
      schedule: { every: 24, unit: "hours" as const },
      runtime: { provider: "codex" as const, model: "gpt-6", effort: "medium" as const, fileAccess: "workspace-write" as const, approvalPolicy: "untrusted" as const, networkAccess: false, webSearch: "cached" as const },
      trustPolicy: "review-required" as const, maxConcurrentRuns: 1,
      informationReferences: [],
    };
    const automation = await stave.page.evaluate(async ({ input, projectPath: repositoryPath }) => {
      const { rows } = await window.api.persistence!.listWorkspaces!();
      const result = await window.api.automations!.create!({ ...input, environment: {
        kind: "repository", workspaceId: rows[0]!.id, path: repositoryPath,
        repositoryPath, label: "Document project",
      }});
      if (!result.ok || !result.automation) throw new Error(result.message ?? "Automation creation failed");
      return result.automation;
    }, { input, projectPath: repositoryPath });
    await stave.page.getByRole("button", { name: "Open Stave menu" }).click();
    await stave.page.getByRole("menuitem", { name: /Command Palette/ }).click();
    const palette = stave.page.getByRole("dialog", { name: "Command Palette" });
    await palette.getByPlaceholder("Find a command, task, workspace, or setting…").fill("Open Schedules");
    await palette.getByText("Open Schedules", { exact: true }).click();
    await expect(stave.page.getByText(/Runs while Stave is open/)).toBeVisible();
    await stave.page.getByText("Document review", { exact: true }).first().click();
    await stave.page.getByRole("button", { name: "Enable schedule", exact: true }).click();
    await expect(stave.page.getByRole("button", { name: "Pause schedule", exact: true })).toBeVisible();
    await expect(stave.page.getByText("Next run", { exact: true })).toBeVisible();
    await stave.page.screenshot({ path: testInfo.outputPath("schedule-enabled.png") });
    await stave.page.getByRole("button", { name: "Pause schedule", exact: true }).click();
    await expect(stave.page.getByRole("button", { name: "Enable schedule", exact: true })).toBeVisible();
    const state = await stave.page.evaluate(() => window.api.automations!.list!());
    expect(state.snapshot.automations.find(item => item.id === automation.id)?.enabled).toBe(false);
    expect(state.snapshot.runs).toHaveLength(0);
    await stave.page.getByTitle("Close Schedules", { exact: true }).click();
    await expect(editor).toContainText("Draft a document describing the release changes.");
  } finally {
    await stave.close();
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
