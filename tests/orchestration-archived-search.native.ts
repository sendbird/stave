import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteStore } from "../electron/persistence/sqlite-store";
const root = mkdtempSync(path.join(tmpdir(), "archived-search-"));
const dbPath = path.join(root, "history.sqlite");
const store = new SqliteStore({dbPath, runMaintenance:false});
const db = new Database(dbPath);
try {
 store.upsertWorkspace({id:"archived",name:"Retained work",snapshot:{activeTaskId:"task",tasks:[{id:"task",title:"Retained task",provider:"codex",updatedAt:"2026-11-17",unread:false}],messagesByTask:{task:[{id:"message",role:"user",model:"user",providerId:"user",content:"searchable retained history",parts:[]}]}}});
 store.saveRepositoryRegistry({repositories:[{repositoryPath:"/tmp/project",repositoryName:"Project",lastOpenedAt:"2026-11-17",defaultBranch:"main",workspaces:[{id:"base",name:"Default",updatedAt:"2026-11-17"},{id:"archived",name:"Retained work",updatedAt:"2026-11-17"}],activeWorkspaceId:"base",workspacePathById:{base:"/tmp/project",archived:"/tmp/project/worktree"},workspaceBranchById:{base:"main",archived:"feature"},workspaceDefaultById:{base:true,archived:false}}]});
 const index=store.contentSearch!;
 db.exec("UPDATE content_search_queue SET ready=1");
 while(index.buildBatch()) {}
 store.archiveWorkspacePersistence({workspaceId:"archived",repositoryPath:"/tmp/project",path:"/tmp/project/worktree",branch:"feature",name:"Retained work"});
 const response=index.search({query:"retained history"});
 assert(response.ok);
 assert.equal(response.results.length,1,"Archived workspace absent from registry must remain searchable");
 assert.equal(response.results[0].state,"archived");
 assert.equal(response.results[0].workspaceArchived,true);
 assert.equal(response.results[0].repositoryPath,"/tmp/project");
 store.permanentDeleteWorkspace({workspaceId:"archived"});
 for(const table of ["content_search_documents","content_search_tasks","content_search_dirty_tasks","content_search_queue"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE workspace_id='archived'`).get().n,0,table);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM content_search_tasks_fts WHERE content_search_tasks_fts MATCH 'retained'").get().n,0);
 console.log("PASS archived identities, archived label and permanent-delete index cleanup");
} finally {store.close();db.close();rmSync(root,{recursive:true,force:true});}
