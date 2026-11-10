import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");

test("a host-started turn records real files and restore can be undone after restart", async () => {
  test.setTimeout(240_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-turn-files-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "runtime");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(fakeDir);
  await mkdir(profileDir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repositoryPath });
  git("init", "-b", "main");
  await writeFile(path.join(repositoryPath, "README.md"), "Committed state\n");
  await writeFile(path.join(repositoryPath, ".gitignore"), "ignored.txt\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize");
  await writeFile(path.join(repositoryPath, "README.md"), "Staged state\n");
  git("add", "README.md");
  await writeFile(path.join(repositoryPath, "README.md"), "Working state\n");
  await writeFile(path.join(repositoryPath, "untracked.bin"), Buffer.from([0, 1, 2, 255]));
  await writeFile(path.join(repositoryPath, "ignored.txt"), "Ignored state\n");
  // A default workspace with a nested, non-ignored worktree still records snapshots.
  git("worktree", "add", "-q", path.join(repositoryPath, ".stave", "workspaces", "feature"), "-b", "feature");
  const indexBefore = git("show", ":README.md").toString();
  const wrapper = path.join(fakeDir, "runtime");
  await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`);
  await chmod(wrapper, 0o755);
  const env = { STAVE_CLAUDE_CLI_PATH: wrapper };
  let ids = { workspaceId: "", taskId: "", turnId: "" };
  const first = await launchStave({ userDataDir: profileDir, env });
  try {
    const page = first.page;
    await page.getByTestId("workspace-welcome").getByRole("button", { name: "Open repository", exact: true }).click();
    await page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    const workspaceId = await page.evaluate(async () => (await window.api.persistence!.listWorkspaces!()).rows[0]!.id);
    await expect.poll(() => page.evaluate(async (workspaceId) =>
      (await window.api.persistence!.loadWorkspaceShell!({ workspaceId })).shell?.activeTaskId ?? "", workspaceId)).not.toBe("");
    const taskId = await page.evaluate(async (workspaceId) =>
      (await window.api.persistence!.loadWorkspaceShell!({ workspaceId })).shell!.activeTaskId, workspaceId);
    ids = { workspaceId, taskId, turnId: "" };
    const composer = page.locator('[data-prompt-lexical-editor="true"]');
    await composer.fill("Check the saved files");
    await composer.press("Enter");
    await expect.poll(async () => page.evaluate(async (ids) => {
      const result = await window.api.persistence!.listTaskTurnHistory!({ workspaceId: ids.workspaceId, taskId: ids.taskId });
      return result.ok ? result.page.turns[0]?.outcome : null;
    }, ids), { timeout: 90_000 }).toBe("completed");
    ids.turnId = await page.evaluate(async ({ workspaceId, taskId }) => {
      const response = await window.api.persistence!.listTaskTurnHistory!({ workspaceId, taskId });
      if (!response.ok || !response.page.turns[0]) throw new Error("Completed turn has no history record");
      return response.page.turns[0].id;
    }, ids);
    expect(await readFile(path.join(repositoryPath, "README.md"), "utf8")).toBe("Working state\n");
    expect(git("show", ":README.md").toString()).toBe(indexBefore);
  } catch (error) {
    await first.page.screenshot({ path: "/tmp/gap-h6/electron-start-failure.png" }).catch(() => {});
    console.error("Snapshot test startup", await first.page.evaluate(() => ({ url: location.href, title: document.title, text: document.body.innerText.slice(0, 4000), api: Boolean(window.api) })).catch(() => null));
    throw error;
  } finally {
    await first.close();
  }

  await writeFile(path.join(repositoryPath, "README.md"), "After turn\n");
  await writeFile(path.join(repositoryPath, "untracked.bin"), Buffer.from([4, 5, 6]));
  const second = await launchStave({ userDataDir: profileDir, env });
  try {
    const page = second.page;
    await expect(page.locator('[data-prompt-lexical-editor="true"]')).toBeVisible({ timeout: 30_000 });
    // The snapshot API is called through the real preload and host transport.
    const listed = await page.evaluate(async ({ workspaceId, taskId }) => window.api.turnSnapshots!.list({ workspaceId, taskId }), ids);
    expect(listed.snapshots).toEqual([expect.objectContaining({ turnId: ids.turnId })]);
    const rejected = await page.evaluate(async (args) => {
      try {
        await window.api.turnSnapshots!.restore({ ...args, unexpected: true } as typeof args);
        return false;
      } catch { return true; }
    }, ids);
    expect(rejected).toBe(true);
    const restored = await page.evaluate(async (ids) => {
      return window.api.turnSnapshots!.restore(ids);
    }, ids);
    expect(restored.ok).toBe(true);
    expect(await readFile(path.join(repositoryPath, "README.md"), "utf8")).toBe("Working state\n");
    expect(await readFile(path.join(repositoryPath, "untracked.bin"))).toEqual(Buffer.from([0, 1, 2, 255]));
    expect(await readFile(path.join(repositoryPath, "ignored.txt"), "utf8")).toBe("Ignored state\n");
    expect(git("show", ":README.md").toString()).toBe(indexBefore);
    const undone = await page.evaluate(async (ids) => window.api.turnSnapshots!.undo({ workspaceId: ids.workspaceId, taskId: ids.taskId }), ids);
    expect(undone.ok).toBe(true);
    expect(await readFile(path.join(repositoryPath, "README.md"), "utf8")).toBe("After turn\n");
    expect(await readFile(path.join(repositoryPath, "untracked.bin"))).toEqual(Buffer.from([4, 5, 6]));
  } finally {
    await second.close();
    await rm(directory, { recursive: true, force: true });
  }
});
