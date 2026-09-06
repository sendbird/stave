import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("result review survives notification cleanup and renderer restart, with explicit undo", async ({}, testInfo) => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-review-"));
  await mkdir(path.join(projectPath, "docs"));
  await writeFile(
    path.join(projectPath, "docs/result.md"),
    "Original run output",
  );
  const stave = await launchStave();
  const errors: string[] = [];
  stave.page.on("pageerror", (error) => errors.push(error.message));
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
    const workspaceId = await stave.page.evaluate(async () => {
      const response = await window.api.persistence!.listWorkspaces!();
      return response.rows[0]!.id;
    });
    await expect
      .poll(async () =>
        stave.page.evaluate(async (workspaceId) => {
          const response = await window.api.persistence!
            .loadWorkspaceShellSummary!({ workspaceId });
          return response.summary?.tasks.length ?? 0;
        }, workspaceId),
      )
      .toBeGreaterThan(0);
    const scope = await stave.page.evaluate(
      async ({ projectPath, workspaceId }) => {
        const response = await window.api.persistence!
          .loadWorkspaceShellSummary!({ workspaceId });
        const taskId = response.summary!.tasks[0]!.id;
        const scope = {
          projectPath,
          workspaceId,
          taskId,
          turnId: "review-turn",
        };
        const inserted = await window.api.persistence!.createNotification!({
          notification: {
            ...scope,
            id: "review-notification",
            kind: "task.turn_completed",
            title: "Review regression",
            body: "The saved result survives notification cleanup.",
            projectName: "Review project",
            workspaceName: "Review workspace",
            taskTitle: "Review regression",
            providerId: "codex",
            action: null,
            payload: {
              resultEvidence: {
                messageId: "captured-answer",
                providerId: "codex",
                model: "Test model",
                modelResolution: {
                  selectedProviderId: "codex",
                  selectedModel: "Routed model",
                  source: "heuristic",
                  rationale: "A small scoped edit fits this route.",
                  confidence: 0.8,
                  taskType: "quick_edit",
                },
                answer: "The captured answer remains attached to this run.",
                answerTruncated: false,
                files: ["docs/result.md"],
                filesTruncated: false,
                snapshots: [
                  {
                    filePath: "docs/result.md",
                    oldContent: "Before this run",
                    newContent: "Original run output",
                    status: "accepted",
                    truncated: false,
                  },
                ],
                snapshotsTruncated: false,
              },
            },
            readAt: null,
          },
        });
        if (!inserted.ok) throw new Error("Notification was not persisted");
        await window.api.persistence!.markNotificationRead!({
          id: "review-notification",
        });
        await window.api.persistence!.clearNotificationHistory!();
        window.dispatchEvent(new Event("focus"));
        return scope;
      },
      { projectPath, workspaceId: workspaceId },
    );
    const results = stave.page.getByRole("region", { name: "Task results" });
    const resultsShortcut = stave.page.getByRole("button", {
      name: "Task Results",
      exact: true,
    });
    await expect(results).toHaveCount(0);
    await expect(
      stave.page.getByRole("navigation", { name: "Task activity shortcuts" }),
    ).toHaveCount(0);
    await resultsShortcut.click();
    await expect(
      stave.page.getByRole("tablist", { name: "Task inspection" }),
    ).toHaveCount(0);
    const editor = stave.page.locator('[data-prompt-lexical-editor="true"]');
    await editor.fill("Keep my existing note.");
    await results
      .getByRole("button", { name: "Request changes", exact: true })
      .click();
    await expect(editor).toContainText("Keep my existing note.");
    await expect(editor).toContainText("Requested changes:");
    await expect(results.getByRole("status")).toContainText(
      "Added to your draft",
    );
    await expect(
      results.getByText("· Not reviewed", { exact: true }),
    ).toBeVisible();
    await expect(
      results.getByText("The saved result survives notification cleanup."),
    ).toBeVisible();
    await expect(
      results.getByText("The captured answer remains attached to this run.", {
        exact: true,
      }),
    ).toBeVisible();
    await results.getByText("Execution reference", { exact: true }).click();
    await expect(
      results.getByText("A small scoped edit fits this route.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      results.getByText("Codex · Routed model", { exact: true }),
    ).toBeVisible();
    await expect(
      results.getByText("docs/result.md", { exact: true }),
    ).toBeVisible();
    await results
      .locator("summary")
      .filter({ hasText: /^docs\/result\.md$/ })
      .focus();
    await stave.page.keyboard.press("Enter");
    await expect(
      results.getByLabel("After: docs/result.md", { exact: true }),
    ).toHaveText("Original run output");
    await writeFile(
      path.join(projectPath, "docs/result.md"),
      "Changed after review",
    );
    await results
      .getByRole("button", { name: "Mark reviewed", exact: true })
      .click();
    await expect(
      results.getByRole("button", { name: "Reopen review", exact: true }),
    ).toBeVisible();
    await stave.page.reload();
    // Wait for the restored task before inspecting its persisted panel layout.
    await expect(stave.page.getByTestId("task-start-guide")).toBeVisible();
    await stave.page
      .getByRole("button", { name: "Turn Activity", exact: true })
      .click();
    await expect(
      stave.page.getByRole("heading", { name: "Turn Activity", exact: true }),
    ).toBeVisible();
    await resultsShortcut.click();
    await expect(
      results.getByRole("button", { name: "Reopen review", exact: true }),
    ).toBeVisible();
    await results
      .getByRole("button", { name: "Reopen review", exact: true })
      .click();
    await expect(
      results.getByRole("button", { name: "Mark reviewed", exact: true }),
    ).toBeVisible();
    await expect(
      results.getByText("The captured answer remains attached to this run.", {
        exact: true,
      }),
    ).toBeVisible();
    await results
      .locator("summary")
      .filter({ hasText: /^docs\/result\.md$/ })
      .click();
    await expect(
      results.getByLabel("After: docs/result.md", { exact: true }),
    ).toHaveText("Original run output");
    const wrong = await stave.page.evaluate(
      (scope) =>
        window.api.persistence!.setResultReviewed!({
          ...scope,
          taskId: "another-task",
          reviewed: true,
        }),
      scope,
    );
    expect(wrong).toEqual({ ok: false, result: null });
    await stave.page.screenshot({
      path: testInfo.outputPath("task-result-review.png"),
    });
    await stave.page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    await stave.page.setViewportSize({ width: 900, height: 720 });
    // The user's selected destination survives the responsive shell remount.
    await expect(results).toBeVisible();
    await results
      .locator("summary")
      .filter({ hasText: /^docs\/result\.md$/ })
      .click();
    await results
      .getByLabel("After: docs/result.md", { exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await results.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await results.screenshot({
      path: testInfo.outputPath("task-result-review-light-narrow.png"),
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  } catch (error) {
    await stave.page.screenshot({
      path: testInfo.outputPath("review-failure.png"),
    });
    await testInfo.attach("renderer-state", {
      body: JSON.stringify({
        errors,
        text: await stave.page.locator("body").innerText(),
      }),
      contentType: "application/json",
    });
    throw error;
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
