import type Database from "better-sqlite3";
import { isTaskManaged } from "../../src/lib/tasks";
import type { PersistenceTaskRow, PersistenceWorkspaceSnapshot } from "./types";

const TERMINAL_RUNS = "('completed','failed','cancelled','interrupted')";

/** Called under the caller's IMMEDIATE transaction, before any row is removed. */
export function assertTaskCanBeDeleted(db: Database.Database, args: { workspaceId: string; taskId: string }, task: PersistenceTaskRow | undefined) {
  if (!task) throw new Error("Task not found.");
  if (isTaskManaged({ controlMode: task.controlMode ?? "interactive" })) throw new Error("Managed tasks cannot be deleted.");
  const liveTurn = db.prepare("SELECT 1 FROM turns WHERE workspace_id = ? AND task_id = ? AND completed_at IS NULL LIMIT 1").get(args.workspaceId, args.taskId);
  const liveRun = db.prepare("SELECT 1 FROM agent_runs WHERE workspace_id = ? AND lead_task_id = ? AND state IN ('running','paused') LIMIT 1").get(args.workspaceId, args.taskId);
  const liveChild = db.prepare(`WITH RECURSIVE descendants(task_id) AS (
    SELECT ? UNION SELECT run.task_id FROM runs run JOIN descendants parent
    ON run.origin_kind = 'task' AND run.origin_id = parent.task_id WHERE run.task_id IS NOT NULL
  ) SELECT 1 FROM runs WHERE ((workspace_id = ? AND task_id = ?) OR (origin_kind = 'task' AND origin_id IN (SELECT task_id FROM descendants))) AND status NOT IN ${TERMINAL_RUNS} LIMIT 1`).get(args.taskId, args.workspaceId, args.taskId);
  if (liveTurn || liveRun || liveChild) throw new Error("Task has running work.");
  const endedRun = db.prepare("SELECT 1 FROM agent_runs WHERE workspace_id = ? AND lead_task_id = ? AND state NOT IN ('running','paused') LIMIT 1").get(args.workspaceId, args.taskId);
  if (!task.archivedAt && !endedRun) throw new Error("Archive or end the task before deleting it.");
  const tars = db.prepare("SELECT 1 FROM tars_responsibilities WHERE json_extract(body_json, '$.taskId') = ? AND json_extract(body_json, '$.state') NOT IN ('completed','cancelled','takenOver') LIMIT 1").get(args.taskId);
  if (tars) throw new Error("managed by Tars");
}

/** Related task records share the deletion transaction with the workspace shell. */
export function deleteTaskRelatedRows(db: Database.Database, args: { workspaceId: string; taskId: string }) {
  const runs = db.prepare("SELECT id FROM runs WHERE (workspace_id = ? AND task_id = ?) OR (origin_kind = 'task' AND origin_id = ?)").all(args.workspaceId, args.taskId, args.taskId) as { id: string }[];
  for (const run of runs) {
    db.prepare("DELETE FROM run_receipts WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM run_steps WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(run.id);
  }
  const agentRuns = db.prepare("SELECT id FROM agent_runs WHERE workspace_id = ? AND lead_task_id = ?").all(args.workspaceId, args.taskId) as { id: string }[];
  for (const run of agentRuns) {
    db.prepare("DELETE FROM fleet_attention_snoozes WHERE workspace_id = ? AND attention_id LIKE ? ESCAPE '!' ")
      .run(args.workspaceId, `agent-run:%:${run.id.replace(/[!%_]/g, (char) => `!${char}`)}:%`);
    db.prepare("DELETE FROM agent_run_events WHERE agent_run_id = ?").run(run.id);
    db.prepare("DELETE FROM agent_run_stages WHERE agent_run_id = ?").run(run.id);
    db.prepare("DELETE FROM agent_runs WHERE id = ?").run(run.id);
  }
  // Snoozes key task attention through its notifications, results, or encoded task id.
  db.prepare(`DELETE FROM fleet_attention_snoozes WHERE workspace_id = ? AND
    (attention_id IN (SELECT id FROM notifications WHERE workspace_id = ? AND task_id = ?)
     OR attention_id IN (SELECT id FROM result_reviews WHERE workspace_id = ? AND task_id = ?)
     OR instr(attention_id, ?) > 0)`).run(args.workspaceId, args.workspaceId, args.taskId, args.workspaceId, args.taskId, `:${args.workspaceId}:${args.taskId}:`);
  db.prepare("DELETE FROM result_review_evidence WHERE scope_key IN (SELECT json_array(project_path, workspace_id, task_id, turn_id) FROM result_reviews WHERE workspace_id = ? AND task_id = ?)").run(args.workspaceId, args.taskId);
  db.prepare("DELETE FROM result_reviews WHERE workspace_id = ? AND task_id = ?").run(args.workspaceId, args.taskId);
  db.prepare("DELETE FROM notifications WHERE workspace_id = ? AND task_id = ?").run(args.workspaceId, args.taskId);
}


export function withoutDeletedSnapshotTasks(snapshot: PersistenceWorkspaceSnapshot, deleted: ReadonlySet<string>): PersistenceWorkspaceSnapshot {
  const remaining = <T>(map: Record<string, T> | undefined) => map && Object.fromEntries(Object.entries(map).filter(([id]) => !deleted.has(id)));
  const activeTaskId = deleted.has(snapshot.activeTaskId) ? snapshot.tasks.find((task) => !deleted.has(task.id))?.id ?? "" : snapshot.activeTaskId;
  return {
    ...snapshot,
    tasks: snapshot.tasks.filter((task) => !deleted.has(task.id)),
    messagesByTask: remaining(snapshot.messagesByTask) ?? {},
    promptDraftByTask: remaining(snapshot.promptDraftByTask),
    reviewCommentsByTask: remaining(snapshot.reviewCommentsByTask),
    providerSessionByTask: remaining(snapshot.providerSessionByTask),
    openTaskTabIds: snapshot.openTaskTabIds?.filter((id) => !deleted.has(id)),
    terminalTabs: snapshot.terminalTabs?.map((tab) => tab.linkedTaskId && deleted.has(tab.linkedTaskId) ? { ...tab, linkedTaskId: null } : tab),
    cliSessionTabs: snapshot.cliSessionTabs?.map((tab) => tab.linkedTaskId && deleted.has(tab.linkedTaskId) ? { ...tab, linkedTaskId: null } : tab),
    activeTaskId,
    activeSurface: snapshot.activeSurface?.kind === "task" && deleted.has(snapshot.activeSurface.taskId) ? { kind: "task", taskId: activeTaskId } : snapshot.activeSurface,
  };
}
