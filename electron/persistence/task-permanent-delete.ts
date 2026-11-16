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
  if (!task.archivedAt) throw new Error("Archive the task before deleting it.");
  const tars = db.prepare("SELECT 1 FROM tars_responsibilities WHERE json_extract(body_json, '$.taskId') = ? AND json_extract(body_json, '$.state') NOT IN ('completed','cancelled','takenOver') LIMIT 1").get(args.taskId);
  if (tars) throw new Error("managed by Tars");
}

/** Related task records share the deletion transaction with the workspace shell. */
export function deleteTaskRelatedRows(db: Database.Database, args: { workspaceId: string; taskId: string }) {
  const runs = db.prepare("SELECT id FROM runs WHERE (workspace_id = ? AND task_id = ? AND origin_kind != 'task') OR (origin_kind = 'task' AND origin_id = ?)").all(args.workspaceId, args.taskId, args.taskId) as { id: string }[];
  for (const run of runs) {
    db.prepare("DELETE FROM run_receipts WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM run_steps WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(run.id);
  }
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
  for (const table of ["wake_ups", "task_handoff_records"]) {
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
      const persistedTaskRowId = `${args.id}:${task.id}`;
        db
          .prepare(
            `
          INSERT INTO tasks (id, workspace_id, title, provider, updated_at, unread, archived_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            provider = excluded.provider,
            updated_at = excluded.updated_at,
            unread = excluded.unread,
            archived_at = excluded.archived_at
        `,
          )
          .run(
            persistedTaskRowId,
            args.id,
            task.title,
            task.provider,
            task.updatedAt,
            task.unread ? 1 : 0,
            task.archivedAt ?? null,
          );
      }

      if (
        existingPayloadEntry &&
        "messagesByTask" in existingPayloadEntry.payload
      ) {
        const legacySnapshot =
          existingPayloadEntry.payload as PersistenceWorkspaceSnapshot;
        for (const taskId of preservedLegacyTaskIds) {
          this.insertTaskMessages({
            workspaceId: args.id,
            taskId,
            messages: legacySnapshot.messagesByTask[taskId] ?? [],
          });
        }
      }

      for (const [taskId, messages] of Object.entries(
        args.snapshot.messagesByTask,
      )) {
        if (!nextTaskIds.has(taskId)) {
          continue;
        }
        // Message persistence is additive: upsert the in-memory window without
        // deleting rows it omits. messagesByTask is only a tail window over the
        // durable `messages` table, so a destructive rewrite here would drop
        // unloaded older history (and would make in-memory eviction lossy).
        // Genuine deletions go through removeTaskFromWorkspace/deleteWorkspace.
        this.insertTaskMessages({
          workspaceId: args.id,
          taskId,
          messages,
        });
      }

      const countRows = db
        .prepare(
          `
        SELECT task_id, COUNT(*) AS count
        FROM messages
        WHERE workspace_id = ?
        GROUP BY task_id
      `,
        )
        .all(args.id) as TaskMessageCountRow[];
      const countByTask = new Map(
        countRows.map((row) => [row.task_id, row.count] as const),
      );
      const shell = this.createWorkspaceShell({
        snapshot: args.snapshot,
        messageCountByTask: Object.fromEntries(
          args.snapshot.tasks.map(
            (task) => [task.id, countByTask.get(task.id) ?? 0] as const,
          ),
        ),
      });
      const preparedShell = this.preparePersistedWorkspaceShell({
        shell,
        updatedAt: now,
        artifactId: nextWorkspaceShellArtifactId,
        previousBodyByTabId: previousWorkspaceShellBodies,
      });
      if (preparedShell.artifact) {
        writePreparedWorkspaceShellArtifact({
          rootDir: this.artifactRootDir,
          artifact: preparedShell.artifact,
        });
        this.insertArtifactRow({
          artifact: preparedShell.artifact,
        });
      }
      const snapshotJson = JSON.stringify(preparedShell.persistedShellPayload);
      const persistedShellLiteJson = preparedShell.shellLiteJson;
      const persistedShellSummaryJson = preparedShell.shellSummaryJson;

      db
        .prepare(
          `
        INSERT INTO workspaces (id, name, updated_at, snapshot_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at,
          snapshot_json = excluded.snapshot_json
      `,
        )
        .run(args.id, args.name, now, snapshotJson);
      db
        .prepare(
          `
        INSERT INTO workspace_meta (id, name, updated_at, shell_lite_json, shell_summary_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at,
          shell_lite_json = excluded.shell_lite_json,
          shell_summary_json = excluded.shell_summary_json
      `,
        )
        .run(
          args.id,
          args.name,
          now,
          persistedShellLiteJson,
          persistedShellSummaryJson,
        );

      if (
        existingWorkspaceShellArtifact &&
        existingWorkspaceShellArtifact.id !== preparedShell.artifact?.id
      ) {
        this.deleteArtifactRows({
          artifactIds: [existingWorkspaceShellArtifact.id],
        });
      }
    });

    // IMMEDIATE: main and the host-service each hold a connection to this
    // file. See `persistTaskTurnDelta` for why a deferred write can be lost.
    if (tx.immediate() === false) return;
    if (previousWorkspaceShellArtifact) {
      this.removeArtifactFiles({
        relativePaths: [previousWorkspaceShellArtifact.relativePath],
      });
    }
  }

  /**
   * Write one task's turn progress without touching renderer-owned state.
   *
   * `upsertWorkspace` takes a whole-workspace snapshot, so host-service used it
   * to save a streamed turn and in doing so rewrote fields it does not own —
   * prompt drafts, editor and terminal tabs, layout, workspace information —
   * from its own cached session copy. That copy can be minutes stale (the host
   * caches up to 32 workspace sessions), so a streamed event could resurrect a
   * draft the user had already cleared. The existing
   * `reconcileTasksWithPersistedArchival` guard in the host is evidence of the
   * same class of bug for task archival.
   *
   * This path instead starts from the *persisted* payload and replaces only
   * host-owned fields, which also avoids two costs `upsertWorkspace` pays on
   * every call: rewriting the editor-tab artifact, and a workspace-wide
   * `COUNT(*) GROUP BY task_id`.
   *
   * Message writes stay additive, exactly as in `upsertWorkspace`.
   */
  persistTaskTurnDelta(args: {
    workspaceId: string;
    workspaceName?: string;
    taskId: string;
    /** Turn progress; existing names and `archivedAt` are taken from disk. */
    task?: PersistenceWorkspaceSnapshot["tasks"][number];
    /** Only the messages that changed. */
    messages?: PersistenceWorkspaceSnapshot["messagesByTask"][string];
    /** Set when the host turn makes this the workspace's active task. */
    activeTaskId?: string;
    /** Host-owned provider session cursor for this task. */
    providerSession?: NonNullable<
      PersistenceWorkspaceSnapshot["providerSessionByTask"]
    >[string];
  }): { ok: boolean; messageCount: number } {
    const now = new Date().toISOString();

    const tx = db.transaction((): number | null => {
      this.workspaceArchives.assertNotDeleted(args.workspaceId);
      if (this.workspaceArchives.isWriteProtected(args.workspaceId)) return null;
      if (db.prepare("SELECT 1 FROM deleted_tasks WHERE workspace_id = ? AND task_id = ?").get(args.workspaceId, args.taskId)) return 0;
      // Read under the write lock: a payload read before it could be an older
      // shell than one main has saved since, and writing it back below would
      // revert that save (a draft, a tab).
}
