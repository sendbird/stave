import { execFileSync } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository, type StaveApp } from "./harness/stave-app";

/**
 * Review mode on a real repository: the task's Conversation | Review switch
 * and its shortcut, the uncommitted and branch scopes read through the host
 * service, a later edit to another file next to the branch's committed
 * change, and the plain-task decision bar.
 *
 * An agent run stage cannot be finished here: the stand-in provider CLI only
 * answers with text and cannot report a stage through Stave's tools, so the
 * stage scope and Sign off are covered by unit and render tests instead.
 *
 * Requires the `out/` desktop build (`bun run build:desktop`).
 */

const WORKSPACE_ID = "ws-e2e";
const TASK_ID = "task-e2e-review";
let stave: StaveApp;
let repo: string;
let outside: string;

function git(...args: string[]) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "e2e", GIT_AUTHOR_EMAIL: "e2e@example.com", GIT_COMMITTER_NAME: "e2e", GIT_COMMITTER_EMAIL: "e2e@example.com" },
  }).trim();
}

test.beforeAll(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "stave-e2e-review-"));
  git("init", "-q", "-b", "main");
  await writeFile(path.join(repo, "a.ts"), "export const a = 1;\n");
  await writeFile(path.join(repo, "b.ts"), "export const b = 1;\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "feature");
  await writeFile(path.join(repo, "a.ts"), "export const a = 2;\n");
  git("commit", "-q", "-am", "change a");
  // After the commit: another file edited, and a new file never added.
  await writeFile(path.join(repo, "b.ts"), "export const b = 2;\n");
  await writeFile(path.join(repo, "notes.md"), "later\n");
  // And a link to a file outside the workspace, which Review refuses to open.
  outside = await mkdtemp(path.join(tmpdir(), "stave-e2e-review-outside-"));
  await writeFile(path.join(outside, "secret.txt"), "outside\n");
  await symlink(path.join(outside, "secret.txt"), path.join(repo, "zz-link.txt"));

  stave = await launchStave();
  await expect(stave.page.getByTestId("workspace-pane-host")).toBeVisible({ timeout: 30_000 });
  await seedRepository(stave.page, { repositoryPath: repo });
  const seeded = await stave.page.evaluate(async ({ workspaceId, taskId }) => {
    const loaded = await window.api.persistence?.loadWorkspace?.({ workspaceId });
    if (!loaded?.snapshot) throw new Error("Fixture workspace snapshot was unavailable");
    const snapshot = loaded.snapshot;
    return window.api.persistence?.upsertWorkspace?.({ id: workspaceId, name: "e2e", snapshot: {
      ...snapshot,
      activeTaskId: taskId,
      tasks: [{ id: taskId, title: "Review fixture task", provider: "claude-code" as const, updatedAt: "2026-10-22T01:00:00.000Z", unread: false }],
      messagesByTask: { ...snapshot.messagesByTask, [taskId]: [] },
      messageCountByTask: { ...(snapshot.messageCountByTask ?? {}), [taskId]: 0 },
      promptDraftByTask: { ...(snapshot.promptDraftByTask ?? {}), [taskId]: { text: "", attachedFilePaths: [], attachments: [] } },
      providerSessionByTask: { ...(snapshot.providerSessionByTask ?? {}), [taskId]: {} },
    } as never });
  }, { workspaceId: WORKSPACE_ID, taskId: TASK_ID });
  expect(seeded?.ok).toBe(true);
  await stave.page.reload({ waitUntil: "domcontentloaded" });
  await expect(stave.page.getByTestId("pane-header-mode-switch")).toBeVisible({ timeout: 30_000 });
});

test.afterAll(async () => {
  await stave?.close();
  if (repo) await rm(repo, { recursive: true, force: true });
  if (outside) await rm(outside, { recursive: true, force: true });
});

test("Review reads the task's changes by scope and tells a later edit from the branch's commit", async ({}, testInfo) => {
  const page = stave.page;
  const shortcut = process.platform === "darwin" ? "Meta+Alt+R" : "Control+Alt+R";
  await page.keyboard.press(shortcut);
  const review = page.getByTestId("task-review-surface");
  await expect(review).toBeVisible();
  const files = review.getByRole("region", { name: "Changed files" });

  // Without a finished turn, Review opens on the uncommitted changes.
  await expect(review.getByRole("button", { name: "Uncommitted", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(files.getByRole("button", { name: /^b\.ts, Modified/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /^notes\.md, Added/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /^a\.ts,/ })).toHaveCount(0);

  // A file counts as read only once its diff has shown: the refused link does not.
  const diff = review.getByRole("region", { name: "Diff", exact: true });
  await files.getByRole("button", { name: /^b\.ts, Modified/ }).click();
  await expect(diff).toContainText("export const b = 2;");
  await expect(files).toContainText("1 of 3 read");
  await files.getByRole("button", { name: /^zz-link\.txt,/ }).click();
  await expect(diff).toContainText("leads outside the workspace");
  await expect(files).toContainText("1 of 3 read");
  await files.getByRole("button", { name: /^notes\.md, Added/ }).click();
  await expect(diff).toContainText("later");
  await expect(files).toContainText("2 of 3 read");

  // The branch scope adds the committed change, from where the branch left main.
  await review.getByRole("button", { name: "Branch", exact: true }).click();
  await expect(review.getByTestId("review-revision")).toContainText("where the branch left main");
  await expect(files.getByRole("button", { name: /^a\.ts, Modified/ })).toBeVisible();
  await files.getByRole("button", { name: /^a\.ts, Modified/ }).click();
  await expect(review.getByRole("region", { name: "Diff", exact: true })).toContainText("export const a = 2;");
  await expect(files).toContainText("of 4 read");

  // A plain task: no stage decisions, and nothing to mark or send yet.
  const decision = review.getByRole("region", { name: "Decision" });
  await expect(decision).toContainText("No saved result to review yet");
  await expect(decision.getByRole("button", { name: "Sign off" })).toHaveCount(0);
  await review.screenshot({ path: testInfo.outputPath("review-branch.png") });

  // The shortcut switches back; the conversation was kept underneath.
  const header = page.getByTestId("pane-header-mode-switch").getByRole("button", { name: /^Review/ });
  await expect(header).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(shortcut);
  await expect(review).toHaveCount(0);
  await expect(header).toHaveAttribute("aria-pressed", "false");

  // The pane header's switch opens Review again on the scope it was left on, and Review's own
  // Conversation button comes back, handing focus to the composer.
  await header.click();
  await expect(review).toBeVisible();
  await expect(review.getByRole("button", { name: "Branch", exact: true })).toHaveAttribute("aria-pressed", "true");
  await review.getByTestId("review-back-to-conversation").click();
  await expect(review).toHaveCount(0);
  await expect(header).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-prompt-lexical-editor="true"]')).toBeFocused();
});
