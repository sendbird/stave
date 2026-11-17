import type Database from "better-sqlite3";
import type { ContentSearchIndexMode } from "./content-search-store";

export interface TaskContentCandidate {
  task_key: number; workspace_id: string; task_id: string; score: number;
  title: string; provider: string; updated_at: string; archived_at: string | null;
}

/** Compact lexical documents select tasks before reading individual message matches. */
export class ContentSearchTaskIndex {
  readonly mode: ContentSearchIndexMode;
  constructor(private db: Database.Database, mode: ContentSearchIndexMode) {
    const existed = db.prepare("SELECT 1 FROM sqlite_master WHERE name='content_search_tasks'").get();
    db.exec(`CREATE TABLE IF NOT EXISTS content_search_tasks (
      task_key INTEGER PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, text TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS content_search_dirty_tasks (
      task_key INTEGER PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS content_search_tasks_workspace ON content_search_tasks(workspace_id);`);
    this.mode=this.createIndex(mode);
    for(const event of ["INSERT","UPDATE","DELETE"]) {
      const row=event==="DELETE"?"old":"new";
      db.exec(`CREATE TRIGGER IF NOT EXISTS content_search_task_dirty_${event.toLowerCase()} AFTER ${event} ON content_search_documents BEGIN
        INSERT INTO content_search_dirty_tasks(task_key,workspace_id,task_id)
        SELECT ${row}.task_key,${row}.workspace_id,${row}.task_id
        WHERE EXISTS(SELECT 1 FROM tasks WHERE rowid=${row}.task_key)
        AND NOT EXISTS(SELECT 1 FROM content_search_dirty_tasks WHERE task_key=${row}.task_key);
        END;`);
    }
    db.exec(`CREATE TRIGGER IF NOT EXISTS content_search_task_index_delete AFTER DELETE ON tasks BEGIN
      DELETE FROM content_search_tasks WHERE task_key=old.rowid;
      DELETE FROM content_search_dirty_tasks WHERE task_key=old.rowid; END;
      CREATE TRIGGER IF NOT EXISTS content_search_task_workspace_delete AFTER DELETE ON workspaces BEGIN
      DELETE FROM content_search_tasks WHERE workspace_id=old.id;
      DELETE FROM content_search_dirty_tasks WHERE workspace_id=old.id; END;`);
    if(!existed) db.exec(`INSERT INTO content_search_dirty_tasks
      SELECT t.rowid,t.workspace_id,substr(t.id,length(t.workspace_id)+2) FROM tasks t
      WHERE EXISTS(SELECT 1 FROM content_search_documents d
        WHERE d.workspace_id=t.workspace_id AND d.task_id=substr(t.id,length(t.workspace_id)+2));`);
  }
  private createIndex(mode: ContentSearchIndexMode): ContentSearchIndexMode {
    const existing=this.db.prepare("SELECT sql FROM sqlite_master WHERE name='content_search_tasks_fts'").get() as {sql:string}|undefined;
    if(mode==="like") return mode;
    for(const attempt of existing ? [existing.sql.includes("trigram") ? "fts5-trigram" : "fts5"] as const : mode==="fts5-trigram" ? ["fts5-trigram","fts5"] as const : ["fts5"] as const) {
      try {
        this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS content_search_tasks_fts USING fts5(text,content='content_search_tasks',content_rowid='task_key'${attempt==="fts5-trigram"?",tokenize='trigram'":""});
          CREATE TRIGGER IF NOT EXISTS content_search_tasks_insert AFTER INSERT ON content_search_tasks BEGIN
          INSERT INTO content_search_tasks_fts(rowid,text) VALUES(new.task_key,new.text); END;
          CREATE TRIGGER IF NOT EXISTS content_search_tasks_delete AFTER DELETE ON content_search_tasks BEGIN
          INSERT INTO content_search_tasks_fts(content_search_tasks_fts,rowid,text) VALUES('delete',old.task_key,old.text); END;
          CREATE TRIGGER IF NOT EXISTS content_search_tasks_update AFTER UPDATE ON content_search_tasks BEGIN
          INSERT INTO content_search_tasks_fts(content_search_tasks_fts,rowid,text) VALUES('delete',old.task_key,old.text);
          INSERT INTO content_search_tasks_fts(rowid,text) VALUES(new.task_key,new.text); END;`);
        return attempt;
      } catch(error) {
        if(error && typeof error==="object" && "code" in error && /^SQLITE_(BUSY|LOCKED)/.test(String(error.code))) throw error;
      }
    }
    return "like";
  }
  get pending() {return (this.db.prepare("SELECT count(*) AS n FROM content_search_dirty_tasks d WHERE NOT EXISTS(SELECT 1 FROM content_search_queue q WHERE q.workspace_id=d.workspace_id AND q.task_id=d.task_id)").get() as {n:number}).n;}
  refreshBatch() {
    this.db.transaction(()=>{
      const dirty=this.db.prepare("SELECT * FROM content_search_dirty_tasks d WHERE NOT EXISTS(SELECT 1 FROM content_search_queue q WHERE q.workspace_id=d.workspace_id AND q.task_id=d.task_id) ORDER BY task_key LIMIT 1").get() as {task_key:number;workspace_id:string;task_id:string}|undefined;
      if(!dirty) return;
      const rows=this.db.prepare("SELECT text FROM content_search_documents WHERE workspace_id=? AND task_id=? ORDER BY rowid").all(dirty.workspace_id,dirty.task_id) as {text:string}[];
      // A word is kept whole, preserving every partial-word match. Repeated vocabulary is stored once.
      // Message-level verification below rejects words found only across separate messages.
      const vocabulary=new Set<string>();
      for(const row of rows) for(const word of row.text.toLowerCase().split(/\s+/)) if(word) vocabulary.add(word);
      const exists=this.db.prepare("SELECT 1 FROM tasks WHERE rowid=?").get(dirty.task_key);
      if(exists && rows.length) this.db.prepare(`INSERT INTO content_search_tasks(task_key,workspace_id,task_id,text) VALUES(?,?,?,?)
        ON CONFLICT(task_key) DO UPDATE SET text=excluded.text`).run(dirty.task_key,dirty.workspace_id,dirty.task_id,[...vocabulary].join(" "));
      else this.db.prepare("DELETE FROM content_search_tasks WHERE task_key=?").run(dirty.task_key);
      this.db.prepare("DELETE FROM content_search_dirty_tasks WHERE task_key=?").run(dirty.task_key);
    })();
  }
  candidates(args:{workspaceIds:string[];workspaceId?:string;words:string[];checkBudget:()=>void}):TaskContentCandidate[] {
    const fts=this.mode==="fts5-trigram" && args.words.every(word=>Array.from(word).length>=3);
    const params:unknown[]=[JSON.stringify(args.workspaceIds)];
    const where=["d.workspace_id IN (SELECT value FROM json_each(?))","NOT EXISTS(SELECT 1 FROM content_search_dirty_tasks q WHERE q.task_key=d.task_key)","content_search_budget(d.task_key)=1"];
    if(args.workspaceId){where.push("d.workspace_id=?");params.push(args.workspaceId);}
    if(fts){where.push("content_search_tasks_fts MATCH ?");params.push(args.words.map(word=>'"'+word.replaceAll('"','""')+'"').join(" AND "));}
    else for(const word of args.words){where.push("d.text LIKE ? ESCAPE '\\'");params.push('%'+word.replace(/[\\%_]/g,"\\$&")+'%');}
    const clean=this.db.prepare(`SELECT d.task_key,d.workspace_id,d.task_id,${fts?"bm25(content_search_tasks_fts)":"0"} AS score,
      t.title,t.provider,t.updated_at,t.archived_at FROM content_search_tasks d
      ${fts?"JOIN content_search_tasks_fts ON content_search_tasks_fts.rowid=d.task_key":""}
      JOIN tasks t ON t.rowid=d.task_key WHERE ${where.join(" AND ")}`).all(...params) as TaskContentCandidate[];
    const dirty=this.db.prepare(`SELECT d.*, -1.0 AS score,t.title,t.provider,t.updated_at,t.archived_at FROM content_search_dirty_tasks d
      JOIN tasks t ON t.rowid=d.task_key WHERE content_search_budget(d.task_key)=1 AND d.workspace_id IN (SELECT value FROM json_each(?)) ${args.workspaceId?"AND d.workspace_id=?":""}`).all(JSON.stringify(args.workspaceIds),...(args.workspaceId?[args.workspaceId]:[])) as TaskContentCandidate[];
    let comparisons=0;
    args.checkBudget();
    const ordered=[...dirty,...clean].sort((a,b)=>{
      if((++comparisons & 63)===0) args.checkBudget();
      return a.score-b.score || b.updated_at.localeCompare(a.updated_at) || a.task_key-b.task_key;
    });
    args.checkBudget();
    return ordered;
  }
}
