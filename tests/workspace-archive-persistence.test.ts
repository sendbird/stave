import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

// The native driver is built for the desktop ABI. Run the real store there;
// no persistence or SQL methods are mocked.
for (const scenario of ["history", "paths", "delete", "tombstones"]) test(`archive persistence review regression: ${scenario}`, async () => {
  mkdirSync("test-results", { recursive: true });
  const root = mkdtempSync(path.resolve("test-results/workspace-archive-"));
  try {
    const entry = path.join(root, "check.ts");
    writeFileSync(entry, `
      import assert from "node:assert/strict";
      import Database from "better-sqlite3";
      import {mkdirSync,writeFileSync,existsSync} from "node:fs";
      import path from "node:path";
      import {inlineRenderWorkspaceKey} from ${JSON.stringify(path.resolve("electron/main/inline-render/inline-render-store.ts"))};
      import {toolImageWorkspaceKey} from ${JSON.stringify(path.resolve("electron/main/tool-images/tool-image-store.ts"))};
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
      if (${JSON.stringify(scenario)} === "tombstones") {
        const closedPath = "/tmp/repository/preserved-checkout";
        // Existing installs can have path-only archive markers and no history row.
        before.prepare("UPDATE app_state SET value_json=? WHERE key='project_registry'").run(JSON.stringify(staleRegistry.map(repository=>({...repository,archivedWorkspacePaths:[closedPath]}))));
        store.saveRepositoryRegistry({repositories:staleRegistry,keepUnseenWorkspaces:true});
        assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,[closedPath],"a stale renderer save must retain path-only archives");
        store.updateRepositoryRegistry(repositories=>({repositories,result:null}));
        store.close();
        store = new SqliteStore({dbPath,runMaintenance:false});
        assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,[closedPath]);
        const anotherPath = "/tmp/repository/another-closed-checkout";
        store.saveRepositoryRegistry({repositories:staleRegistry.map(repository=>({...repository,archivedWorkspacePaths:[anotherPath,closedPath + "/",identity.path + "/"]}))});
        assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,[closedPath,anotherPath],"merge both writers' markers, deduplicate canonical paths, and allow active paths");
        store.archiveWorkspacePersistence(identity);
        const archivedPaths = store.loadRepositoryRegistry()[0].archivedWorkspacePaths;
        store.saveRepositoryRegistry({repositories:staleRegistry,keepUnseenWorkspaces:true});
        assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,archivedPaths);
        assert.equal(store.loadRepositoryRegistry()[0].workspaces.some(row=>row.id===identity.workspaceId),false);
        store.restoreWorkspacePersistence({workspaceId:identity.workspaceId});
        store.saveRepositoryRegistry({repositories:staleRegistry.map(repository=>({...repository,archivedWorkspacePaths:archivedPaths})),keepUnseenWorkspaces:true});
        assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,[closedPath,anotherPath],"restore clears only the restored path");
        store.close();before.close();process.exit(0);
      }
      const archive = store.archiveWorkspacePersistence(identity);
      if (${JSON.stringify(scenario)} === "paths") {
        store.restoreWorkspacePersistence({workspaceId:"workspace"});
        store.saveRepositoryRegistry({repositories:staleRegistry.map(repository=>({...repository,archivedWorkspacePaths:[identity.path]})),keepUnseenWorkspaces:true});
        assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,[]);
        store.closeWorkspace({workspaceId:"workspace"});
        assert.throws(()=>store.upsertWorkspace({id:identity.workspaceId,name:"Late",snapshot}),/permanently deleted/);
        assert.throws(()=>store.persistTaskTurnDelta({workspaceId:identity.workspaceId,taskId:"task"}),/permanently deleted/);
        store.close();before.close();process.exit(0);
      }
      if (${JSON.stringify(scenario)} === "delete") {
        const permanentDelete = store.permanentDeleteWorkspace?.bind(store) ?? store.closeWorkspace.bind(store);
        before.prepare("INSERT INTO notifications(id,kind,title,body,workspace_id,payload_json,created_at) VALUES('n','test','Title','Body','workspace','{}','2026-01-01')").run();
        const relatedTables = ["runs","run_steps","run_receipts","agent_runs","agent_run_stages","agent_run_events","result_reviews","result_review_evidence","wake_ups","wake_up_occurrences","lens_review_records","task_handoff_records","fleet_attention_snoozes","tracker_issue_kickoffs","workspace_document_revisions","workspace_document_archived_workspaces"];
        // Populate real tables using their required fields; FK owners precede children.
        for (const table of relatedTables) {
          const columns = before.prepare("PRAGMA table_info("+table+")").all().filter(column => column.notnull && column.dflt_value === null || column.pk);
          const values = columns.map(column => {
            if (column.name === "id" && column.type === "INTEGER") return 1;
            if (column.name === "author") return "agent";
            if (column.name === "id") return table === "runs" ? "run" : table === "run_steps" ? "step" : table === "agent_runs" ? "agent" : table;
            if (column.name === "workspace_id") return "workspace";
            if (column.name === "run_id") return "run";
            if (column.name === "step_id") return "step";
            if (column.name === "agent_run_id") return "agent";
            if (column.name === "outcome") return "completed";
            if (column.name === "scope_key") return JSON.stringify(["/tmp/repository","workspace","task","turn"]);
            return column.type === "INTEGER" ? 1 : column.name.endsWith("_json") ? "{}" : "fixture";
          });
          before.prepare("INSERT INTO "+table+" ("+columns.map(column=>column.name).join(",")+") VALUES ("+columns.map(()=>"?").join(",")+")").run(...values);
        }
        before.prepare("INSERT INTO agent_assignments(id,request_id,agent_config_id,state,task_id,body_json,created_at,updated_at) VALUES('assignment','request','agent','completed','task',json_object('taskId','task'),'2026-01-01','2026-01-01')").run();
        before.prepare("INSERT INTO artifacts(id,kind,relative_path,byte_size,created_at) VALUES('event-artifact','event','event-payload.json',1,'2026-01-01')").run();
        before.prepare("UPDATE turn_events SET payload_artifact_id='event-artifact' WHERE id='event'").run();
        mkdirSync(path.join(path.dirname(dbPath),"artifacts"),{recursive:true});
        writeFileSync(path.join(path.dirname(dbPath),"artifacts","event-payload.json"),"payload");
        const userData = path.dirname(dbPath);
        const directories = [path.join(userData,"inline-renders",inlineRenderWorkspaceKey("workspace")),path.join(userData,"mcp-app-views",inlineRenderWorkspaceKey("workspace")),path.join(userData,"tool-images",toolImageWorkspaceKey("workspace"))];
        for (const directory of directories) {mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,"capture"),"bytes");}
        before.exec("CREATE TRIGGER refuse_workspace_delete BEFORE DELETE ON workspaces BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END");
        assert.throws(()=>permanentDelete({workspaceId:"workspace"}),/injected delete failure/);
        assert.equal(before.prepare("SELECT COUNT(*) AS n FROM notifications WHERE workspace_id='workspace'").get().n,1);
        assert.equal(store.listArchivedWorkspacesPersistence().length,1);
        for (const directory of directories) assert.equal(existsSync(directory),true);
        before.exec("DROP TRIGGER refuse_workspace_delete");
        permanentDelete({workspaceId:"workspace"});
        assert.equal(before.prepare("SELECT COUNT(*) AS n FROM notifications WHERE workspace_id='workspace'").get().n,0,"permanent deletion must remove workspace notifications");
        assert.equal(store.listArchivedWorkspacesPersistence().length,0);
        assert.equal(before.prepare("SELECT task_id FROM agent_assignments WHERE id='assignment'").get().task_id,null);
        assert.equal(before.prepare("SELECT COUNT(*) AS n FROM artifacts WHERE id='event-artifact'").get().n,0);
        assert.equal(existsSync(path.join(userData,"artifacts","event-payload.json")),false);
        for (const table of relatedTables) assert.equal(before.prepare("SELECT COUNT(*) AS n FROM "+table).get().n,0,table);
        for (const directory of directories) assert.equal(existsSync(directory),false,directory);
        store.close();before.close();process.exit(0);
      }
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
      // A stale main-process close must not destroy archived history.
      store.archiveWorkspacePersistence(identity);
      assert.equal(store.closeWorkspace({workspaceId:"workspace"}).ok,false);
      assert.deepEqual(counts(),expected);
      assert.equal(store.listArchivedWorkspaceIdentities()[0].workspaceId,"workspace");
      store.restoreWorkspacePersistence({workspaceId:"workspace"});
      store.saveRepositoryRegistry({repositories:staleRegistry.map(repository=>({...repository,archivedWorkspacePaths:[identity.path]})),keepUnseenWorkspaces:true});
      assert.deepEqual(store.loadRepositoryRegistry()[0].archivedWorkspacePaths,[]);
      store.closeWorkspace({workspaceId:"workspace"});
      store.close();
      store = new SqliteStore({dbPath,runMaintenance:false});
      assert.throws(()=>store.upsertWorkspace({id:identity.workspaceId,name:"Late save after delete",snapshot}),/permanently deleted/);
      store.saveRepositoryRegistry({repositories:staleRegistry,keepUnseenWorkspaces:true});
      assert.equal(store.listArchivedWorkspacesPersistence().length,0);
      for (const count of Object.values(counts())) assert.equal(count,0);
      const afterDelete = store.loadRepositoryRegistry()[0];
      assert.equal(afterDelete.workspaces.some(row => row.id === identity.workspaceId),false);
      assert.equal(afterDelete.workspacePathById.workspace,undefined);
      assert.equal(afterDelete.workspaceBranchById.workspace,undefined);
      assert.equal(afterDelete.workspaceDefaultById.workspace,undefined);
      assert.deepEqual(afterDelete.archivedWorkspacePaths,[]);
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
