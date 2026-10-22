import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * A task's handoff record is what a provider starting on the task receives
 * ahead of the conversation, and it survives a restart. The constraint is
 * written in the Task panel's Handoff tab; the stand-in CLI reports whether
 * the turn's input carried the record and the constraint (booleans only); a
 * restart shows the same constraint in the tab. A switch to Codex and back is
 * covered by unit tests of the prompt: the stand-in CLI exists for Claude only.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
const CONSTRAINT = "Keep the public API stable";
const MARKERS = ["[Task Handoff Record]", CONSTRAINT];

async function openHandoff(page: Page) {
  const sections = page.getByRole("tablist", { name: "Task sections" });
  // The window restores the rail with the workspace; decide only after it has.
  await expect(page.locator('[data-prompt-lexical-editor="true"]')).toBeVisible({ timeout: 30_000 });
  if (!(await sections.isVisible())) {
    await page.getByRole("button", { name: "Task", exact: true }).click();
  }
  await sections.getByRole("tab", { name: /^Handoff/ }).click();
  await expect(page.getByTestId("task-handoff")).toBeVisible({ timeout: 20_000 });
}

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

test("the handoff record reaches a starting provider ahead of the conversation and survives a restart", async ({}, testInfo) => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-handoff-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(fakeDir);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Handoff record validation.\n");
  execFileSync("git", ["add", "."], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(
    wrapper,
    `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' FAKE_CLAUDE_PROMPT_MARKERS='${MARKERS.join(",")}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`,
  );
  await chmod(wrapper, 0o755);
  const env = { STAVE_CLAUDE_CLI_PATH: wrapper };

  const first = await launchStave({ userDataDir: profileDir, env });
  try {
    const page = first.page;
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

    await openHandoff(page);
    const handoff = page.getByTestId("task-handoff");
    await handoff.getByRole("button", { name: "Edit", exact: true }).click();
    await handoff.getByLabel("Approved decisions").fill(`- ${CONSTRAINT}`);
    await handoff.getByRole("button", { name: "Save", exact: true }).click();
    await expect(handoff.getByText(`- ${CONSTRAINT}`)).toBeVisible();
    await expect(handoff.getByText(/by you/)).toBeVisible();

    const composer = page.locator('[data-prompt-lexical-editor="true"]');
    await composer.click();
    await composer.fill("Start on the search feature");
    await composer.press("Enter");
    await expect.poll(async () => (await readTurns(fakeDir)).at(-1)?.markers ?? null, { timeout: 60_000 }).toEqual({
      "[Task Handoff Record]": true,
      [CONSTRAINT]: true,
    });
    // The window saves the conversation on its own schedule; wait before the kill.
    await expect.poll(async () => page.evaluate(async (ids) =>
      (await window.api.persistence!.loadTaskMessages!({ ...ids, limit: 10 })).page?.totalCount ?? 0, { workspaceId, taskId }),
    { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  } finally {
    await first.close();
  }

  const second = await launchStave({ userDataDir: profileDir, env });
  const errors: string[] = [];
  second.page.on("pageerror", (error) => errors.push(error.message));
  try {
    const page = second.page;
    await openHandoff(page);
    const handoff = page.getByTestId("task-handoff");
    await expect(handoff.getByText(`- ${CONSTRAINT}`)).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("handoff-after-restart.png") });
    expect(errors).toEqual([]);
  } finally {
    await second.close();
    await rm(directory, { recursive: true, force: true });
  }
});
