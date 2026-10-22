import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * Turn Activity's "Show in conversation" for a step the transcript has not
 * loaded. The task's saved history is 300 messages and the step is the second
 * one, far outside the window a task opens with. The stand-in CLI
 * (`harness/fake-claude-cli.cjs`) reports progress for that call during a new
 * turn, which is how an Activity row can point past the loaded window. The
 * transcript then pages older messages in, opens the finished turn's trace,
 * focuses the step, and stays on it while the next turn arrives. A step that
 * is in no message says so.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
const TARGET_TOOL = "saved-read";
const MISSING_TOOL = "missing-read";

function buildHistory() {
  const base = Date.UTC(2026, 0, 1);
  return Array.from({ length: 300 }, (_, index) => {
    const isUser = index % 2 === 0;
    const at = new Date(base + index * 1_000).toISOString();
    const target = index === 1;
    return {
      id: `saved-${String(index).padStart(4, "0")}`,
      role: isUser ? "user" : "assistant",
      model: isUser ? "" : "claude-sonnet-fake",
      providerId: isUser ? "user" : "claude-code",
      content: isUser ? `User turn ${index}` : target ? "Read the saved file." : `Assistant turn ${index}`,
      startedAt: at,
      completedAt: at,
      parts: target
        ? [
            {
              type: "tool_use",
              toolUseId: TARGET_TOOL,
              toolName: "Read",
              state: "output-available",
              input: JSON.stringify({ file_path: "/tmp/saved-file.txt" }),
              output: "saved file contents",
            },
            { type: "text", text: "Read the saved file." },
          ]
        : [],
    };
  });
}

async function openActivityRow(page: Page, toolUseId: string) {
  const sections = page.getByRole("tablist", { name: "Task sections" });
  if ((await sections.count()) === 0) {
    await page.getByRole("button", { name: "Task", exact: true }).click();
  }
  await sections.getByRole("tab", { name: /^Activity/ }).click();
  const row = page.locator(`[data-turn-activity-item-id="work:${toolUseId}"]`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await page.getByRole("button", { name: "Show in conversation" }).click();
}

test("Show in conversation pages an unloaded step in, opens its trace and focuses it", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-step-jump-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(fakeDir);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Step jump validation.\n");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(
    wrapper,
    `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' FAKE_CLAUDE_TOOL_PROGRESS='${TARGET_TOOL},${MISSING_TOOL}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`,
  );
  await chmod(wrapper, 0o755);

  const stave = await launchStave({ userDataDir: profileDir, env: { STAVE_CLAUDE_CLI_PATH: wrapper } });
  const page = stave.page;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a repository" }).click();
    await page.getByPlaceholder("~/projects/my-app").fill(repositoryPath);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    const workspaceId = await page.evaluate(async () => (await window.api.persistence!.listWorkspaces!()).rows[0]!.id);
    await expect.poll(async () => page.evaluate(async (id) =>
      (await window.api.persistence!.loadWorkspaceShell!({ workspaceId: id })).shell?.tasks.length ?? 0, workspaceId)).toBe(1);
    const taskId = await page.evaluate(async ({ workspaceId, history }) => {
      const { shell } = await window.api.persistence!.loadWorkspaceShell!({ workspaceId });
      if (!shell) throw new Error("The workspace did not persist");
      const saved = await window.api.persistence!.upsertWorkspace!({
        id: workspaceId,
        name: "Step jump fixture",
        snapshot: { ...shell, messagesByTask: { [shell.activeTaskId]: history } },
      });
      if (!saved.ok) throw new Error("The history did not persist");
      return shell.activeTaskId;
    }, { workspaceId, history: buildHistory() });
    await page.reload();

    const conversation = page.getByTestId(`conversation-scroll-${taskId}`);
    const older = page.getByRole("button", { name: /^Load older messages/ });
    await expect(older).toBeAttached({ timeout: 30_000 });
    await expect(conversation.getByText("Read the saved file.")).toHaveCount(0);

    // A turn whose Activity lists the saved call and one no message holds.
    const composer = page.locator('[data-prompt-lexical-editor="true"]');
    await composer.click();
    await composer.fill("[tool-progress] Check the saved file again");
    await composer.press("Enter");
    await expect(conversation.getByText("Done.", { exact: true }).last()).toBeVisible({ timeout: 60_000 });

    await openActivityRow(page, TARGET_TOOL);
    const step = page.locator(`[data-tool-use-id="${TARGET_TOOL}"]`);
    await expect(conversation.getByText("Read the saved file.")).toBeVisible({ timeout: 20_000 });
    await expect(step).toBeInViewport();
    await expect(step).toBeFocused();
    await expect(older).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("step-focused.png") });

    // The jump was spent: the next turn's messages do not pull the transcript back.
    await composer.click();
    await composer.fill("Another turn");
    await composer.press("Enter");
    await expect(conversation.getByText("Another turn", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(step).not.toBeInViewport({ timeout: 10_000 });
    await page.waitForTimeout(2_000);
    await expect(step).not.toBeInViewport();

    await openActivityRow(page, MISSING_TOOL);
    await expect(page.getByText("This step is no longer in the conversation.")).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  } finally {
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});
