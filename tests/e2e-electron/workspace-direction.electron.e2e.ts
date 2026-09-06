import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, type StaveApp } from "./harness/stave-app";

test("maintained direction and an unsaved draft survive a full application restart", async ({}, testInfo) => {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), "stave-direction-project-"),
  );
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), "stave-direction-profile-"),
  );
  let stave: StaveApp | null = await launchStave({ userDataDir });
  const errors: string[] = [];
  const listen = () =>
    stave!.page.on("pageerror", (error) => errors.push(error.message));
  listen();
  try {
    await stave.page
      .getByTestId("workspace-welcome")
      .getByRole("button", { name: "Open a project" })
      .click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(projectPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(stave.page.getByTestId("workspace-welcome")).toHaveCount(0);
    await stave.page
      .getByRole("button", { name: "New Task", exact: true })
      .click();
    await expect(stave.page.getByTestId("task-start-guide")).toBeVisible();
    await stave.page
      .getByRole("button", { name: "Information", exact: true })
      .click();
    const direction = () =>
      stave!.page.getByRole("region", { name: "Workspace direction" });
    await direction()
      .getByRole("button", { name: "Set direction", exact: true })
      .click();
    await direction()
      .getByLabel("Goal", { exact: true })
      .fill(
        "Deliver the complete workspace, including recovery and usability.",
      );
    await direction()
      .getByLabel("Completion conditions", { exact: true })
      .fill("Restart must preserve goals and drafts.");
    await direction()
      .getByLabel("Confirmed decisions", { exact: true })
      .fill("Keep advanced controls available.");
    await direction()
      .getByLabel("Evidence and plan references", { exact: true })
      .fill(".stave/context/plans/readiness.md");
    await direction()
      .getByLabel("Next action", { exact: true })
      .fill("Measure workspace switching.");
    await direction()
      .getByRole("button", { name: "Save direction", exact: true })
      .click();
    await expect(
      direction().getByRole("button", { name: "Edit direction", exact: true }),
    ).toBeVisible();
    await direction()
      .getByRole("button", { name: "Edit direction", exact: true })
      .click();
    await direction()
      .getByLabel("Next action", { exact: true })
      .fill("Unsaved follow-up: inspect Lens recovery.");
    await expect(
      direction().getByText("Draft saved on this device", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        stave!.page.evaluate(
          async () =>
            (await window.api.persistence!.loadProjectRegistry!())
              .activeProjectPath,
        ),
      )
      .toBe(projectPath);
    await stave.close();
    stave = null;
    stave = await launchStave({ userDataDir });
    listen();
    await expect(stave.page.getByTestId("task-start-guide")).toBeVisible();
    await stave.page
      .getByRole("button", { name: "Review direction & evidence", exact: true })
      .click();
    await expect(direction().getByLabel("Goal", { exact: true })).toHaveValue(
      "Deliver the complete workspace, including recovery and usability.",
    );
    await expect(
      direction().getByLabel("Next action", { exact: true }),
    ).toHaveValue("Unsaved follow-up: inspect Lens recovery.");
    await direction()
      .getByRole("button", { name: "Load saved brief", exact: true })
      .click();
    await expect(
      direction().getByText("Measure workspace switching.", { exact: true }),
    ).toBeVisible();
    await expect(
      direction().getByText("Restart must preserve goals and drafts.", {
        exact: true,
      }),
    ).toBeVisible();
    await stave.page
      .getByRole("button", { name: "Prepare the next step", exact: true })
      .click();
    await expect(
      stave.page.locator('[data-prompt-lexical-editor="true"]'),
    ).toContainText("Measure workspace switching.");
    await stave.page.screenshot({
      path: testInfo.outputPath("workspace-direction-restored.png"),
    });
    expect(errors).toEqual([]);
  } catch (error) {
    await stave?.page.screenshot({
      path: testInfo.outputPath("workspace-direction-failure.png"),
    });
    throw error;
  } finally {
    await stave?.close();
    await rm(projectPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
    await rm(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
});
