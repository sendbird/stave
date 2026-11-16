import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ContentSearchStore, type ContentSearchIndexMode } from "../electron/persistence/content-search-store";
import { extractContentSearchText } from "../electron/persistence/content-search-text";
import { SearchTaskContentArgsSchema, SearchTaskContentResponseSchema } from "../src/lib/task-search/content-search";
import { SqliteStore } from "../electron/persistence/sqlite-store";

async function main() {
const root=mkdtempSync(path.join(tmpdir(),"content-search-"));
function setup(file=":memory:") {
  const db=new Database(file);
  db.exec(`CREATE TABLE messages(id TEXT PRIMARY KEY,workspace_id TEXT,task_id TEXT,role TEXT,content TEXT,message_json TEXT);
  CREATE TABLE tasks(id TEXT PRIMARY KEY,workspace_id TEXT,title TEXT,provider TEXT,updated_at TEXT,archived_at TEXT);
  CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES('w');`);
  const source={
    loadRepositoryRegistry:()=>[{repositoryPath:"/tmp/project",repositoryName:"project",workspaces:[{id:"w",name:"workspace"}],workspacePathById:{w:"/tmp/project"},workspaceBranchById:{w:"main"},workspaceDefaultById:{w:true}},{repositoryPath:"/tmp/parent-project",repositoryName:"parent-project",workspaces:[{id:"other",name:"Parent workspace"}],workspacePathById:{other:"/tmp/parent-project"},workspaceDefaultById:{other:true}}],
    loadWorkspaceShell:()=>({activeTaskId:"t",tasks:[{id:"t",title:"Task",provider:"codex" as const,updatedAt:"2026-11-16",unread:false,parentTaskId:"parent"}]}),
    listTurns:()=>[],
  };
  const task=db.prepare("INSERT INTO tasks VALUES(?, 'w',?, 'codex',?,?)");
  const message=db.prepare("INSERT INTO messages VALUES(?, 'w',?, 'user',?,?)");
  return {db,source,task,message};
}
function results(index:ContentSearchStore,query:string,rest={}) {
  (index as unknown as {db:Database.Database}).db.exec("UPDATE content_search_queue SET ready=1");
  while(index.buildBatch()) {}
  const response=index.search({query,...rest});assert(response.ok);return response;
}
try {
  for (const mode of ["fts5-trigram","fts5","like"] as ContentSearchIndexMode[]) {
    const {db,source,task,message}=setup();task.run("w:t","Task","2026-11-16",null);
    const index=new ContentSearchStore(db,source,{mode,schedule:false});assert.equal(index.mode,mode);
    message.run("w:t:m","t","내보내기 재시도 export retry",null);
    assert.equal(results(index,"내보내").results.length,1);assert.equal(results(index,"보내").results.length,1);assert.equal(results(index,"xpor").results.length,1);
    assert.equal(results(index,"export").results[0]?.parentTaskId,"parent");
    db.prepare("INSERT INTO tasks VALUES('other:parent','other','Parent','codex','2026-11-16',NULL)").run();
    assert.equal(results(index,"export").results[0]?.parentWorkspaceId,"other");
    assert.equal(results(index,"export").results[0]?.parentRepositoryPath,"/tmp/parent-project");
    assert.equal(results(index,"export").results[0]?.messageId,"m");
    while(index.buildBatch()) { /* Also build compact task candidates. */ }
    assert.equal(results(index,"export").results[0]?.messageId,"m");
    db.prepare("UPDATE messages SET content=content,message_json=message_json,role=role WHERE id='w:t:m'").run();
    assert(index.status.complete);
    db.prepare("UPDATE messages SET content='changed phrase' WHERE id='w:t:m'").run();
    assert.equal(results(index,"export").results.length,0);assert.equal(results(index,"changed").results.length,1);
    assert(index.status.complete);
    while(index.buildBatch()) { /* Dirty tasks refresh between reads. */ }
    assert.equal(results(index,"changed").results.length,1);
    db.prepare("DELETE FROM messages").run();assert.equal(results(index,"changed").results.length,0);
    message.run("w:t:m2","t","orphan test",null);db.prepare("DELETE FROM tasks").run();
    assert.equal((db.prepare("SELECT count(*) n FROM content_search_documents").get() as {n:number}).n,0);
    assert.equal((db.prepare("SELECT count(*) n FROM content_search_tasks").get() as {n:number}).n,0);
    assert.equal((db.prepare("SELECT count(*) n FROM content_search_dirty_tasks").get() as {n:number}).n,0);
    task.run("w:t","Task","2026-11-16",null);message.run("w:t:m3","t","workspace removal",null);db.prepare("DELETE FROM workspaces").run();
    assert.equal((db.prepare("SELECT count(*) n FROM content_search_documents").get() as {n:number}).n,0);
    assert.equal((db.prepare("SELECT count(*) n FROM content_search_tasks").get() as {n:number}).n,0);
    assert.equal((db.prepare("SELECT count(*) n FROM content_search_dirty_tasks").get() as {n:number}).n,0);
    if(mode!=="like") assert.equal((db.prepare("SELECT count(*) n FROM content_search_tasks_fts WHERE content_search_tasks_fts MATCH 'changed'").get() as {n:number}).n,0);
    index.close();db.close();
  }
  for(const missing of ["trigram","fts5"]) {
    const {db,source}=setup();
    const execute=db.exec.bind(db);
    db.exec=(sql:string)=>{if(sql.includes("CREATE VIRTUAL TABLE") && (missing==="fts5" || sql.includes("trigram"))) throw new Error("Tokenizer unavailable");return execute(sql);};
    const fallback=new ContentSearchStore(db,source,{schedule:false});assert.equal(fallback.mode,missing==="trigram"?"fts5":"like");fallback.close();db.close();
  }
  const budgetFixture=setup();
  const budgetIndex=new ContentSearchStore(budgetFixture.db,{...budgetFixture.source,loadRepositoryRegistry:()=>{
    const end=performance.now()+15;while(performance.now()<end) {}return [];
  }},{schedule:false,queryBudgetMs:1});
  assert.equal(budgetIndex.search({query:"anything"}).ok,false,"Metadata reads count inside the query deadline");
  budgetIndex.close();budgetFixture.db.close();
  const execute=Database.prototype.exec;
  let creationFailed=false;
  Database.prototype.exec=function(sql:string) {
    if(!creationFailed && sql.includes("CREATE TABLE IF NOT EXISTS content_search_documents")) {
      creationFailed=true;throw Object.assign(new Error("Writer lock during initialization"),{code:"SQLITE_BUSY"});
    }
    return execute.call(this,sql);
  };
  let initializing:SqliteStore;
  try {initializing=new SqliteStore({dbPath:path.join(root,"initialization.sqlite"),runMaintenance:false});}
  finally {Database.prototype.exec=execute;}
  assert.equal(initializing.contentSearch,null);
  const until=performance.now()+2000;
  while(!initializing.contentSearch && performance.now()<until) await new Promise(resolve=>setTimeout(resolve,10));
  assert(initializing.contentSearch,"Transient schema creation locks must retry instead of disabling search");initializing.close();
  console.log("PASS metadata budget and retry after an index initialization lock (real SQLite)");
  const split=setup();split.task.run("w:t","Split phrases","2026-11-16",null);split.task.run("w:b","Whole phrase","2026-11-15",null);
  split.message.run("w:t:export","t","export",null);split.message.run("w:t:retry","t","retry",null);
  split.message.run("w:b:both","b","export retry complete phrase with enough additional vocabulary to rank below the short split task candidate",null);
  const splitIndex=new ContentSearchStore(split.db,split.source,{schedule:false});while(splitIndex.buildBatch()) {}
  const verified=results(splitIndex,"export retry",{limit:1});assert.equal(verified.results.length,1);assert.equal(verified.results[0]?.taskId,"b");assert.equal(verified.nextOffset,null);
  splitIndex.close();split.db.close();
  console.log("PASS tokenizer fallback, Korean, partial words, delegated parent, insert/update/delete, task/workspace cleanup (real SQLite)");
  const safe=extractContentSearchText("rawfallback",JSON.stringify({parts:[{type:"text",text:"public secret=privatevalue sk-abcdefghijklmnopqrst"},{type:"tool_use",toolName:"Read file",input:"rawinputsecret",output:"rawoutputsecret"},{type:"attachment",bytes:"attachmentbytes"},{type:"secret",value:"vaultsecret"}]}),"assistant");
  for(const excluded of ["privatevalue","sk-abcdefghijklmnopqrst","rawinputsecret","rawoutputsecret","attachmentbytes","vaultsecret","rawfallback"]) assert(!safe.includes(excluded),excluded);
  assert(safe.includes("Read file"));
  const file=path.join(root,"existing.sqlite");
  const {db,source,task,message}=setup(file);
  task.run("w:t","Task","2026-11-16","2026-11-16");task.run("w:b","Older","2026-11-15",null);
  for(let n=0;n<450;n++) message.run(`w:t:m${n}`,"t",`migration export ${n}`,null);
  message.run("w:b:one","b","migration unrelated export",null);
  const index=new ContentSearchStore(db,source,{schedule:false});assert(!index.status.complete);
  index.buildBatch();assert(index.status.indexed>0 && index.status.indexed<=50);index.close();db.close();
  const reopened=new Database(file);const restored=new ContentSearchStore(reopened,source,{schedule:false});
  while(restored.buildBatch()) { /* Explicit draining in tests only. */ }
  assert(restored.status.complete);assert.equal((reopened.prepare("SELECT count(*) n FROM content_search_documents").get() as {n:number}).n,451);
  assert(SearchTaskContentArgsSchema.safeParse({query:"export",offset:10000}).success);
  assert(!SearchTaskContentArgsSchema.safeParse({query:"export",offset:10001}).success);
  const boundary=results(restored,"export",{offset:10000});assert.equal(boundary.nextOffset,null);
  assert(!SearchTaskContentResponseSchema.safeParse({...boundary,nextOffset:10001}).success);
  const first=results(restored,"export",{limit:1});assert(first.nextOffset===1);assert.equal(first.results[0]?.taskId,"b");
  const second=results(restored,"export",{limit:1,offset:1});assert.notEqual(first.results[0]?.taskId,second.results[0]?.taskId);
  assert.equal(results(restored,"export",{taskId:"t",limit:50}).results.length,50);
  assert.equal(results(restored,"export").results.find(hit=>hit.taskId==="t")?.state,"archived");
  assert.equal((reopened.prepare("SELECT count(*) n FROM content_search_tasks").get() as {n:number}).n,2);
  reopened.prepare("UPDATE messages SET content='phase resume' WHERE id='w:t:m0'").run();
  assert(restored.status.complete);
  restored.close();reopened.close();
  const phaseDb=new Database(file);const phaseIndex=new ContentSearchStore(phaseDb,source,{schedule:false});
  assert(phaseIndex.status.complete);while(phaseIndex.buildBatch()) {}
  assert.equal(results(phaseIndex,"phase resume").results[0]?.messageId,"m0");phaseIndex.close();phaseDb.close();
  console.log("PASS durable bounded migration/resume, ranking/pagination, whole-task matches, archived label, privacy extraction (real SQLite)");
  const scheduled=setup();scheduled.task.run("w:t","Scheduled","2026-11-16",null);
  scheduled.db.transaction(()=>{for(let n=0;n<2000;n++) scheduled.message.run(`w:t:async${n}`,"t","background migration heartbeat",null);})();
  const background=new ContentSearchStore(scheduled.db,scheduled.source);
  let beats=0,sawProgress=false;
  while(!background.status.complete) {await new Promise<void>(resolve=>setImmediate(resolve));beats++;sawProgress ||= background.status.indexed>0 && !background.status.complete;}
  assert(beats>1 && sawProgress);background.close();scheduled.db.close();
  console.log("PASS background migration yields to event-loop heartbeat before completion (real SQLite)");
  const locked=setup(path.join(root,"locked.sqlite"));
  locked.db.pragma("journal_mode=WAL");locked.db.pragma("busy_timeout=10");
  locked.task.run("w:t","Contended migration","2026-11-16",null);
  for(let n=0;n<200;n++) locked.message.run(`w:t:locked${n}`,"t","lock recovery migration",null);
  const recovering=new ContentSearchStore(locked.db,locked.source);
  const competing=new Database(path.join(root,"locked.sqlite"));
  competing.exec("BEGIN IMMEDIATE");
  let observedBusy=false;
  let release:ReturnType<typeof setTimeout>|undefined;
  const attempt=recovering.buildBatch.bind(recovering);
  recovering.buildBatch=()=>{
    try {return attempt();}
    catch(error) {
      if(!observedBusy && error && typeof error==="object" && "code" in error && error.code==="SQLITE_BUSY") {
        observedBusy=true;
        release=setTimeout(()=>competing.exec("COMMIT"),20);
      }
      throw error;
    }
  };
  const recoveryDeadline=performance.now()+2000;
  while(!recovering.status.complete && performance.now()<recoveryDeadline) await new Promise<void>(resolve=>setTimeout(resolve,10));
  if(release) clearTimeout(release);
  assert(observedBusy,"The fixture must actually encounter the competing writer lock");
  assert(recovering.status.complete,"Background indexing must recover after a competing writer releases its lock without a new message write");
  recovering.close();competing.close();locked.db.close();
  console.log("PASS background migration resumes after a competing SQLite writer releases its lock (real SQLite)");
  const appFile=path.join(root,"app.sqlite");let app=new SqliteStore({dbPath:appFile,runMaintenance:false});
  app.saveRepositoryRegistry({repositories:[{repositoryPath:"/tmp/project",repositoryName:"project",workspaces:[{id:"w",name:"workspace"}],workspacePathById:{w:"/tmp/project"},workspaceBranchById:{w:"main"},workspaceDefaultById:{w:true}}]});
  app.upsertWorkspace({id:"w",name:"workspace",snapshot:{activeTaskId:"t",tasks:[{id:"t",title:"Task",provider:"codex",updatedAt:"2026-11-16",unread:false}],messagesByTask:{t:Array.from({length:300},(_,n)=>({id:`m${n}`,role:"user",model:"user",providerId:"codex",content:`stored export ${n}`,parts:[{type:"text",text:`stored export ${n}`}]}))}}});
  assert(app.searchTaskContent({query:"export"}).ok);
  const change={workspaceId:"w",taskId:"t",messages:[{id:"m10",role:"user" as const,model:"user",providerId:"codex",content:"anchorchanged",parts:[{type:"text",text:"anchorchanged"}]}]};
  app.persistTaskTurnDelta(change);
  new Database(appFile).exec("UPDATE content_search_queue SET ready=1");
  while(app.contentSearch.buildBatch()) {}
  app.persistTaskTurnDelta(change);assert(app.contentSearch.status.complete);
  const changed=app.searchTaskContent({query:"anchorchanged"});assert(changed.ok && changed.results[0]?.messageId==="m10");
  const hostWriter=new SqliteStore({dbPath:appFile,runMaintenance:false,contentSearchOwner:false});
  hostWriter.persistTaskTurnDelta({workspaceId:"w",taskId:"t",messages:[{id:"idle-host",role:"user",model:"user",providerId:"user",content:"idlehostneedle",parts:[]}]});
  assert.equal(hostWriter.contentSearch,null);
  const idleDeadline=performance.now()+6000;
  let idleIndexed=false;
  while(!idleIndexed && performance.now()<idleDeadline) {
    await new Promise(resolve=>setTimeout(resolve,100));
    const response=app.searchTaskContent({query:"idlehostneedle"});idleIndexed=response.ok && response.results.length===1;
  }
  assert(idleIndexed,"Main drains host writes while idle without another user action");hostWriter.close();
  console.log("PASS idle main-only drain of host-service writes (real SQLite)");
  app.close();app=new SqliteStore({dbPath:appFile,runMaintenance:false});
  const afterRestart=app.searchTaskContent({query:"anchorchanged"});assert(afterRestart.ok && afterRestart.results[0]?.messageId==="m10");
  const anchored=app.loadTaskMessagesPage({workspaceId:"w",taskId:"t",messageId:"m10",limit:20});assert(anchored?.messages.some(message=>message.id==="m10"));
  assert(anchored && anchored.offset>200);
  app.removeTaskFromWorkspace({workspaceId:"w",taskId:"t"});
  const afterTask=app.searchTaskContent({query:"export"});assert(afterTask.ok && afterTask.results.length===0);
  app.upsertWorkspace({id:"w",name:"workspace",snapshot:{activeTaskId:"t",tasks:[{id:"t",title:"Task",provider:"codex",updatedAt:"2026-11-16",unread:false}],messagesByTask:{t:[{id:"again",role:"user",model:"user",providerId:"codex",content:"workspace export",parts:[]}]}}});
  app.closeWorkspace({workspaceId:"w"});
  const afterWorkspace=app.searchTaskContent({query:"export"});assert(afterWorkspace.ok && afterWorkspace.results.length===0);
  app.close();
  const inspect=new Database(appFile);assert.equal((inspect.prepare("SELECT count(*) n FROM content_search_documents").get() as {n:number}).n,0);inspect.close();
  console.log("PASS application store integration and old-message anchor window (real SQLite)");
} finally {rmSync(root,{recursive:true,force:true});}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
