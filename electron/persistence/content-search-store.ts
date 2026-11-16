import { ContentSearchTaskIndex } from "./content-search-task-index";
import type Database from "better-sqlite3";
import { resolveCurrentRepositoryDefaultWorkspaceId } from "../../src/store/repository.utils";
import { CONTENT_SEARCH_MAX_OFFSET, SearchTaskContentArgsSchema, type SearchTaskContentArgs, type SearchTaskContentResponse, type ContentSearchResult } from "../../src/lib/task-search/content-search";
import type { PersistenceRepositoryRegistryEntry, PersistenceWorkspaceShell, PersistenceTurnSummary } from "./types";
import { extractContentSearchText } from "./content-search-text";

export type ContentSearchIndexMode = "fts5-trigram" | "fts5" | "like";
interface Source {
  loadRepositoryRegistry(): PersistenceRepositoryRegistryEntry[];
  loadWorkspaceShell(args: {workspaceId: string}): PersistenceWorkspaceShell | null;
  listTurns(args: {workspaceId: string; taskId: string; limit?: number}): PersistenceTurnSummary[];
}
interface Hit { workspace_id: string; task_id: string; message_id: string; text: string; score: number; matches: number; title: string; provider: string; updated_at: string; archived_at: string | null }
const BATCH_SIZE = 25;
export const CONTENT_SEARCH_EXTRACTOR_VERSION = 2;


/** Local-only, derived display-text index. Never reads vaults, attachments, or event payloads. */
export class ContentSearchStore {
  readonly mode: ContentSearchIndexMode;
  private pending: NodeJS.Immediate | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryAttempt = 0;
  private closed = false;
  private cursor: number;
  private upper: number;
  private indexed = 0;
  private total = 0;
  private queryDeadline=Infinity;
  private readonly queryBudgetMs: number;
  private metadataCache=new Map<string,{expires:number;value:unknown}>();
  private cached<T>(key:string,read:()=>T):T {
    this.checkBudget();
    const cached=this.metadataCache.get(key);
    if(cached && cached.expires>performance.now()) return cached.value as T;
    const value=read(); this.checkBudget();
    this.metadataCache.set(key,{expires:performance.now()+500,value});return value;
  }
  private checkBudget() {if(performance.now()>this.queryDeadline) throw new Error("Content search time budget exceeded");}
  private idleTimer: NodeJS.Timeout | null = null;
  private taskIndex: ContentSearchTaskIndex;
  constructor(private db: Database.Database, private source: Source, options?: { mode?: ContentSearchIndexMode; schedule?: boolean; queryBudgetMs?: number }) {
    this.queryBudgetMs=options?.queryBudgetMs ?? 150;
    db.function("content_search_budget", {deterministic:false}, (_row: unknown) => {
      if(performance.now()>this.queryDeadline) throw new Error("Content search time budget exceeded");
      return 1;
    });

    db.exec(`CREATE TABLE IF NOT EXISTS content_search_documents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL,
      message_id TEXT NOT NULL, task_key INTEGER NOT NULL, text TEXT NOT NULL, char_count INTEGER GENERATED ALWAYS AS(length(text)) STORED);
      CREATE INDEX IF NOT EXISTS content_search_task ON content_search_documents(workspace_id, task_id);

      CREATE TABLE IF NOT EXISTS content_search_migration (id INTEGER PRIMARY KEY CHECK(id=1), cursor INTEGER NOT NULL);
      INSERT OR IGNORE INTO content_search_migration(id,cursor) VALUES(1,0);`);
    const columns=db.prepare("PRAGMA table_info(content_search_migration)").all() as {name:string}[];
    if(!columns.some(column=>column.name==="extractor_version")) db.exec("ALTER TABLE content_search_migration ADD COLUMN extractor_version INTEGER NOT NULL DEFAULT 1");
    // Stored triggers must work on every connection, including older builds.
    const triggers=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'content_search_%'").all() as {name:string}[];
    for(const {name} of triggers) db.exec(`DROP TRIGGER "${name.replaceAll('"','""')}"`);
    // temporary-migration: retire-message-search-index
    db.exec("DROP TABLE IF EXISTS content_search_fts; DROP INDEX IF EXISTS content_search_scan");
    // end temporary-migration: retire-message-search-index
    const version=(db.prepare("SELECT extractor_version FROM content_search_migration WHERE id=1").get() as {extractor_version:number}).extractor_version;
    if(version!==CONTENT_SEARCH_EXTRACTOR_VERSION) db.transaction(()=>{
      db.exec("DELETE FROM content_search_documents; DROP TABLE IF EXISTS content_search_tasks_fts; DROP TABLE IF EXISTS content_search_tasks; DROP TABLE IF EXISTS content_search_dirty_tasks");
      db.prepare("UPDATE content_search_migration SET cursor=0,extractor_version=? WHERE id=1").run(CONTENT_SEARCH_EXTRACTOR_VERSION);
    })();
    db.exec("CREATE INDEX IF NOT EXISTS content_search_parent_lookup ON tasks(substr(id,length(workspace_id)+2),workspace_id)");
    this.mode = options?.mode ?? "fts5-trigram";
    db.exec(`CREATE TABLE IF NOT EXISTS content_search_queue (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,task_id TEXT NOT NULL,changed_at INTEGER NOT NULL,ready INTEGER NOT NULL DEFAULT 0)`);
    this.taskIndex=new ContentSearchTaskIndex(db,this.mode);
    this.mode=this.taskIndex.mode;
    db.exec(`CREATE TABLE IF NOT EXISTS content_search_queue (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL,
      changed_at INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS content_search_queue_task ON content_search_queue(workspace_id,task_id);
      CREATE TRIGGER content_search_message_insert AFTER INSERT ON messages BEGIN
        INSERT INTO content_search_queue VALUES(new.id,new.workspace_id,new.task_id,unixepoch(),0) ON CONFLICT(id) DO UPDATE SET changed_at=excluded.changed_at,ready=0; END;
      CREATE TRIGGER content_search_message_update AFTER UPDATE OF content,message_json,role ON messages
      WHEN new.content IS NOT old.content OR new.message_json IS NOT old.message_json OR new.role IS NOT old.role BEGIN
        INSERT INTO content_search_queue VALUES(new.id,new.workspace_id,new.task_id,unixepoch(),0) ON CONFLICT(id) DO UPDATE SET changed_at=excluded.changed_at,ready=0; END;
      CREATE TRIGGER content_search_message_delete AFTER DELETE ON messages BEGIN
        DELETE FROM content_search_documents WHERE id=old.id;
        INSERT INTO content_search_queue VALUES(old.id,old.workspace_id,old.task_id,unixepoch(),1) ON CONFLICT(id) DO UPDATE SET changed_at=excluded.changed_at,ready=1; END;
      CREATE TRIGGER content_search_task_delete AFTER DELETE ON tasks BEGIN
        DELETE FROM content_search_documents WHERE workspace_id=old.workspace_id AND task_id=substr(old.id,length(old.workspace_id)+2);
        DELETE FROM content_search_tasks WHERE task_key=old.rowid;
        DELETE FROM content_search_dirty_tasks WHERE task_key=old.rowid;
        DELETE FROM content_search_queue WHERE workspace_id=old.workspace_id AND task_id=substr(old.id,length(old.workspace_id)+2); END;
      CREATE TRIGGER content_search_workspace_delete AFTER DELETE ON workspaces BEGIN
        DELETE FROM content_search_documents WHERE workspace_id=old.id;
        DELETE FROM content_search_tasks WHERE workspace_id=old.id;
        DELETE FROM content_search_dirty_tasks WHERE workspace_id=old.id;
        DELETE FROM content_search_queue WHERE workspace_id=old.id; END;`);
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='turns'").get()) db.exec(`
      CREATE TRIGGER content_search_turn_complete AFTER UPDATE OF completed_at ON turns
      WHEN new.completed_at IS NOT NULL BEGIN
        UPDATE content_search_queue SET ready=1 WHERE workspace_id=new.workspace_id AND task_id=new.task_id; END;`);
    this.cursor = (db.prepare("SELECT cursor FROM content_search_migration WHERE id=1").get() as {cursor: number}).cursor;
    this.upper = (db.prepare("SELECT coalesce(max(rowid),0) AS n FROM messages").get() as {n: number}).n;
    this.total = (db.prepare("SELECT count(*) AS n FROM messages WHERE rowid>? AND rowid<=?").get(this.cursor, this.upper) as {n: number}).n;
    if (options?.schedule !== false) {
      this.schedule();
      this.idleTimer=setInterval(()=>this.schedule(),1000);
      this.idleTimer.unref?.();
    }
  }
  requestDrain() { this.schedule(); }
  private schedule() {
    if (this.closed || this.pending || this.retryTimer) return;
    this.pending = setImmediate(() => {
      this.pending = null;
      if (this.closed) return;
      try {
        const more=this.buildBatch();
        this.retryAttempt=0;
        if(more) this.schedule();
      } catch(error) {
        const code=error && typeof error==="object" && "code" in error ? error.code : undefined;
        if(typeof code==="string" && /^SQLITE_(BUSY|LOCKED)(?:_|$)/.test(code)) this.retryLater();
        else {
          if(this.pending) {clearImmediate(this.pending);this.pending=null;}
          console.warn("[persistence] content search indexing paused");
        }
      }
    });
    this.pending.unref?.();
  }
  private retryLater() {
    if(this.closed || this.retryTimer) return;
    if(this.pending) {clearImmediate(this.pending);this.pending=null;}
    const delay=Math.min(1000,25 * 2 ** Math.min(this.retryAttempt++,6));
    this.retryTimer=setTimeout(()=>{
      this.retryTimer=null;
      this.schedule();
    },delay);
    this.retryTimer.unref?.();
  }
  /** One bounded transaction; startup schedules these between event-loop turns. */
  buildBatch(): boolean {
    this.cursor=Math.max(this.cursor,(this.db.prepare("SELECT cursor FROM content_search_migration WHERE id=1").get() as {cursor:number}).cursor);
    const rows = this.db.prepare("SELECT rowid,id,workspace_id,task_id,content,message_json,role FROM messages WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT ?").all(this.cursor,this.upper,BATCH_SIZE) as Array<{rowid:number;id:string;workspace_id:string;task_id:string;content:string;message_json:string|null;role:string}>;
    let nextCursor=this.cursor;
    this.db.transaction(()=>{
      const write=this.db.prepare(`INSERT INTO content_search_documents(id,workspace_id,task_id,message_id,task_key,text)
        SELECT ?,?,?,?,rowid,? FROM tasks WHERE id=? AND workspace_id=?
        ON CONFLICT(id) DO UPDATE SET text=excluded.text`);
      const indexRow=(row:typeof rows[number])=>write.run(row.id,row.workspace_id,row.task_id,row.id.slice(row.workspace_id.length+row.task_id.length+2),extractContentSearchText(row.content,row.message_json,row.role),row.workspace_id+':'+row.task_id,row.workspace_id);
      const deadline=performance.now()+4;
      for(const row of rows) {indexRow(row);nextCursor=row.rowid;this.indexed++;if(performance.now()>=deadline) break;}
      if(rows.length===0) nextCursor=this.upper;
      this.db.prepare("UPDATE content_search_migration SET cursor=max(cursor,?) WHERE id=1").run(nextCursor);
      const queued=this.db.prepare("SELECT * FROM content_search_queue WHERE ready=1 OR changed_at<=unixepoch()-3 LIMIT ?").all(BATCH_SIZE) as {id:string}[];
      for(const item of queued) {
        const row=this.db.prepare("SELECT rowid,* FROM messages WHERE id=?").get(item.id) as typeof rows[number]|undefined;
        if(row) indexRow(row); else this.db.prepare("DELETE FROM content_search_documents WHERE id=?").run(item.id);
        this.db.prepare("DELETE FROM content_search_queue WHERE id=?").run(item.id);
        if(performance.now()>=deadline) break;
      }
    })();
    this.cursor=nextCursor;
    this.taskIndex.refreshBatch();
    return this.cursor<this.upper || this.taskIndex.pending>0 || !!this.db.prepare("SELECT 1 FROM content_search_queue WHERE ready=1 OR changed_at<=unixepoch()-3 LIMIT 1").get();
  }
  get status() { return { indexed: this.indexed, total: this.total, complete: this.cursor >= this.upper }; }
  search(input: SearchTaskContentArgs): SearchTaskContentResponse {
    this.queryDeadline=performance.now()+this.queryBudgetMs;
    try {const response=this.searchInternal(input);this.checkBudget();return response;}
    catch(error) {if(error instanceof Error && error.message==="Content search time budget exceeded") return {ok:false,message:"Search took too long. Try a more specific phrase."};throw error;}
    finally {this.queryDeadline=Infinity;}
  }
  private searchInternal(input: SearchTaskContentArgs): SearchTaskContentResponse {
    const args = SearchTaskContentArgsSchema.parse(input);
    if(args.statusOnly) return {ok:true,results:[],nextOffset:null,indexing:this.status};
    const limit = args.limit ?? 20, offset = args.offset ?? 0;
    const places = new Map<string, Omit<ContentSearchResult,"taskId"|"title"|"provider"|"updatedAt"|"state"|"messageId"|"snippet"|"matchCount"|"parentTaskId"|"parentWorkspaceId"|"parentRepositoryPath">>();
    for (const repository of this.cached("registry",()=>this.source.loadRepositoryRegistry())) {
      const defaultId = resolveCurrentRepositoryDefaultWorkspaceId({repositoryPath: repository.repositoryPath,workspaces: repository.workspaces,workspaceDefaultById: repository.workspaceDefaultById ?? {},workspacePathById: repository.workspacePathById ?? {}});
      for (const workspace of repository.workspaces) places.set(workspace.id, {
        repositoryPath:repository.repositoryPath,repositoryName:repository.repositoryName,
        workspaceId:workspace.id,workspaceName:workspace.name,workspaceBranch:repository.workspaceBranchById?.[workspace.id] ?? null,
        workspacePath:workspace.id===defaultId ? repository.repositoryPath : repository.workspacePathById?.[workspace.id] ?? repository.repositoryPath,
        isDefaultWorkspace:workspace.id===defaultId,
      });
    }
    const words = args.query.toLowerCase().split(/\s+/).filter(Boolean);
    const params: unknown[] = [JSON.stringify([...places.keys()])];
    const predicates = ["d.workspace_id IN (SELECT value FROM json_each(?))", "CASE WHEN (d.rowid & 63)=0 THEN content_search_budget(d.rowid) ELSE 1 END=1"];
    if (args.workspaceId) { predicates.push("d.workspace_id=?"); params.push(args.workspaceId); }
    if (args.taskId) { predicates.push("d.task_id=?"); params.push(args.taskId); }
    for (const word of words) {predicates.push("d.text LIKE ? ESCAPE '\\'");params.push('%'+word.replace(/[\\%_]/g,"\\$&")+'%');}
    const sql = `SELECT d.*,d.char_count AS score,1 AS matches,t.title,t.provider,t.updated_at,t.archived_at
      FROM content_search_documents d JOIN messages m ON m.id=d.id
      JOIN tasks t ON t.id=d.workspace_id||':'||d.task_id AND t.workspace_id=d.workspace_id
      WHERE ${predicates.join(" AND ")} ORDER BY m.rowid ASC LIMIT ? OFFSET ?`;
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
    }
    const shells = new Map<string,PersistenceWorkspaceShell|null>();
    const results = hits.slice(0,limit).map(row => {
      let shell = shells.get(row.workspace_id);
      if (shell === undefined) {shell=this.cached("shell:"+row.workspace_id,()=>this.source.loadWorkspaceShell({workspaceId:row.workspace_id}));shells.set(row.workspace_id,shell);}
      const task = shell?.tasks.find(task=>task.id===row.task_id);
      const turn = this.cached("turn:"+row.workspace_id+":"+row.task_id,()=>this.source.listTurns({workspaceId:row.workspace_id,taskId:row.task_id,limit:1}))[0];
      const outcome = turn?.terminalReceipt?.outcome;
      const state = row.archived_at ? "archived" : !turn ? "new" : !turn.completedAt ? "running" : outcome === "failed" ? "failed" : outcome === "cancelled" ? "cancelled" : "completed";
      const parentOwners=task?.parentTaskId ? this.db.prepare("SELECT workspace_id FROM tasks WHERE substr(id,length(workspace_id)+2)=? ORDER BY workspace_id=? DESC LIMIT 2").all(task.parentTaskId,row.workspace_id) as Array<{workspace_id:string}> : [];
      const parentWorkspaceId=parentOwners[0]?.workspace_id ?? null;
      const parentRepositoryPath=parentWorkspaceId ? places.get(parentWorkspaceId)?.repositoryPath ?? null : null;
      const at = row.text.toLowerCase().indexOf(words[0] ?? "");
      const start = Math.max(0,at-60), end=Math.min(row.text.length,start+240);
      return {...places.get(row.workspace_id)!, taskId:row.task_id,title:row.title,provider:row.provider,updatedAt:row.updated_at,state,
        messageId:row.message_id,snippet:(start?"…":"")+row.text.slice(start,end)+(end<row.text.length?"…":""),matchCount:row.matches,parentTaskId:task?.parentTaskId ?? null,parentWorkspaceId,parentRepositoryPath} satisfies ContentSearchResult;
    });
    return {ok:true,results,nextOffset:hits.length>limit && offset+limit<=CONTENT_SEARCH_MAX_OFFSET ? offset+limit : null,indexing:this.status};
  }
  close() {this.closed=true;if(this.pending) clearImmediate(this.pending);if(this.retryTimer) clearTimeout(this.retryTimer);if(this.idleTimer) clearInterval(this.idleTimer);}
}
