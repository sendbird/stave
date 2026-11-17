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
    task_id TEXT, task_title TEXT, turn_id TEXT, created_at TEXT, read_at TEXT, resolved_at TEXT, payload_json TEXT)`);
  return { db, store: new ResultReviewStore(db) };
}
const target = { workspaceId: "workspace", taskId: "task" };
function insert(db: Database, id: string, kind = "task.turn_completed", at = "2026-11-01T00:00:00Z") {
  db.prepare(`INSERT INTO notifications (id,kind,title,body,project_path,project_name,workspace_id,workspace_name,task_id,task_title,turn_id,created_at) VALUES (?,?,'Result','Summary','/tmp/project','Project','workspace','Workspace','task','Task',?,?)`).run(id,kind,id,at);
}
test("latest output owns task unread, read and unread update the same result", () => {
  const {db,store} = setup(); insert(db,"old","task.turn_failed"); insert(db,"latest","task.turn_completed","2026-11-02T00:00:00Z");
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(true);
  store.setTaskReadState({...target,read:true});
  expect(store.list({latestPerTask:true}).results[0]?.reviewedAt).toBeTruthy();
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(false);
  store.setTaskReadState({...target,read:false});
  expect(store.list({latestPerTask:true}).results[0]?.reviewedAt).toBeNull();
});
test("reading a result directly clears the task without a duplicate completion flag", () => {
  const {db,store}=setup(); insert(db,"latest");
  store.setTaskReadState({...target,read:false});
  store.setReviewed({repositoryPath:"/tmp/project",...target,turnId:"latest",reviewed:true});
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(false);
});
test("attention arriving after a read is unseen, and read does not resolve it", () => {
  const {db,store}=setup(); store.setTaskReadState({...target,read:true}); insert(db,"approval","task.approval_requested");
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(true);
  store.setTaskReadState({...target,read:true});
  expect(store.listTaskReadStates({targets:[target]})[0]?.unread).toBe(false);
  expect(db.prepare("SELECT resolved_at AS resolvedAt FROM notifications").get()).toEqual({resolvedAt:null});
});
test("manual unread without output survives store recreation and is isolated by workspace", () => {
  const {db,store}=setup(); store.setTaskReadState({...target,read:false});
  const reopened = new ResultReviewStore(db);
  expect(reopened.listTaskReadStates({targets:[target,{...target,workspaceId:"other"}]}).map(x=>x.unread)).toEqual([true,false]);
});
test("a failed read rolls back the output read mark", () => {
  const {db,store}=setup(); insert(db,"latest"); insert(db,"approval","task.approval_requested");
  db.exec(`CREATE TRIGGER refuse_task_read BEFORE UPDATE ON notifications BEGIN SELECT RAISE(ABORT, 'refused'); END;`);
  expect(()=>store.setTaskReadState({...target,read:true})).toThrow("refused");
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
    initial.exec(`CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT, project_path TEXT, project_name TEXT, workspace_id TEXT, workspace_name TEXT, task_id TEXT, task_title TEXT, turn_id TEXT, created_at TEXT, read_at TEXT, resolved_at TEXT, payload_json TEXT)`);
    new ResultReviewStore(initial).setTaskReadState({...target,read:false});
    initial.close();
    const reopened = new Database(file);
    try { expect(new ResultReviewStore(reopened).listTaskReadStates({targets:[target]})[0]?.unread).toBe(true); } finally { reopened.close(); }
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
test("viewing attention cannot acknowledge an output the task has not displayed", () => {
  const {db,store}=setup(); insert(db,"latest");
  store.setTaskReadState({...target,read:true,attentionOnly:true});
  expect(store.list({latestPerTask:true}).results[0]?.reviewedAt).toBeNull();
});
