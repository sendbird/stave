import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ListTaskReadStatesArgsSchema, SetTaskReadStateArgsSchema, TaskReadStatesResponseSchema } from "../src/lib/task-read-state";
import { ResultReviewStore } from "../electron/persistence/result-review-store";
const databases: Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function setup() {
  const db = new Database(":memory:"); databases.push(db);
  db.exec(`CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT,
    project_path TEXT, project_name TEXT, workspace_id TEXT, workspace_name TEXT,
    task_id TEXT, task_title TEXT, turn_id TEXT, created_at TEXT, read_at TEXT, resolved_at TEXT, payload_json TEXT, expires_at TEXT)`);
  return { db, store: new ResultReviewStore(db) };
}
const target = { workspaceId: "workspace", taskId: "task" };
function insert(db: Database, id: string, kind = "task.turn_completed", at = "2026-11-01T00:00:00Z") {
  db.prepare(`INSERT INTO notifications (id,kind,title,body,project_path,project_name,workspace_id,workspace_name,task_id,task_title,turn_id,created_at) VALUES (?,?,'Result','Summary','/tmp/project','Project','workspace','Workspace','task','Task',?,?)`).run(id,kind,id,at);
}
test("latest output owns task unread, read and unread update the same result", () => {
  const {db,store} = setup(); insert(db,"old","task.turn_failed"); insert(db,"latest","task.turn_completed","2026-11-02T00:00:00Z");
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(true);
  store.setTaskReadStates({targets:[target],read:true});
  expect(store.list({latestPerTask:true}).results[0]?.reviewedAt).toBeTruthy();
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(false);
  store.setTaskReadStates({targets:[target],read:false});
  expect(store.list({latestPerTask:true}).results[0]?.reviewedAt).toBeNull();
});
test("reading a result directly clears the task without a duplicate completion flag", () => {
  const {db,store}=setup(); insert(db,"latest");
  store.setTaskReadStates({targets:[target],read:false});
  store.setReviewed({repositoryPath:"/tmp/project",...target,turnId:"latest",reviewed:true});
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(false);
});
test("attention arriving after a read is unseen, and read does not resolve it", () => {
  const {db,store}=setup(); store.setTaskReadStates({targets:[target],read:true}); insert(db,"approval","task.approval_requested");
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(true);
  store.setTaskReadStates({targets:[target],read:true});
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(false);
  expect(db.prepare("SELECT resolved_at AS resolvedAt FROM notifications").get()).toEqual({resolvedAt:null});
});
test("manual unread without output survives store recreation and is isolated by workspace", () => {
  const {db,store}=setup(); store.setTaskReadStates({targets:[target],read:false});
  const reopened = new ResultReviewStore(db);
  expect(reopened.listTaskReadStates({targets:[target,{...target,workspaceId:"other"}]}).map(x=>x.unread)).toEqual([true,false]);
});
test("a failed read rolls back the output read mark", () => {
  const {db,store}=setup(); insert(db,"latest"); insert(db,"approval","task.approval_requested");
  db.exec(`CREATE TRIGGER refuse_task_read BEFORE UPDATE ON notifications BEGIN SELECT RAISE(ABORT, 'refused'); END;`);
  expect(()=>store.setTaskReadStates({targets:[target],read:true})).toThrow("refused");
  expect(store.list({latestPerTask:true}).results[0]?.reviewedAt).toBeNull();
});

test("strict read contracts reject unknown payload and response fields", () => {
  expect(ListTaskReadStatesArgsSchema.safeParse({targets:[{...target,read:true}]}).success).toBe(false);
  expect(SetTaskReadStateArgsSchema.safeParse({...target,read:true,resolve:true}).success).toBe(false);
  expect(TaskReadStatesResponseSchema.safeParse({ok:true,states:[{...target,unread:true,outputRead:false}]}).success).toBe(false);
});
test("manual unread is durable across database close and reopen", () => {
  const directory = mkdtempSync(join(tmpdir(),"task-read-state-"));
  const file = join(directory,"read.sqlite");
  try {
    const initial = new Database(file);
    initial.exec(`CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT, project_path TEXT, project_name TEXT, workspace_id TEXT, workspace_name TEXT, task_id TEXT, task_title TEXT, turn_id TEXT, created_at TEXT, read_at TEXT, resolved_at TEXT, payload_json TEXT, expires_at TEXT)`);
    new ResultReviewStore(initial).setTaskReadStates({targets:[target],read:false});
    initial.close();
    const reopened = new Database(file);
    try { expect(new ResultReviewStore(reopened).listTaskReadStates({targets:[target]})[0]?.unread).toBe(true); } finally { reopened.close(); }
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
test("viewing attention cannot acknowledge an output the task has not displayed", () => {
  const {db,store}=setup(); insert(db,"latest");
  store.setTaskReadStates({targets:[target],read:true,attentionOnly:true});
  expect(store.list({latestPerTask:true}).results[0]?.reviewedAt).toBeNull();
});

function countingDatabase(db: Database) {
  const counts = { prepare: 0, run: 0 };
  const wrapped = {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      counts.prepare++;
      const statement = db.prepare(sql);
      return {
        all: (...params: unknown[]) => { counts.run++; return statement.all(...(params as never[])); },
        get: (...params: unknown[]) => { counts.run++; return statement.get(...(params as never[])); },
        run: (...params: unknown[]) => { counts.run++; return statement.run(...(params as never[])); },
      };
    },
  };
  return { counts, wrapped };
}
const manyTargets = (count: number) => Array.from({length:count},(_,index) => ({workspaceId:"workspace",taskId:`task-${index}`}));
test("listing many targets prepares once and runs one query per call", () => {
  const {db} = setup();
  const {counts,wrapped} = countingDatabase(db);
  const store = new ResultReviewStore(wrapped);
  const targets = manyTargets(40);
  counts.prepare = 0; counts.run = 0;
  expect(store.listTaskReadStates({targets})).toHaveLength(40);
  expect(counts.run).toBe(1);
  const firstPrepares = counts.prepare;
  expect(firstPrepares).toBeLessThan(targets.length);
  expect(store.listTaskReadStates({targets})).toHaveLength(40);
  expect(counts.run).toBe(2);
  expect(counts.prepare).toBe(firstPrepares);
});
test("batch read marks every target with a statement count independent of the target count", () => {
  const {db} = setup();
  const {counts,wrapped} = countingDatabase(db);
  const store = new ResultReviewStore(wrapped);
  const targets = manyTargets(25);
  store.setTaskReadStates({targets,read:false});
  expect(store.listTaskReadStates({targets}).every(state => state.unread)).toBe(true);
  counts.prepare = 0; counts.run = 0;
  const result = store.setTaskReadStates({targets,read:true});
  expect(result.states.map(state => state.unread)).toEqual(targets.map(() => false));
  expect(counts.prepare).toBe(0);
  expect(counts.run).toBeLessThan(10);
});
test("task read and unread move the completion notification with the output", () => {
  const {db,store} = setup(); insert(db,"old","task.turn_failed"); insert(db,"latest","task.turn_completed","2026-11-02T00:00:00Z");
  const read = store.setTaskReadStates({targets:[target],read:true});
  const readRows = db.prepare("SELECT id, read_at AS readAt FROM notifications ORDER BY id").all() as Array<{id:string;readAt:string|null}>;
  expect(readRows.every(row => row.readAt)).toBe(true);
  expect(read.notifications.map(item => item.id).sort()).toEqual(["latest","old"]);
  const unread = store.setTaskReadStates({targets:[target],read:false});
  expect(db.prepare("SELECT id, read_at AS readAt FROM notifications ORDER BY id").all()).toEqual([
    {id:"latest",readAt:null}, {id:"old",readAt:readRows.find(row => row.id === "old")!.readAt},
  ]);
  expect(unread.notifications).toEqual([{id:"latest",readAt:null,expiresAt:null}]);
});
test("viewing attention leaves completion notifications unread", () => {
  const {db,store} = setup(); insert(db,"latest");
  store.setTaskReadStates({targets:[target],read:true,attentionOnly:true});
  expect(db.prepare("SELECT read_at AS readAt FROM notifications").get()).toEqual({readAt:null});
});
test("every attention kind of the app marks a task unread", () => {
  for (const kind of ["tars.decision_requested","tars.blocked","agent_run.blocked"]) {
    const {db,store} = setup(); insert(db,"attention",kind);
    expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(true);
  }
});
test("marking a read notification unread stops its expiry", () => {
  const {db,store} = setup(); insert(db,"blocked","agent_run.blocked");
  store.setTaskReadStates({targets:[target],read:true});
  expect((db.prepare("SELECT expires_at AS expiresAt FROM notifications").get() as {expiresAt:string|null}).expiresAt).toBeTruthy();
  store.setTaskReadStates({targets:[target],read:false});
  expect(db.prepare("SELECT read_at AS readAt, expires_at AS expiresAt FROM notifications").get()).toEqual({readAt:null,expiresAt:null});
});
