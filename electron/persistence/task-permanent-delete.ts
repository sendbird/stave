import type Database from "better-sqlite3";
import { isTaskManaged } from "../../src/lib/tasks";
import type { PersistenceTaskRow, PersistenceWorkspaceSnapshot, PersistenceWorkspaceShell } from "./types";
import { deleteTurnSnapshotRows } from "./turn-snapshot-store";

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
  if (!task.archivedAt) throw new Error("Archive the task before deleting it.");
  const tars = db.prepare("SELECT 1 FROM tars_responsibilities WHERE json_extract(body_json, '$.taskId') = ? AND json_extract(body_json, '$.state') NOT IN ('completed','cancelled','takenOver') LIMIT 1").get(args.taskId);
  if (tars) throw new Error("managed by Tars");
}

/** Related task records share the deletion transaction with the workspace shell. */
export function deleteTaskRelatedRows(db: Database.Database, args: { workspaceId: string; taskId: string }): string[] {
  const artifacts = db.prepare(`SELECT DISTINCT artifact.id, artifact.relative_path FROM artifacts artifact
    JOIN turn_events event ON event.payload_artifact_id = artifact.id
    JOIN turns turn ON turn.id = event.turn_id WHERE turn.workspace_id = ? AND turn.task_id = ?
    AND NOT EXISTS (SELECT 1 FROM turn_events other JOIN turns owner ON owner.id = other.turn_id
      WHERE other.payload_artifact_id = artifact.id AND (owner.workspace_id != ? OR owner.task_id != ?))`)
    .all(args.workspaceId, args.taskId, args.workspaceId, args.taskId) as {id:string;relative_path:string}[];
  const runs = db.prepare("SELECT id FROM runs WHERE (workspace_id = ? AND task_id = ? AND origin_kind != 'task') OR (origin_kind = 'task' AND origin_id = ?)").all(args.workspaceId, args.taskId, args.taskId) as { id: string }[];
  for (const run of runs) {
    db.prepare("DELETE FROM delegated_answer_deliveries WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM run_receipts WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM run_steps WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(run.id);
  }
  db.prepare("DELETE FROM delegated_answer_tracking WHERE parent_task_id = ?").run(args.taskId);
  // The parent owns a delegation ledger even after its child is removed.
  const parentRuns = db.prepare("SELECT id FROM runs WHERE workspace_id = ? AND task_id = ? AND origin_kind = 'task' AND origin_id != ?").all(args.workspaceId, args.taskId, args.taskId) as { id: string }[];
  for (const run of parentRuns) {
    db.prepare("UPDATE runs SET task_id = NULL WHERE id = ?").run(run.id);
    db.prepare("UPDATE run_steps SET target_json = NULL WHERE run_id = ?").run(run.id);
  }
  const hasTable = (table: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  if (hasTable("wake_up_occurrences")) {
    db.prepare("DELETE FROM wake_up_occurrences WHERE (workspace_id = ? AND task_id = ?) OR wake_up_id IN (SELECT id FROM wake_ups WHERE workspace_id = ? AND task_id = ?)").run(args.workspaceId, args.taskId, args.workspaceId, args.taskId);
  }
  for (const table of ["wake_ups", "task_handoff_records", "task_read_marks"]) {
    if (hasTable(table)) db.prepare(`DELETE FROM ${table} WHERE workspace_id = ? AND task_id = ?`).run(args.workspaceId, args.taskId);
  }
  if (hasTable("agent_assignments")) db.prepare("UPDATE agent_assignments SET task_id = NULL, body_json = json_set(body_json, '$.taskId', NULL) WHERE task_id = ?").run(args.taskId);
  if (hasTable("tracker_issue_kickoffs")) db.prepare("UPDATE tracker_issue_kickoffs SET stave_task_id = NULL WHERE workspace_id = ? AND stave_task_id = ?").run(args.workspaceId, args.taskId);
  // Revision content belongs to the workspace document and remains readable.
  if (hasTable("workspace_document_revisions")) db.prepare("UPDATE workspace_document_revisions SET task_id = NULL, turn_id = NULL WHERE workspace_id = ? AND task_id = ?").run(args.workspaceId, args.taskId);
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
  deleteTurnSnapshotRows(db, args);
  for (const artifact of artifacts) db.prepare("DELETE FROM artifacts WHERE id = ?").run(artifact.id);
  return artifacts.map(artifact => artifact.relative_path);
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


/** Detach surviving children in every shell projection in the parent's deletion transaction. */
export function releaseDeletedTaskChildren(db: Database.Database, parentTaskId: string) {
  const tasks = `(SELECT json_group_array(json(CASE WHEN json_extract(item.value, '$.parentTaskId') = ?
    THEN json_set(item.value, '$.parentTaskId', NULL) ELSE item.value END)) FROM json_each(%s, '$.tasks') item)`;
  db.prepare(`UPDATE workspaces SET snapshot_json = json_set(snapshot_json, '$.tasks', ${tasks.replace("%s", "snapshot_json")})
    WHERE EXISTS (SELECT 1 FROM json_each(snapshot_json, '$.tasks') WHERE json_extract(value, '$.parentTaskId') = ?)`)
    .run(parentTaskId, parentTaskId);
  for (const column of ["shell_lite_json", "shell_summary_json"]) {
    db.prepare(`UPDATE workspace_meta SET ${column} = json_set(${column}, '$.tasks', ${tasks.replace("%s", column)})
      WHERE ${column} IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(${column}, '$.tasks') WHERE json_extract(value, '$.parentTaskId') = ?)`)
      .run(parentTaskId, parentTaskId);
  }
}

/** A stale renderer or host snapshot cannot reattach a child to a permanently deleted parent. */
export function preserveReleasedTaskParents(db: Database.Database, tasks: PersistenceTaskRow[]): PersistenceTaskRow[] {
  return tasks.map((task) => task.parentTaskId && db.prepare("SELECT 1 FROM deleted_tasks WHERE task_id = ? LIMIT 1").get(task.parentTaskId)
    ? { ...task, parentTaskId: null } : task);
}

/** Remove source rows in the caller transaction after related-row cleanup. */
export function deleteTaskSourceRows(db: Database.Database, args: { workspaceId: string; taskId: string }) {
      const persistedTaskRowId = `${args.workspaceId}:${args.taskId}`;
      db
        .prepare(
          `
        DELETE FROM turn_events
        WHERE turn_id IN (
          SELECT id
          FROM turns
          WHERE workspace_id = ? AND task_id = ?
        )
      `,
        )
        .run(args.workspaceId, args.taskId);
      db
        .prepare(
          `
        DELETE FROM turns
        WHERE workspace_id = ? AND task_id = ?
      `,
        )
        .run(args.workspaceId, args.taskId);
      db
        .prepare("DELETE FROM messages WHERE workspace_id = ? AND task_id = ?")
        .run(args.workspaceId, args.taskId);
      db
        .prepare("DELETE FROM tasks WHERE id = ? AND workspace_id = ?")
        .run(persistedTaskRowId, args.workspaceId);

}

/** Preserve shell navigation and unloaded history when removing a task. */
export function withoutTaskInShell(db: Database.Database, shell: PersistenceWorkspaceShell, args: {taskId: string}): PersistenceWorkspaceShell {
      const nextTasks = preserveReleasedTaskParents(db, shell.tasks.filter((task) => task.id !== args.taskId));
      const nextActiveTaskId =
        shell.activeTaskId === args.taskId
          ? (nextTasks[0]?.id ?? "")
          : shell.activeTaskId;
      const { [args.taskId]: _removedMessageCount, ...remainingMessageCount } =
        shell.messageCountByTask ?? {};
      const {
        [args.taskId]: _removedPromptDraft,
        ...remainingPromptDraftByTask
      } = shell.promptDraftByTask ?? {};
      const {
        [args.taskId]: _removedProviderSession,
        ...remainingProviderSessionByTask
      } = shell.providerSessionByTask ?? {};

      const nextShell: PersistenceWorkspaceShell = {
        ...shell,
        activeTaskId: nextActiveTaskId,
        tasks: nextTasks,
        messageCountByTask: remainingMessageCount,
        promptDraftByTask: remainingPromptDraftByTask,
        providerSessionByTask: remainingProviderSessionByTask,
      };
  return nextShell;
}
