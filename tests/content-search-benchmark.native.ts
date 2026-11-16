import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerContentSearchTextFunction } from "../electron/persistence/content-search-text";
import { ContentSearchStore } from "../electron/persistence/content-search-store";

const dir=mkdtempSync(path.join(tmpdir(),"content-search-bench-"));
const reuse=process.env.CONTENT_SEARCH_BENCH_DB;
const db=new Database(reuse ?? path.join(dir,"benchmark.sqlite"));
registerContentSearchTextFunction(db);
db.pragma("journal_mode=WAL");db.pragma("synchronous=NORMAL");
if(!reuse) db.exec(`CREATE TABLE messages(id TEXT PRIMARY KEY,workspace_id TEXT,task_id TEXT,role TEXT,content TEXT,message_json TEXT);
CREATE TABLE tasks(id TEXT PRIMARY KEY,workspace_id TEXT,title TEXT,provider TEXT,updated_at TEXT,archived_at TEXT);
CREATE TABLE workspaces(id TEXT PRIMARY KEY);INSERT INTO workspaces VALUES('w');`);
const task=db.prepare("INSERT INTO tasks VALUES(?,'w',?,'codex',?,NULL)");
const msg=db.prepare("INSERT INTO messages VALUES(?,'w',?,?,?,?)");
const tasks=Array.from({length:2000},(_,i)=>({id:`t${i}`,title:`Task ${i}`,provider:"codex" as const,updatedAt:new Date(1700000000000+i*1000).toISOString(),unread:false}));
if(!reuse) db.transaction(()=>{
  for(const entry of tasks) {
    task.run(`w:${entry.id}`,entry.title,entry.updatedAt);
    for(let n=0;n<100;n++) {
      const text=`Message ${n}: We discussed the export retry policy and recovery workflow. 내보내기 재시도 정책을 검토했습니다. 담당 작업 ${entry.id}. ${n===17 ? `Selective needle${entry.id}` : "Review implementation details, preserve message history, and verify the result before completing the task."}`;
      msg.run(`w:${entry.id}:m${n}`,entry.id,n%2?"assistant":"user",text,JSON.stringify({parts:[{type:"text",text}]}));
    }
  }
})();
const source={loadRepositoryRegistry:()=>[{repositoryPath:"/tmp/project",repositoryName:"project",workspaces:[{id:"w",name:"Workspace"}],workspacePathById:{w:"/tmp/project"},workspaceDefaultById:{w:true}}],loadWorkspaceShell:()=>({activeTaskId:"t0",tasks}),listTurns:()=>[]};
const baseBytes=(db.prepare("SELECT page_count * page_size AS n FROM pragma_page_count(),pragma_page_size()").get() as {n:number}).n;
const started=performance.now();const index=new ContentSearchStore(db,source,{schedule:false,queryBudgetMs:10_000});const startup=performance.now()-started;
let batches=0,maxBatch=0;while(!index.status.complete){const at=performance.now();index.buildBatch();maxBatch=Math.max(maxBatch,performance.now()-at);batches++;}
const buildMs=performance.now()-started;console.error("Index ready", {buildMs,maxBatch});
const queries=["needlet137","내보내기","재시","export retry","policy","없는검색어","xpor"];
const outcomes=[];
for(const query of queries) {
  for(let n=0;n<3;n++) {const result=index.search({query});if(!result.ok) throw new Error(result.message);}
  const times=[];for(let n=0;n<20;n++){const at=performance.now();const result=index.search({query});if(!result.ok) throw new Error(result.message);times.push(performance.now()-at);}
  console.error("Measured",query);
  times.sort((a,b)=>a-b);outcomes.push({query,p50Ms:+times[10]!.toFixed(2),p95Ms:+times[18]!.toFixed(2),maxMs:+times[19]!.toFixed(2)});
}
const indexBytes=(db.prepare("SELECT page_count * page_size AS n FROM pragma_page_count(),pragma_page_size()").get() as {n:number}).n-baseBytes;
console.log(JSON.stringify({indexBytes,tasks:2000,messages:200000,mode:index.mode,queryBudgetMs:10000,successfulQueries:queries.length*20,startupMs:+startup.toFixed(2),indexBuildMs:+buildMs.toFixed(2),batches,maxBatchMs:+maxBatch.toFixed(2),queries:outcomes},null,2));
index.close();db.close();rmSync(dir,{recursive:true,force:true});
