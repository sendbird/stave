import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {registerContentSearchTextFunction} from "../electron/persistence/content-search-text";
import { SqliteStore } from "../electron/persistence/sqlite-store";
function run() {
const root=mkdtempSync(path.join(tmpdir(),"search-review-"));
const file=path.join(root,"app.sqlite");
try {
  const app=new SqliteStore({dbPath:file,runMaintenance:false});
  app.upsertWorkspace({id:"w",name:"Workspace",snapshot:{activeTaskId:"t",tasks:[{id:"t",title:"Task",provider:"codex",updatedAt:"2026-11-16",unread:false}],messagesByTask:{t:[{id:"m",role:"user",model:"user",providerId:"user",content:"hello",parts:[]}]}}});
  while(app.contentSearch.buildBatch()) {}
  const scenario=process.env.SEARCH_REVIEW_CASE;
  if(scenario==="S1") {const inspect=new Database(file);assert.equal(inspect.prepare("SELECT name FROM sqlite_master WHERE name IN ('content_search_fts','content_search_scan')").all().length,0);inspect.close();}
  if(scenario==="S7") {
    const inspect=new Database(file);
    assert((inspect.prepare("SELECT extractor_version FROM content_search_migration").get() as {extractor_version:number}).extractor_version>=2);
    inspect.exec("UPDATE content_search_migration SET extractor_version=1; UPDATE content_search_documents SET text='outdatedextraction'");inspect.close();
    app.close();
    const rebuilt=new SqliteStore({dbPath:file,runMaintenance:false});
    assert(!rebuilt.contentSearch.status.complete);
    while(rebuilt.contentSearch.buildBatch()) {}
    const fresh=new Database(file);assert.equal((fresh.prepare("SELECT count(*) n FROM content_search_documents WHERE text='outdatedextraction'").get() as {n:number}).n,0);fresh.close();rebuilt.close();
    console.log("PASS S7 version change backfills existing rows");return;
  }
  if(scenario==="S2") {
    const inspect=new Database(file);
    const messages=Array.from({length:2000},(_,n)=>({id:"m"+n,role:"user" as const,model:"user",providerId:"user",content:"streaming vocabulary "+n,parts:[]}));
    app.persistTaskTurnDelta({workspaceId:"w",taskId:"t",messages});
    if(inspect.prepare("SELECT 1 FROM sqlite_master WHERE name='content_search_queue'").get()) inspect.exec("UPDATE content_search_queue SET ready=1");
    while(app.contentSearch.buildBatch()) {}
    inspect.exec("CREATE TABLE rebuild_audit(n INTEGER); CREATE TRIGGER record_rebuild AFTER UPDATE ON content_search_tasks BEGIN INSERT INTO rebuild_audit VALUES(1); END");
    for(let n=0;n<100;n++) {
      app.persistTaskTurnDelta({workspaceId:"w",taskId:"t",messages:[{...messages[0]!,content:"stream "+n}]});
      app.contentSearch.buildBatch();
    }
    assert((inspect.prepare("SELECT count(*) n FROM rebuild_audit").get() as {n:number}).n<5,"100 streaming updates must coalesce");
    assert(app.contentSearch.status.complete,"Streaming does not make backfill incomplete");
    app.beginTurn({id:"stream-turn",workspaceId:"w",taskId:"t",providerId:"codex"});
    app.completeTurn({id:"stream-turn"});
    while(app.contentSearch.buildBatch()) {}
    assert.equal((inspect.prepare("SELECT count(*) n FROM rebuild_audit").get() as {n:number}).n,1);
    assert.equal((inspect.prepare("SELECT text FROM content_search_documents WHERE id='w:t:m0'").get() as {text:string}).text,"stream 99");
    inspect.close();
  }
  if(scenario==="C2") {
    const inspect=new Database(file);
    inspect.exec("UPDATE content_search_migration SET cursor=100");
    app.contentSearch.buildBatch();
    assert.equal((inspect.prepare("SELECT cursor FROM content_search_migration").get() as {cursor:number}).cursor,100);
    inspect.close();
  }
  app.close();
  if(scenario==="C2") {const host=new SqliteStore({dbPath:file,runMaintenance:false,contentSearchOwner:false});assert.equal(host.contentSearch,null);host.close();}
  if(scenario && scenario!=="C1" && scenario!=="S6") {console.log("PASS "+scenario);return;}
  const db=new Database(file);
  if(scenario==="S6") {registerContentSearchTextFunction(db);}
  // C1: no custom functions registered on this connection.
  const templates=db.prepare("SELECT * FROM messages WHERE id='w:t:m'").get() as Record<string,unknown>;
  const insert=db.prepare(`INSERT INTO messages(${Object.keys(templates).join(',')}) VALUES(${Object.keys(templates).map(()=>'?').join(',')})`);
  insert.run(...Object.values({...templates,id:"w:t:new"}));
  db.exec("UPDATE messages SET content='updated' WHERE id='w:t:new'");
  if(scenario!=="S6") assert((db.prepare("SELECT count(*) n FROM content_search_queue").get() as {n:number}).n>0);
  db.exec("DELETE FROM messages WHERE id='w:t:new'");
  // S6: a missing task must never abort message persistence.
  insert.run(...Object.values({...templates,id:"w:missing:m",task_id:"missing"}));
  if(scenario==="S6") {db.close();console.log("PASS S6 missing task does not abort writes");return;}
  db.exec("DELETE FROM tasks WHERE id='w:t'");
  db.exec("DELETE FROM workspaces WHERE id='w'");
  db.close();
  const reopened=new SqliteStore({dbPath:file,runMaintenance:false});
  while(reopened.contentSearch.buildBatch()) {}
  reopened.close();
  const check=new Database(file);
  for(const table of ["content_search_documents","content_search_tasks","content_search_dirty_tasks","content_search_queue"]) assert.equal((check.prepare(`SELECT count(*) n FROM ${table}`).get() as {n:number}).n,0,table);
  // S1: only the compact task vocabulary has an FTS index.
  assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name IN ('content_search_fts','content_search_scan')").all().length,0);
  // S7: extraction policy is persisted, independently of the backfill cursor.
  assert((check.prepare("SELECT extractor_version FROM content_search_migration").get() as {extractor_version:number}).extractor_version>=2);
  check.close();
  const host=new SqliteStore({dbPath:path.join(root,"host.sqlite"),runMaintenance:false,contentSearchOwner:false});
  assert.equal(host.contentSearch,null,"C2 host never creates or schedules an index");host.close();
  console.log("PASS review C1/C2/S1/S6/S7 plain connection writes, deletes, no orphans, ownership and version");
} finally {rmSync(root,{recursive:true,force:true});}

}
run();
