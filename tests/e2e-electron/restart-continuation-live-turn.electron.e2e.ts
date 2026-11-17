import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * Reloading the renderer while the host still runs a task's turn must not
 * read as an app restart: no "Continue interrupted work?" notice, and no
 * second turn beside the running one. The stand-in CLI holds the turn until
 * the spec releases it and reports (booleans only) whether any turn's input
 * carried the continuation instruction.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
const CONTINUATION_MARKER = "The previous turn was cut short";

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

test("a renderer reload while the host turn runs offers no continuation and starts no second turn", async () => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-restart-live-turn-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(fakeDir);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Restart continuation validation.\n");
  execFileSync("git", ["add", "."], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(
    wrapper,
    `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' FAKE_CLAUDE_PROMPT_MARKERS='${CONTINUATION_MARKER}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`,
  );
  await chmod(wrapper, 0o755);

  const stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper } });
  try {
    const page = stave.page;
    await page.getByTestId("workspace-welcome").getByRole("button", { name: "Open repository", exact: true }).click();
    await page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    const workspaceId = await page.evaluate(async () => (await window.api.persistence!.listWorkspaces!()).rows[0]!.id);
    await expect.poll(async () => page.evaluate(async (id) =>
      (await window.api.persistence!.loadWorkspaceShell!({ workspaceId: id })).shell?.activeTaskId ?? "", workspaceId)).not.toBe("");
    const taskId = await page.evaluate(async (id) =>
      (await window.api.persistence!.loadWorkspaceShell!({ workspaceId: id })).shell!.activeTaskId, workspaceId);

    // The task's turn starts on the host and holds.
    const composer = page.locator('[data-prompt-lexical-editor="true"]');
    await composer.click();
    await composer.fill("[hold] Keep working on the export");
    await composer.press("Enter");
    const liveTaskTurns = () => page.evaluate(async (id) => {
      const live = await window.api.provider!.listLiveTurns!();
      return live.ok ? live.turns.filter((turn) => turn.taskId === id).map((turn) => turn.turnId) : null;
    }, taskId);
    await expect.poll(liveTaskTurns, { timeout: 60_000 }).toHaveLength(1);
    const [runningTurnId] = (await liveTaskTurns())!;

    // Reload the renderer only: the host process and its turn keep running.
    await page.reload();
    await expect(page.locator('[data-prompt-lexical-editor="true"]')).toBeVisible({ timeout: 60_000 });
    // Give startup recovery time to inspect the durable turns.
    await page.waitForTimeout(5_000);
    await expect(page.getByRole("dialog", { name: "Continue interrupted work?" })).toHaveCount(0);
    expect(await liveTaskTurns()).toEqual([runningTurnId]);
    expect((await readTurns(fakeDir)).some((turn) => turn.markers?.[CONTINUATION_MARKER])).toBe(false);

    await writeFile(path.join(fakeDir, "release"), "");
    await expect.poll(liveTaskTurns, { timeout: 60_000 }).toHaveLength(0);
    expect((await readTurns(fakeDir)).some((turn) => turn.markers?.[CONTINUATION_MARKER])).toBe(false);
  } finally {
    await writeFile(path.join(fakeDir, "release"), "").catch(() => {});
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});
