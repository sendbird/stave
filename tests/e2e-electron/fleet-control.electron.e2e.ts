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

test("native addressed archive, preview and guarded undo", async () => {
  const stave = await launchStave();
  try {
    const result = await stave.page.evaluate(async () => {
      const persistence = window.api.persistence!;
      const taskControl = window.api.taskControl!;
      const workspaceId = "fleet-addressed-workspace";
      const taskId = "idle-archivable";
      await persistence.upsertWorkspace!({id:workspaceId,name:"Addressed workspace",snapshot:{activeTaskId:taskId,tasks:[{id:taskId,title:"Idle task",provider:"codex",updatedAt:new Date().toISOString(),unread:false}],messagesByTask:{},openTaskTabIds:[taskId]}});
      const preview = await taskControl.previewStop!({targets:[{workspaceId,taskId}]});
      const archived = await taskControl.archive!({workspaceId,taskId});
      const shell = await persistence.loadWorkspaceShell!({workspaceId});
      const staleUndo = await taskControl.archive!({workspaceId,taskId,restore:true,expectedArchivedAt:"stale"});
      const restored = await taskControl.archive!({workspaceId,taskId,restore:true,expectedArchivedAt:archived.archivedAt!});
      return {preview,archived,shell,staleUndo,restored};
    });
    expect(result.preview).toMatchObject({ok:true,turns:0,children:0,runs:0});
    expect(result.archived.ok).toBe(true);
    expect(result.shell.shell?.openTaskTabIds).toEqual([]);
    expect(result.staleUndo).toMatchObject({ok:false,reason:"changed"});
    expect(result.restored).toMatchObject({ok:true,archivedAt:null});
  } finally { await stave.close(); }
});
