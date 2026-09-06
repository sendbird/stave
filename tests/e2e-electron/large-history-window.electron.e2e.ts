import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";
import { buildLargeTaskHistory } from "../fixtures/large-task-history";

test("large persisted outputs remain available after bounded restore and older-page loading", async ({}, testInfo) => {
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-history-"));
  const stave = await launchStave();
  const errors: string[] = [];
  stave.page.on("pageerror", (error) => errors.push(error.message));
  try {
    await stave.page.getByTestId("workspace-welcome").getByRole("button", { name: "Open a project" }).click();
    await stave.page.getByPlaceholder("~/projects/my-app").fill(projectPath);
    await stave.page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(stave.page.getByTestId("workspace-welcome")).toHaveCount(0);
    await stave.page.getByRole("button", { name: "New Task", exact: true }).click();
    const scope = await stave.page.evaluate(async () => {
      const { rows } = await window.api.persistence!.listWorkspaces!();
      return { workspaceId: rows[0]!.id };
    });
    await expect.poll(async () => stave.page.evaluate(async ({ workspaceId }) =>
      (await window.api.persistence!.loadWorkspaceShell!({ workspaceId })).shell?.tasks.length ?? 0, scope)).toBe(1);
    const history = buildLargeTaskHistory({ count: 36, largePartEveryNth: 2, largePartBytes: 512 * 1024, idPrefix: "saved-history" });
    const saved = await stave.page.evaluate(async ({ scope, history }) => {
      const { shell } = await window.api.persistence!.loadWorkspaceShell!(scope);
      if (!shell) throw new Error("Fixture workspace did not persist");
      const result = await window.api.persistence!.upsertWorkspace!({
        id: scope.workspaceId, name: "History fixture",
        snapshot: { ...shell, messagesByTask: { [shell.activeTaskId]: history } },
      });
      return { ok: result.ok, taskId: shell.activeTaskId };
    }, { scope, history });
    expect(saved.ok).toBe(true);
    await stave.page.reload();
    const older = stave.page.getByRole("button", { name: /^Load older messages/ });
    await expect(older).toBeAttached();
    const remainingBefore = Number((await older.innerText()).match(/\((\d+) remaining\)/)?.[1]);
    // Count-only initial loading would retain at least 24 rows of this fixture.
    expect(36 - remainingBefore).toBeLessThan(24);
    await older.click();
    await expect(older).toHaveCount(0);
    const oldestOutputLength = await stave.page.evaluate(async ({ scope, taskId }) => {
      const result = await window.api.persistence!.loadTaskMessages!({ ...scope, taskId, limit: 2, offset: 34 });
      const message = result.page.messages[1] as { parts?: { output?: string }[] };
      return { ok: result.ok, total: result.page.totalCount, length: message.parts?.[0]?.output?.length ?? 0 };
    }, { scope, taskId: saved.taskId });
    expect(oldestOutputLength).toMatchObject({ ok: true, total: 36 });
    expect(oldestOutputLength.length).toBeGreaterThanOrEqual(512 * 1024);
    await testInfo.attach("history-window", { body: JSON.stringify({ messages: 36, loadedAfterRestore: 36 - remainingBefore, oldestOutputLength }), contentType: "application/json" });
    expect(errors).toEqual([]);
  } finally {
    await stave.close();
    await rm(projectPath, { recursive: true, force: true });
  }
});
