import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * Turn history survives a restart. A turn fails (the stand-in CLI's `[fail]`
 * marker) and the repository's `turn.completed` check fails after it; a newer
 * turn then finishes. After Stave restarts on the same profile, Activity opens
 * the newest turn's record, and the earlier turn, found in the Turn picker by
 * its id, still shows its failure and its check result under that id.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");

async function readTurns(page: Page, ids: { workspaceId: string; taskId: string }) {
  return page.evaluate(async ({ workspaceId, taskId }) => {
    const response = await window.api.persistence!.listTaskTurnHistory!({ workspaceId, taskId });
    return response.ok
      ? response.page.turns.map((turn) => ({ id: turn.id, outcome: turn.outcome, checks: turn.digest?.checks ?? null }))
      : [];
  }, ids);
}

async function openActivity(page: Page) {
  const sections = page.getByRole("tablist", { name: "Task sections" });
  if ((await sections.count()) === 0) {
    await page.getByRole("button", { name: "Task", exact: true }).click();
  }
  await sections.getByRole("tab", { name: /^Activity/ }).click();
}

test("an earlier turn's failure and check result open under its id after a newer turn and a restart", async ({}, testInfo) => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-turn-history-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  const profileDir = path.join(directory, "profile");
  await mkdir(path.join(repositoryPath, ".stave"), { recursive: true });
  await mkdir(fakeDir);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Turn history validation.\n");
  await writeFile(
    path.join(repositoryPath, ".stave", "scripts.json"),
    `${JSON.stringify({
      version: 2,
      actions: { "unit-tests": { commands: ["echo 2 tests failed && exit 3"], target: "workspace" } },
      hooks: { "turn.completed": [{ ref: "unit-tests", kind: "action", blocking: true }] },
    }, null, 2)}\n`,
  );
  execFileSync("git", ["add", "."], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`);
  await chmod(wrapper, 0o755);
  const env = { STAVE_CLAUDE_CLI_PATH: wrapper };

  let ids = { workspaceId: "", taskId: "" };
  let failedTurnId = "";
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
    ids = { workspaceId, taskId };

    const composer = page.locator('[data-prompt-lexical-editor="true"]');
    await composer.click();
    await composer.fill("[fail] Break the build");
    await composer.press("Enter");
    // The turn fails, then Stave runs the repository's check and records its failure on that turn.
    await expect.poll(() => readTurns(page, ids), { timeout: 90_000 }).toEqual([
      { id: expect.any(String), outcome: "failed", checks: "fail" },
    ]);
    failedTurnId = (await readTurns(page, ids))[0]!.id;

    await composer.click();
    await composer.fill("A newer turn");
    await composer.press("Enter");
    await expect.poll(async () => (await readTurns(page, ids)).map((turn) => turn.outcome), { timeout: 90_000 })
      .toEqual(["completed", "failed"]);
    // The window saves the conversation on its own schedule; the record reads
    // the saved request, so wait for both requests and replies before the kill.
    await expect.poll(async () => page.evaluate(async ({ workspaceId, taskId }) =>
      (await window.api.persistence!.loadTaskMessages!({ workspaceId, taskId, limit: 10 })).page?.totalCount ?? 0, ids),
    { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
  } finally {
    await first.close();
  }

  const second = await launchStave({ userDataDir: profileDir, env });
  const errors: string[] = [];
  second.page.on("pageerror", (error) => errors.push(error.message));
  try {
    const page = second.page;
    await openActivity(page);
    // After a restart nothing is in memory: the newest turn opens as a record.
    await expect(page.getByTestId("turn-record").locator("[data-turn-id]")).not.toHaveAttribute("data-turn-id", failedTurnId, { timeout: 30_000 });
    await page.getByTestId("turn-history-bar").getByRole("button").first().click();
    await page.keyboard.type(failedTurnId.replace(/-/g, "").slice(0, 8));
    await page.keyboard.press("Enter");
    const record = page.locator(`[data-testid="turn-record"] [data-turn-id="${failedTurnId}"]`);
    await expect(record).toBeVisible({ timeout: 20_000 });
    await expect(record).toContainText("Turn failed");
    await expect(record).toContainText("[fail] Break the build");
    await expect(record.getByTestId("turn-record-digest")).toContainText("Error");
    await expect(record.getByTestId("turn-record-digest")).toContainText("1 of 1 check failed");
    await expect(record.getByTestId("turn-record-digest")).toContainText("unit-tests");
    await expect(page.getByTestId("turn-history-bar")).toContainText(failedTurnId.replace(/-/g, "").slice(0, 8));
    await page.screenshot({ path: testInfo.outputPath("earlier-turn-after-restart.png") });
    expect(errors).toEqual([]);
  } finally {
    await second.close();
    await rm(directory, { recursive: true, force: true });
  }
});
