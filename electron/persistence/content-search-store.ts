import { ContentSearchTaskIndex } from "./content-search-task-index";
import type Database from "better-sqlite3";
import { resolveCurrentRepositoryDefaultWorkspaceId } from "../../src/store/repository.utils";
import { SearchTaskContentArgsSchema, type SearchTaskContentArgs, type SearchTaskContentResponse, type ContentSearchResult } from "../../src/lib/task-search/content-search";
import type { PersistenceRepositoryRegistryEntry, PersistenceWorkspaceShell, PersistenceTurnSummary } from "./types";
import { extractContentSearchText, registerContentSearchTextFunction } from "./content-search-text";

export type ContentSearchIndexMode = "fts5-trigram" | "fts5" | "like";
interface Source {
  loadRepositoryRegistry(): PersistenceRepositoryRegistryEntry[];
  loadWorkspaceShell(args: {workspaceId: string}): PersistenceWorkspaceShell | null;
  listTurns(args: {workspaceId: string; taskId: string; limit?: number}): PersistenceTurnSummary[];
}
interface Hit { workspace_id: string; task_id: string; message_id: string; text: string; score: number; matches: number; title: string; provider: string; updated_at: string; archived_at: string | null }
const BATCH_SIZE = 50;


/** Local-only, derived display-text index. Never reads vaults, attachments, or event payloads. */
export class ContentSearchStore {
  readonly mode: ContentSearchIndexMode;
  private pending: NodeJS.Immediate | null = null;
  private closed = false;
  private cursor: number;
  private upper: number;
  private indexed = 0;
  private total = 0;
  private queryDeadline=Infinity;
  private readonly queryBudgetMs: number;
  private taskIndex: ContentSearchTaskIndex;
  constructor(private db: Database.Database, private source: Source, options?: { mode?: ContentSearchIndexMode; schedule?: boolean; queryBudgetMs?: number }) {
    this.queryBudgetMs=options?.queryBudgetMs ?? 150;
    db.function("content_search_budget", {deterministic:false}, (_row: unknown) => {
      if(performance.now()>this.queryDeadline) throw new Error("Content search time budget exceeded");
      return 1;
    });
    registerContentSearchTextFunction(db);
    db.exec(`CREATE TABLE IF NOT EXISTS content_search_documents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL,
      message_id TEXT NOT NULL, task_key INTEGER NOT NULL, text TEXT NOT NULL, char_count INTEGER GENERATED ALWAYS AS(length(text)) STORED);
      CREATE INDEX IF NOT EXISTS content_search_task ON content_search_documents(workspace_id, task_id);
      CREATE INDEX IF NOT EXISTS content_search_scan ON content_search_documents(workspace_id,task_key,char_count,text);
      CREATE TABLE IF NOT EXISTS content_search_migration (id INTEGER PRIMARY KEY CHECK(id=1), cursor INTEGER NOT NULL);
      INSERT OR IGNORE INTO content_search_migration VALUES(1,0);`);
    this.mode = this.createIndex(options?.mode);
    this.taskIndex=new ContentSearchTaskIndex(db,this.mode);
    db.function("content_search_schedule",{deterministic:false},()=>{if(options?.schedule!==false) this.schedule();return 1;});
    const expression = "content_search_text(new.content, new.message_json, new.role)";
    db.exec(`DROP TRIGGER IF EXISTS content_search_message_update;
      CREATE TRIGGER IF NOT EXISTS content_search_message_insert AFTER INSERT ON messages BEGIN
      INSERT OR REPLACE INTO content_search_documents(id,workspace_id,task_id,message_id,task_key,text)
      VALUES(new.id,new.workspace_id,new.task_id,substr(new.id,length(new.workspace_id)+length(new.task_id)+3),(SELECT rowid FROM tasks WHERE id=new.workspace_id||':'||new.task_id),${expression}); END;
      CREATE TRIGGER IF NOT EXISTS content_search_message_update AFTER UPDATE OF content,message_json,role ON messages
      WHEN new.content IS NOT old.content OR new.message_json IS NOT old.message_json OR new.role IS NOT old.role BEGIN
      UPDATE content_search_documents SET text=${expression} WHERE id=new.id;
      INSERT INTO content_search_documents(id,workspace_id,task_id,message_id,task_key,text)
      SELECT new.id,new.workspace_id,new.task_id,substr(new.id,length(new.workspace_id)+length(new.task_id)+3),(SELECT rowid FROM tasks WHERE id=new.workspace_id||':'||new.task_id),${expression}
      WHERE NOT EXISTS(SELECT 1 FROM content_search_documents WHERE id=new.id); END;
      CREATE TRIGGER IF NOT EXISTS content_search_message_delete AFTER DELETE ON messages BEGIN
      DELETE FROM content_search_documents WHERE id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS content_search_task_delete AFTER DELETE ON tasks BEGIN
      DELETE FROM content_search_documents WHERE workspace_id=old.workspace_id AND task_id=substr(old.id,length(old.workspace_id)+2); END;
      CREATE TRIGGER IF NOT EXISTS content_search_workspace_delete AFTER DELETE ON workspaces BEGIN
      DELETE FROM content_search_documents WHERE workspace_id=old.id; END;`);
    this.cursor = (db.prepare("SELECT cursor FROM content_search_migration WHERE id=1").get() as {cursor: number}).cursor;
    this.upper = (db.prepare("SELECT coalesce(max(rowid),0) AS n FROM messages").get() as {n: number}).n;
    this.total = (db.prepare("SELECT count(*) AS n FROM messages WHERE rowid>? AND rowid<=?").get(this.cursor, this.upper) as {n: number}).n;
    if (options?.schedule !== false) this.schedule();
  }
  private createIndex(force?: ContentSearchIndexMode): ContentSearchIndexMode {
    const existing = this.db.prepare("SELECT sql FROM sqlite_master WHERE name='content_search_fts'").get() as {sql: string} | undefined;
    if (existing) return existing.sql.includes("trigram") ? "fts5-trigram" : "fts5";
    for (const mode of ["fts5-trigram", "fts5"] as const) {
      if (force === "like" || (force === "fts5" && mode === "fts5-trigram")) continue;
      try {
        this.db.exec(`CREATE VIRTUAL TABLE content_search_fts USING fts5(text, content='content_search_documents', content_rowid='rowid'${mode === "fts5-trigram" ? ", tokenize='trigram'" : ""})`);
        this.db.exec(`CREATE TRIGGER content_search_doc_insert AFTER INSERT ON content_search_documents BEGIN
          INSERT INTO content_search_fts(rowid,text) VALUES(new.rowid,new.text); END;
          CREATE TRIGGER content_search_doc_delete AFTER DELETE ON content_search_documents BEGIN
          INSERT INTO content_search_fts(content_search_fts,rowid,text) VALUES('delete',old.rowid,old.text); END;
          CREATE TRIGGER content_search_doc_update AFTER UPDATE ON content_search_documents BEGIN
          INSERT INTO content_search_fts(content_search_fts,rowid,text) VALUES('delete',old.rowid,old.text);
          INSERT INTO content_search_fts(rowid,text) VALUES(new.rowid,new.text); END;`);
        return mode;
      } catch { /* FTS support differs between installed runtimes. */ }
    }
    return "like";
  }
  private schedule() {
    if (this.closed || this.pending) return;
    this.pending = setImmediate(() => {
      this.pending = null;
      if (this.closed) return;
      try { if(this.buildBatch()) this.schedule(); }
      catch { console.warn("[persistence] content search indexing paused"); }
    });
    this.pending.unref?.();
  }
  /** One bounded transaction; startup schedules these between event-loop turns. */
  buildBatch(): boolean {
    const rows = this.db.prepare("SELECT rowid,id,workspace_id,task_id,content,message_json,role FROM messages WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT ?").all(this.cursor,this.upper,BATCH_SIZE) as Array<{rowid: number; id: string; workspace_id: string; task_id: string; content: string; message_json: string | null; role: string}>;
    this.db.transaction(() => {
      const write = this.db.prepare("INSERT OR IGNORE INTO content_search_documents(id,workspace_id,task_id,message_id,task_key,text) SELECT ?,?,?,?,(SELECT rowid FROM tasks WHERE id=?),? WHERE EXISTS(SELECT 1 FROM tasks WHERE id=? AND workspace_id=?) AND EXISTS(SELECT 1 FROM messages WHERE id=?)");
      const deadline=performance.now()+8;
      let processed=0;
      for (const row of rows) {
        write.run(row.id,row.workspace_id,row.task_id,row.id.slice(row.workspace_id.length+row.task_id.length+2),`${row.workspace_id}:${row.task_id}`,extractContentSearchText(row.content,row.message_json,row.role),`${row.workspace_id}:${row.task_id}`,row.workspace_id,row.id);
        this.cursor=row.rowid;
        processed++;
        if(performance.now()>=deadline) break;
      }
      if(rows.length===0) this.cursor=this.upper;
      this.indexed += processed;
      this.db.prepare("UPDATE content_search_migration SET cursor=? WHERE id=1").run(this.cursor);
    })();
    this.taskIndex.refreshBatch();
    return !this.status.complete;
  }
  get status() { return { indexed: this.indexed, total: this.total, complete: this.cursor >= this.upper && this.taskIndex.pending===0 }; }
  search(input: SearchTaskContentArgs): SearchTaskContentResponse {
    const args = SearchTaskContentArgsSchema.parse(input);
    const limit = args.limit ?? 20, offset = args.offset ?? 0;
    const places = new Map<string, Omit<ContentSearchResult,"taskId"|"title"|"provider"|"updatedAt"|"state"|"messageId"|"snippet"|"matchCount"|"parentTaskId"|"parentWorkspaceId"|"parentRepositoryPath">>();
    for (const repository of this.source.loadRepositoryRegistry()) {
      const defaultId = resolveCurrentRepositoryDefaultWorkspaceId({repositoryPath: repository.repositoryPath,workspaces: repository.workspaces,workspaceDefaultById: repository.workspaceDefaultById ?? {},workspacePathById: repository.workspacePathById ?? {}});
      for (const workspace of repository.workspaces) places.set(workspace.id, {
        repositoryPath:repository.repositoryPath,repositoryName:repository.repositoryName,
        workspaceId:workspace.id,workspaceName:workspace.name,workspaceBranch:repository.workspaceBranchById?.[workspace.id] ?? null,
        workspacePath:workspace.id===defaultId ? repository.repositoryPath : repository.workspacePathById?.[workspace.id] ?? repository.repositoryPath,
        isDefaultWorkspace:workspace.id===defaultId,
      });
    }
    const words = args.query.toLowerCase().split(/\s+/).filter(Boolean);
    const useFts = !args.taskId && this.mode === "fts5-trigram" && words.every(word=>Array.from(word).length>=3);
    const params: unknown[] = [JSON.stringify([...places.keys()])];
    const predicates = ["d.workspace_id IN (SELECT value FROM json_each(?))", "CASE WHEN (d.rowid & 63)=0 THEN content_search_budget(d.rowid) ELSE 1 END=1"];
    if (args.workspaceId) { predicates.push("d.workspace_id=?"); params.push(args.workspaceId); }
    if (args.taskId) { predicates.push("d.task_id=?"); params.push(args.taskId); }
    if (useFts) {predicates.push("content_search_fts MATCH ?");params.push(words.map(word=>'"'+word.replaceAll('"','""')+'"').join(" AND "));}
    else for (const word of words) {predicates.push("d.text LIKE ? ESCAPE '\\'");params.push('%'+word.replace(/[\\%_]/g,"\\$&")+'%');}
    const candidates = `SELECT d.id,d.workspace_id,d.task_id,d.message_id,d.task_key,d.char_count AS score FROM content_search_documents d ${useFts ? "JOIN content_search_fts ON content_search_fts.rowid=d.rowid" : ""} WHERE ${predicates.join(" AND ")}`;
    const group = args.taskId ? "id" : "task_key";
    const sql = `WITH candidates AS (${candidates}), ranked AS (
      SELECT id,workspace_id,task_id,message_id,min(score) AS score,count(*) AS matches FROM candidates GROUP BY ${group})
      SELECT r.*,d.text,t.title,t.provider,t.updated_at,t.archived_at FROM ranked r JOIN content_search_documents d ON d.id=r.id ${args.taskId ? "JOIN messages m ON m.id=r.id" : ""} JOIN tasks t ON t.id=r.workspace_id||':'||r.task_id AND t.workspace_id=r.workspace_id
      ORDER BY ${args.taskId ? "m.rowid ASC" : "matches DESC,score ASC,t.updated_at DESC,r.message_id DESC,t.id DESC"} LIMIT ? OFFSET ?`;
    this.queryDeadline=performance.now()+this.queryBudgetMs;
    let hits: Hit[];
    try {
      if(args.taskId) hits=this.db.prepare(sql).all(...params,limit+1,offset) as Hit[];
      else {
        const taskCandidates=this.taskIndex.candidates({workspaceIds:[...places.keys()],workspaceId:args.workspaceId,words,checkBudget:()=>{if(performance.now()>this.queryDeadline) throw new Error("Content search time budget exceeded");}});
        const exactSql=`SELECT d.id,d.message_id,d.text,min(d.char_count) AS density,count(*) AS matches
          FROM content_search_documents d WHERE d.workspace_id=? AND d.task_id=? AND content_search_budget(d.rowid)=1 AND ${words.map(()=>"d.text LIKE ? ESCAPE '\\'").join(" AND ")} HAVING count(*)>0`;
        const exact=this.db.prepare(exactSql);
        const literals=words.map(word=>'%'+word.replace(/[\\%_]/g,"\\$&")+'%');
        hits=[];
        let matching=0;
        for(const candidate of taskCandidates) {
          if(performance.now()>this.queryDeadline) throw new Error("Content search time budget exceeded");
          const match=exact.get(candidate.workspace_id,candidate.task_id,...literals) as {message_id:string;text:string;matches:number}|undefined;
          if(!match) continue;
          if(matching++<offset) continue;
          hits.push({...candidate,...match});
          if(hits.length>limit) break;
        }
      }
    }
    catch(error) {
      if(error instanceof Error && error.message==="Content search time budget exceeded") return {ok:false,message:"Search took too long. Try a more specific phrase."};
      throw error;
    } finally {this.queryDeadline=Infinity;}
    const shells = new Map<string,PersistenceWorkspaceShell|null>();
    const results = hits.slice(0,limit).map(row => {
      let shell = shells.get(row.workspace_id);
      if (shell === undefined) {shell=this.source.loadWorkspaceShell({workspaceId:row.workspace_id});shells.set(row.workspace_id,shell);}
      const task = shell?.tasks.find(task=>task.id===row.task_id);
      const turn = this.source.listTurns({workspaceId:row.workspace_id,taskId:row.task_id,limit:1})[0];
      const outcome = turn?.terminalReceipt?.outcome;
      const state = row.archived_at ? "archived" : !turn ? "new" : !turn.completedAt ? "running" : outcome === "failed" ? "failed" : outcome === "cancelled" ? "cancelled" : "completed";
      const parentOwners=task?.parentTaskId ? this.db.prepare("SELECT workspace_id FROM tasks WHERE id=workspace_id||':'||? ORDER BY workspace_id=? DESC LIMIT 2").all(task.parentTaskId,row.workspace_id) as Array<{workspace_id:string}> : [];
      const parentWorkspaceId=parentOwners[0]?.workspace_id ?? null;
      const parentRepositoryPath=parentWorkspaceId ? places.get(parentWorkspaceId)?.repositoryPath ?? null : null;
      const at = row.text.toLowerCase().indexOf(words[0] ?? "");
      const start = Math.max(0,at-60), end=Math.min(row.text.length,start+240);
      return {...places.get(row.workspace_id)!, taskId:row.task_id,title:row.title,provider:row.provider,updatedAt:row.updated_at,state,
        messageId:row.message_id,snippet:(start?"…":"")+row.text.slice(start,end)+(end<row.text.length?"…":""),matchCount:row.matches,parentTaskId:task?.parentTaskId ?? null,parentWorkspaceId,parentRepositoryPath} satisfies ContentSearchResult;
    });
    return {ok:true,results,nextOffset:hits.length>limit ? offset+limit : null,indexing:this.status};
  }
  close() {this.closed=true;if(this.pending) clearImmediate(this.pending);}
}
