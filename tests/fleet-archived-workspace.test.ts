import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

test("Fleet archive refuses archived and deleted workspace history without false success", () => {
  const root = mkdtempSync(path.resolve("test-results/fleet-archived-workspace-"));
  try {
    const entry = path.join(root, "check.ts");
    writeFileSync(entry, `
      import assert from "node:assert/strict";
      import { SqliteStore } from ${JSON.stringify(path.resolve("electron/persistence/sqlite-store.ts"))};
      const store = new SqliteStore({dbPath:${JSON.stringify(path.join(root,"db.sqlite"))},runMaintenance:false});
      const snapshot = {activeTaskId:"task",tasks:[{id:"task",title:"Task",provider:"codex",unread:false,updatedAt:"now"}],messagesByTask:{task:[]}};
      store.upsertWorkspace({id:"workspace",name:"Workspace",snapshot});
      store.saveRepositoryRegistry({repositories:[{repositoryPath:"/tmp/project",repositoryName:"Project",lastOpenedAt:"now",defaultBranch:"main",workspaces:[{id:"base",name:"Default",updatedAt:"now"},{id:"workspace",name:"Workspace",updatedAt:"now"}],activeWorkspaceId:"base",workspacePathById:{base:"/tmp/project",workspace:"/tmp/project-work"},workspaceBranchById:{base:"main",workspace:"work"},workspaceDefaultById:{base:true,workspace:false}}]});
      store.archiveWorkspacePersistence({workspaceId:"workspace",repositoryPath:"/tmp/project",path:"/tmp/project-work",branch:"work",name:"Workspace"});
      assert.deepEqual(store.archiveFleetTask({workspaceId:"workspace",taskId:"task"}),{ok:false,reason:"workspace-archived"});
      assert.equal(store.loadWorkspaceShell({workspaceId:"workspace"}).tasks[0].archivedAt ?? null,null);
      assert.deepEqual(store.archiveFleetTask({workspaceId:"workspace",taskId:"task",restore:true}),{ok:false,reason:"workspace-archived"});
      store.permanentDeleteWorkspace({workspaceId:"workspace"});
      assert.deepEqual(store.archiveFleetTask({workspaceId:"workspace",taskId:"task"}),{ok:false,reason:"workspace-deleted"});
      store.close();
    `);
    const build = spawnSync(process.execPath, ["build",entry,"--outfile",path.join(root,"check.cjs"),"--target=node","--format=cjs","--external=better-sqlite3",'--define=import.meta.env.BASE_URL="/"'],{encoding:"utf8"});
    expect(build.status,build.stdout+build.stderr).toBe(0);
    const run = spawnSync(createRequire(import.meta.url)("electron"),[path.join(root,"check.cjs")],{env:{...process.env,ELECTRON_RUN_AS_NODE:"1"},encoding:"utf8"});
    expect(run.status,run.stdout+run.stderr).toBe(0);
  } finally { rmSync(root,{recursive:true,force:true}); }
},30_000);
