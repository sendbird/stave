import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * Right after a restart, the command palette's All repositories scope finds a
 * task by title in a workspace the window never opened, and opening it goes
 * repository, then workspace, then task. The workspace is a git worktree the
 * repository already had; its task is written to the app database the way a
 * saved workspace is.
 */
const TITLE = "Rank results by recency";

test("a task in a never-opened workspace is found by title after a restart and opened in place", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-task-search-"));
  const repositoryPath = path.join(directory, "repository");
  const worktreePath = path.join(directory, "search-worktree");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Task search validation.\n");
  execFileSync("git", ["add", "."], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  execFileSync("git", ["worktree", "add", "-b", "feat/search", worktreePath], { cwd: repositoryPath });
  const worktreePaths = [worktreePath, realpathSync(worktreePath)];

  let workspaceId = "";
  const first = await launchStave({ userDataDir: profileDir });
  try {
    const page = first.page;
    await page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a repository" }).click();
    await page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
    // Refresh Workspaces registers the repository's worktree; the window stays on the Default workspace.
    await expect(page.getByRole("button", { name: "New Task", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("ControlOrMeta+Shift+P");
    await page.keyboard.type("Refresh Workspaces");
    await page.keyboard.press("Enter");
    await expect.poll(async () => {
      workspaceId = await page.evaluate(async (paths) => {
        const registry = (await window.api.persistence!.loadRepositoryRegistry!()) as {
          repositories: Array<{ workspacePathById: Record<string, string> }>;
        };
        for (const repository of registry.repositories) {
          const match = Object.entries(repository.workspacePathById).find(([, workspacePath]) => paths.includes(workspacePath));
          if (match) return match[0];
        }
        return "";
      }, worktreePaths);
      return workspaceId;
    }, { timeout: 30_000 }).not.toBe("");
    const saved = await page.evaluate(async ({ id, title }) => {
      const now = new Date().toISOString();
      return window.api.persistence!.upsertWorkspace!({
        id,
        name: "search",
        snapshot: {
          activeTaskId: "task-rank",
          tasks: [{ id: "task-rank", title, provider: "claude-code", updatedAt: now, unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave" }],
          messagesByTask: { "task-rank": [] },
        },
      });
    }, { id: workspaceId, title: TITLE });
    expect(saved).toMatchObject({ ok: true });
  } finally {
    await first.close();
  }

  const second = await launchStave({ userDataDir: profileDir });
  const errors: string[] = [];
  second.page.on("pageerror", (error) => errors.push(error.message));
  try {
    const page = second.page;
    await expect(page.getByRole("button", { name: "New Task", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(TITLE)).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+P");
    await page.locator('[data-task-scope="all"]').click();
    await page.keyboard.type("rank recency");
    const result = page.locator("[data-task-search-result]").filter({ hasText: TITLE });
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result).toContainText("feat/search");
    await page.screenshot({ path: testInfo.outputPath("task-search-result.png") });
    await page.keyboard.press("Enter");
    // Opened in place: the palette closes on the worktree's workspace with its task.
    await expect(page.locator("[data-task-search-result]")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => page.evaluate(async () => {
      const registry = (await window.api.persistence!.loadRepositoryRegistry!()) as {
        repositories: Array<{ activeWorkspaceId: string }>;
      };
      return registry.repositories[0]?.activeWorkspaceId ?? "";
    }), { timeout: 30_000 }).toBe(workspaceId);
    await page.screenshot({ path: testInfo.outputPath("task-search-opened.png") });
    expect(errors).toEqual([]);
  } finally {
    await second.close();
    execFileSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: repositoryPath });
    await rm(directory, { recursive: true, force: true });
  }
});
