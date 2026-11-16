import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

// The native driver is built for the desktop ABI. Run the real store there;
// no persistence or SQL methods are mocked.
test("archive migration retains existing history and restore clears tombstones", async () => {
  mkdirSync("test-results", { recursive: true });
  const root = mkdtempSync(path.resolve("test-results/workspace-archive-"));
  try {
    const entry = path.join(root, "check.ts");
    writeFileSync(entry, `
      import assert from "node:assert/strict";
      import Database from "better-sqlite3";
      import { SqliteStore } from ${JSON.stringify(path.resolve("electron/persistence/sqlite-store.ts"))};
      const dbPath = ${JSON.stringify(path.join(root, "existing.sqlite"))};
      const snapshot = { activeTaskId: "task", tasks: [{id:"task",title:"Task",provider:"codex",updatedAt:"2026-01-01T00:00:00Z",unread:false}],
        messagesByTask: { task: [{id:"message",role:"user",model:"user",providerId:"user",content:"Preserve this history",parts:[]}] } };
      let store = new SqliteStore({dbPath,runMaintenance:false});
      store.upsertWorkspace({id:"workspace",name:"Workspace",snapshot});
      store.saveRepositoryRegistry({repositories:[{repositoryPath:"/tmp/repository",repositoryName:"Repository",lastOpenedAt:"2026-01-01",defaultBranch:"main",
        workspaces:[{id:"base",name:"Default",updatedAt:"2026-01-01"},{id:"workspace",name:"Workspace",updatedAt:"2026-01-01"}],activeWorkspaceId:"base",
        workspacePathById:{base:"/tmp/repository",workspace:"/tmp/repository/worktree"},workspaceBranchById:{base:"main",workspace:"feature"},workspaceDefaultById:{base:true,workspace:false}}]});
      store.beginTurn({id:"turn",workspaceId:"workspace",taskId:"task",providerId:"codex"});
      store.close();
      // Recreate the pre-migration file by removing only the additive table.
      const before = new Database(dbPath);
      before.exec("DROP TABLE IF EXISTS workspace_archives; DROP TABLE IF EXISTS workspace_deletions");
      before.prepare("INSERT INTO turn_events(id,turn_id,sequence,event_type,payload_json,created_at) VALUES('event','turn',1,'test','{}','2026-01-01')").run();
      const counts = () => Object.fromEntries(["workspaces","workspace_meta","tasks","messages","turns","turn_events"].map(table => [table,before.prepare("SELECT COUNT(*) AS n FROM "+table).get().n]));
      const expected = counts();
      store = new SqliteStore({dbPath,runMaintenance:false});
      assert.deepEqual(counts(),expected);
      assert.equal(store.listArchivedWorkspacesPersistence().length,0);
      const staleRegistry = store.loadRepositoryRegistry();
      const identity = {workspaceId:"workspace",repositoryPath:"/tmp/repository",path:"/tmp/repository/worktree",branch:"feature",name:"Workspace"};
      const archive = store.archiveWorkspacePersistence(identity);
      store.upsertWorkspace({id:identity.workspaceId,name:"Stale queued save",snapshot:{...snapshot,messagesByTask:{task:[{...snapshot.messagesByTask.task[0],content:"Stale queued content"}]}}});
      assert.equal(store.persistTaskTurnDelta({workspaceId:identity.workspaceId,taskId:"task",messages:[{...snapshot.messagesByTask.task[0],content:"Stale host save"}]}).ok,false);
      assert.deepEqual(counts(),expected);
      assert.equal(store.listWorkspaceSummaries().length,0);
      assert.equal(store.loadWorkspaceSnapshot({workspaceId:"workspace"}).messagesByTask.task[0].content,"Preserve this history");
      assert.equal(store.loadRepositoryRegistry()[0].workspaces.length,1);
      store.saveRepositoryRegistry({repositories:staleRegistry,keepUnseenWorkspaces:true});
      assert.equal(store.loadRepositoryRegistry()[0].workspaces.length,1);
      assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,[identity.path]);
      assert.equal(store.archiveWorkspacePersistence(identity).archivedAt,archive.archivedAt);
      store.close();
      store = new SqliteStore({dbPath,runMaintenance:false});
      assert.equal(store.listArchivedWorkspacesPersistence()[0].workspaceId,"workspace");
      assert.equal(store.restoreWorkspacePersistence({workspaceId:"workspace",readOnly:true}).readOnly,true);
      assert.equal(store.restoreWorkspacePersistence({workspaceId:"workspace",readOnly:true}).readOnly,true);
      assert.equal(store.listWorkspaceSummaries().length,0);
      assert.equal(store.loadRepositoryRegistry()[0].workspaces.length,1);
      store.close();
      store = new SqliteStore({dbPath,runMaintenance:false});
      assert.equal(store.listArchivedWorkspacesPersistence()[0].readOnly,true);
      assert.ok(store.restoreWorkspacePersistence({workspaceId:"workspace"}));
      assert.equal(store.listWorkspaceSummaries().length,1);
      assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,[]);
      assert.equal(store.loadRepositoryRegistry()[0].workspacePathById.workspace,identity.path);
      assert.equal(store.listArchivedWorkspacesPersistence().length,0);
      assert.deepEqual(counts(),expected);
      store.closeWorkspace({workspaceId:"workspace"});
      store.close();
      store = new SqliteStore({dbPath,runMaintenance:false});
      store.upsertWorkspace({id:identity.workspaceId,name:"Late save after delete",snapshot});
      store.saveRepositoryRegistry({repositories:staleRegistry,keepUnseenWorkspaces:true});
      assert.equal(store.listArchivedWorkspacesPersistence().length,0);
      for (const count of Object.values(counts())) assert.equal(count,0);
      const afterDelete = store.loadRepositoryRegistry()[0];
      assert.equal(afterDelete.workspaces.some(row => row.id === identity.workspaceId),false);
      assert.equal(afterDelete.workspacePathById.workspace,undefined);
      assert.equal(afterDelete.workspaceBranchById.workspace,undefined);
      assert.equal(afterDelete.workspaceDefaultById.workspace,undefined);
      assert.deepEqual(afterDelete.archivedWorkspacePaths,[identity.path]);
      store.close();before.close();
    `);
    const result = spawnSync(process.execPath, ["build", entry, "--outfile", path.join(root, "check.cjs"), "--target=node", "--format=cjs", "--external=better-sqlite3", '--define=import.meta.env.BASE_URL="/"'], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    const require = createRequire(import.meta.url);
    const execution = spawnSync(require("electron"), [path.join(root, "check.cjs")], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.resolve("node_modules") },
      encoding: "utf8",
    });
    if (execution.status !== 0) throw new Error(execution.stdout + execution.stderr || String(execution.error));
    expect(execution.status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
