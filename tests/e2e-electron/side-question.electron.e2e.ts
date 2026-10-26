import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * A side question asked while the task's turn runs is answered in its panel
 * and leaves the task's transcript and the composer's draft as they were. The
 * stand-in CLI holds the task's turn until the spec releases it, answers the
 * side question at once, and reports (booleans only) that the side question's
 * input carried the live activity.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
const MARKERS = ["[Side Question]", "[Current Activity]", "A turn is running."];
const DRAFT = "Next: add a filename prompt";

async function readTurns(fakeDir: string) {
  try {
    return (await readFile(path.join(fakeDir, "turns.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { markers?: Record<string, boolean> });
  } catch {
    return [];
  }
}

test("a side question during a running turn leaves the transcript and the next input unchanged", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-side-question-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(fakeDir);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Side question validation.\n");
  execFileSync("git", ["add", "."], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(
    wrapper,
    `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' FAKE_CLAUDE_PROMPT_MARKERS='${MARKERS.join(",")}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`,
  );
  await chmod(wrapper, 0o755);

  const stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper } });
  try {
    const page = stave.page;
    await page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a repository" }).click();
    await page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    const workspaceId = await page.evaluate(async () => (await window.api.persistence!.listWorkspaces!()).rows[0]!.id);
    await expect.poll(async () => page.evaluate(async (id) =>
      (await window.api.persistence!.loadWorkspaceShell!({ workspaceId: id })).shell?.activeTaskId ?? "", workspaceId)).not.toBe("");
    const taskId = await page.evaluate(async (id) =>
      (await window.api.persistence!.loadWorkspaceShell!({ workspaceId: id })).shell!.activeTaskId, workspaceId);

    // The task's turn starts and holds.
    const composer = page.locator('[data-prompt-lexical-editor="true"]');
    await composer.click();
    await composer.fill("[hold] Start the export");
    await composer.press("Enter");
    await expect.poll(async () => (await readTurns(fakeDir)).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    // The next message, written while the turn runs.
    await composer.click();
    await composer.fill(DRAFT);
    const conversation = page.getByTestId(`conversation-scroll-${taskId}`);
    await expect(conversation).toContainText("[hold] Start the export");

    // Activity's button opens the side question beside the conversation.
    const sections = page.getByRole("tablist", { name: "Task sections" });
    if (!(await sections.isVisible())) {
      await page.getByRole("button", { name: "Task", exact: true }).click();
    }
    await sections.getByRole("tab", { name: /^Activity/ }).click();
    await page.getByTestId("side-chat-activity-button").click();
    const panel = page.getByTestId("side-chat");
    await expect(panel).toBeVisible();
    const field = panel.getByRole("textbox", { name: "Side question" });
    await field.fill("What is it doing right now?");
    await field.press("Enter");
    await expect(panel.getByTestId("side-chat-answer")).toContainText("Done.", { timeout: 60_000 });
    await page.screenshot({ path: testInfo.outputPath("side-question-answered.png") });

    // The side question went to the provider with the live activity, as a query of its own
    // (the task's turn, and the task's title suggestion, are the other inputs).
    const sideQuestions = async () =>
      (await readTurns(fakeDir)).filter((turn) => turn.markers?.["[Side Question]"]);
    const turns = await readTurns(fakeDir);
    expect(turns[0]?.markers?.["[Side Question]"]).toBe(false);
    expect(await sideQuestions()).toHaveLength(1);
    expect(turns.at(-1)?.markers).toEqual({ "[Side Question]": true, "[Current Activity]": true, "A turn is running.": true });
    // Nothing reached the transcript or the next input: the task's turn has not answered yet.
    await expect(conversation).not.toContainText("What is it doing right now?");
    await expect(conversation).not.toContainText("Done.");
    await expect(composer).toHaveText(DRAFT);

    // While the turn holds, Review says the task still runs, and the side question stays open over it.
    await page.getByTestId("pane-header-mode-switch").getByRole("button", { name: /^Review/ }).click();
    const review = page.getByTestId("task-review-surface");
    await expect(review.getByTestId("review-task-status")).toContainText("This task is still running.");
    await expect(review.getByTestId("side-chat")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("side-question-over-review.png") });
    await review.getByTestId("review-back-to-conversation").click();
    await expect(review).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(composer).toHaveText(DRAFT);

    // The task's turn ends on its own, still with only its own reply.
    await writeFile(path.join(fakeDir, "release"), "");
    await expect(conversation).toContainText("Done.", { timeout: 60_000 });
    await expect(conversation.getByText("Done.", { exact: true })).toHaveCount(1);
    await expect(conversation).not.toContainText("What is it doing right now?");
    await expect(composer).toHaveText(DRAFT);

    // Copy to composer puts the answer, quoted, below the draft for the user to send.
    await panel.getByRole("button", { name: "Copy to composer" }).click();
    await expect(composer).toContainText(DRAFT);
    await expect(composer).toContainText("> Done.");

    // The composer's Side question control opens the same panel, focused on its question.
    await panel.getByRole("button", { name: "Close side question" }).click();
    await expect(panel).toHaveCount(0);
    await page.getByTestId("composer-side-question").click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "Side question" })).toBeFocused();
    await expect(composer).toContainText(DRAFT);
    await page.screenshot({ path: testInfo.outputPath("side-question-from-composer.png") });

    // The composer's `/aside` asks in the panel and sends nothing to the task.
    await composer.click();
    await composer.fill("/aside Why the export?");
    await composer.press("Enter");
    await expect(panel).toContainText("Why the export?");
    // The first side question stays above the follow-up, in the same panel.
    await expect(panel.getByTestId("side-chat-question")).toHaveText(["What is it doing right now?", /^Why the export\?/]);
    await expect(panel.getByTestId("side-chat-answer").last()).toContainText("Done.", { timeout: 60_000 });
    await expect.poll(async () => (await sideQuestions()).length).toBe(2);
    await expect(conversation).not.toContainText("Why the export?");
    await expect(conversation.getByText("Done.", { exact: true })).toHaveCount(1);
  } finally {
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});
