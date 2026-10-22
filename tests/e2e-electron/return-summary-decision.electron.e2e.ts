import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

/**
 * The return summary's last decision links to where you gave it. The task's
 * saved conversation has an approval you granted early on, a stretch of long
 * later messages, your last message two hours ago and a reply after it. On
 * opening the task, the summary names the approval; its Show link closes the
 * card, scrolls the conversation back to the approval, opens that finished
 * turn's steps and focuses it.
 */
const FAKE_CLI = path.join(import.meta.dirname, "harness", "fake-claude-cli.cjs");
const REQUEST_ID = "seed-approval";

function buildHistory() {
  const base = Date.now() - 3 * 60 * 60 * 1000;
  const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
  const message = (index: number, role: "user" | "assistant", minutes: number, text: string, parts: unknown[] = []) => ({
    id: `saved-${String(index).padStart(4, "0")}`,
    role,
    model: role === "user" ? "" : "claude-sonnet-fake",
    providerId: role === "user" ? "user" : "claude-code",
    content: text,
    startedAt: at(minutes),
    ...(role === "assistant" ? { completedAt: at(minutes), terminalStopReason: "end_turn" } : {}),
    parts: [...parts, { type: "text", text }],
  });
  const history = [
    message(0, "user", 0, "Add the CSV export."),
    message(1, "assistant", 1, "Migrated the export table.", [
      { type: "approval", toolName: "Bash", requestId: REQUEST_ID, description: "Run the migration", state: "approval-responded" },
    ]),
  ];
  // A stretch of long replies, so the approval is far above the latest reply,
  // while every message is still in the page a task opens with.
  const paragraph = "The export keeps every column and its order, and the header row names each one. ".repeat(6);
  for (let index = 2; index < 20; index += 1) {
    history.push(message(index, index % 2 === 0 ? "user" : "assistant", 2 + index, `Filler turn ${index}. ${paragraph}`));
  }
  history.push(message(20, "user", 60, "Keep the column order."));
  history.push(message(21, "assistant", 65, "Kept the column order.", [
    { type: "tool_use", toolUseId: "seed-edit", toolName: "Edit", state: "output-available", input: "{}", output: "ok" },
  ]));
  return history;
}

test("the return summary's Show link reveals the approval you gave and focuses it", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-return-decision-"));
  const repositoryPath = path.join(directory, "repository");
  const fakeDir = path.join(directory, "fake-claude");
  const profileDir = path.join(directory, "profile");
  await mkdir(repositoryPath);
  await mkdir(fakeDir);
  await mkdir(profileDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Return summary validation.\n");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize"], { cwd: repositoryPath });
  const wrapper = path.join(fakeDir, "claude");
  await writeFile(wrapper, `#!/bin/sh\nFAKE_CLAUDE_DIR='${fakeDir}' exec '${process.execPath}' '${FAKE_CLI}' "$@"\n`);
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
        name: "Return summary fixture",
        snapshot: { ...shell, messagesByTask: { [shell.activeTaskId]: history } },
      });
      if (!saved.ok) throw new Error("The history did not persist");
      return shell.activeTaskId;
    }, { workspaceId, history: buildHistory() });
    await page.reload();

    const conversation = page.getByTestId(`conversation-scroll-${taskId}`);
    await expect(conversation.getByText("Kept the column order.")).toBeVisible({ timeout: 30_000 });
    const card = page.getByTestId("return-summary");
    await expect(card).toBeVisible({ timeout: 20_000 });
    const decision = card.locator('[data-return-line="decision"]');
    await expect(decision).toContainText("You allowed Run command: Run the migration");
    const approval = page.locator(`[data-approval-request-id="${REQUEST_ID}"]`);
    await expect(approval).not.toBeInViewport();

    await decision.getByRole("button", { name: "Show" }).click();
    // The card closes so it does not cover what it points at.
    await expect(card).toHaveCount(0);
    await expect(approval).toBeInViewport({ timeout: 20_000 });
    await expect(approval).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("decision-focused.png") });
    expect(errors).toEqual([]);
  } finally {
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});
