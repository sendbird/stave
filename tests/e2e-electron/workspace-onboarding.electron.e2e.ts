import { callStaveMcpTool, waitForStaveMcpEndpoint } from "./harness/stave-mcp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("first-run project action and task examples remain keyboard accessible", async ({}, testInfo) => {
  const stave = await launchStave();
  const rendererErrors: string[] = [];
  stave.page.on("pageerror", (error) => rendererErrors.push(error.message));
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-onboarding-"));
  try {
    const welcome = stave.page.getByTestId("workspace-welcome");
    await expect(welcome).toBeVisible();
    await welcome.getByRole("button", { name: "Open a project" }).click();
    await expect(
      stave.page.getByPlaceholder("~/projects/my-app"),
    ).toBeFocused();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(projectPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(welcome).toHaveCount(0);
    await stave.page
      .getByRole("button", { name: "New Task", exact: true })
      .click();
    const guide = stave.page.getByTestId("task-start-guide");
    await expect(guide).toBeVisible();
    await expect(
      guide.getByRole("heading", { name: "What would you like to work on?" }),
    ).toBeVisible();
    const example = guide.getByRole("button", { name: "Use prompt: Build or fix", exact: true });
    await example.focus();
    await stave.page.keyboard.press("Enter");
    const editor = stave.page.locator('[data-prompt-lexical-editor="true"]');
    await expect(editor).toContainText("Help me change this behavior.");
    await expect(editor).toBeFocused();
    await expect(guide.locator("details")).toHaveCount(0);
    await stave.page.screenshot({ path: testInfo.outputPath("first-task.png") });
    await stave.page
      .getByRole("button", { name: "Turn Activity", exact: true })
      .click();
    await expect(
      stave.page.getByRole("tablist", { name: "Task inspection" }),
    ).toHaveCount(0);
    await stave.page
      .getByRole("button", { name: "Task Collaboration", exact: true })
      .click();
    await expect(
      stave.page.getByRole("heading", { name: "Delegated tasks", exact: true }),
    ).toBeVisible();
    await expect(editor).toContainText("Help me change this behavior.");
    const endpoint = await waitForStaveMcpEndpoint(stave.userDataDir);
    const followUp = await callStaveMcpTool(
      endpoint,
      "stave_follow_up_child_task",
      {
        parentTaskId: "missing-parent",
        delegationKey: "missing",
        prompt: "Review the previous result.",
        permissionProfile: "guided",
        expected: {
          childTaskId: "missing-child",
          childWorkspaceId: "missing-workspace",
          attempt: 0,
        },
      },
    );
    expect(followUp.isError).toBe(false);
    expect(followUp.text).toContain('"accepted": false');

    await expect(
      stave.page.getByRole("tablist", { name: "Collaboration sections" }),
    ).toHaveCount(0);
    await expect(
      stave.page.getByRole("navigation", { name: "Task activity shortcuts" }),
    ).toHaveCount(0);
    await stave.page
      .getByRole("button", { name: "Task Results", exact: true })
      .click();
    await expect(
      stave.page.getByRole("region", { name: "Task results" }),
    ).toBeVisible();
    await expect(editor).toContainText("Help me change this behavior.");
    await stave.page
      .getByRole("button", { name: "Turn Activity", exact: true })
      .click();
    await expect(
      stave.page.getByRole("button", { name: "Export report", exact: true }),
    ).toHaveCount(0);
    await stave.page
      .getByRole("button", { name: "Task Collaboration", exact: true })
      .click();
    await stave.page.screenshot({
      path: testInfo.outputPath("task-collaboration.png"),
      animations: "disabled",
    });
    expect(rendererErrors).toEqual([]);
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
