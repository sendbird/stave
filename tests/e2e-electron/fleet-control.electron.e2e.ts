import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("permanent deletion uses strict native IPC and survives stale workspace saves", async () => {
  const stave = await launchStave();
  try {
    const result = await stave.page.evaluate(async () => {
      const persistence = window.api.persistence!;
      const taskControl = window.api.taskControl!;
      const snapshot = {
        activeTaskId: "archived-task",
        tasks: [{ id: "archived-task", title: "Archived task", provider: "codex" as const, updatedAt: new Date().toISOString(), unread: false, archivedAt: new Date().toISOString() }],
        messagesByTask: {}, terminalTabs: [], activeTerminalTabId: null, terminalDocked: false,
      };
      await persistence.upsertWorkspace!({ id: "fleet-delete-workspace", name: "Fleet deletion", snapshot });
      const deleted = await taskControl.deletePermanently!({ workspaceId: "fleet-delete-workspace", taskId: "archived-task" });
      await persistence.upsertWorkspace!({ id: "fleet-delete-workspace", name: "Fleet deletion", snapshot });
      const shell = await persistence.loadWorkspaceShell!({ workspaceId: "fleet-delete-workspace" });
      let strict = false;
      try {
        await taskControl.deletePermanently!({ workspaceId: "fleet-delete-workspace", taskId: "archived-task", extra: true } as never);
      } catch { strict = true; }
      return { deleted, shell, strict };
    });
    expect(result.deleted.ok).toBe(true);
    expect(result.strict).toBe(true);
    expect(result.shell).toMatchObject({ ok: true, shell: { tasks: [] } });
  } finally {
    await stave.close();
  }
});
