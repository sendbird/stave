import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdirSync, rmSync, statfsSync } from "node:fs";
import Database from "better-sqlite3";
import {
  deletePersistedWorkspaceShellArtifacts,
  hydratePersistedWorkspaceEditorTabs,
  prepareWorkspaceShellEditorTabsPersistence,
  readPersistedWorkspaceEditorTabBodies,
  restorePersistedWorkspaceEditorTabs,
  writePreparedWorkspaceShellArtifact,
  type PersistedWorkspaceShellArtifactPointer,
  type PersistedWorkspaceShellEditorTabArtifactRecord,
} from "./workspace-shell-artifacts";
import type {
  PersistenceLocalMcpRequestLog,
  PersistenceLocalMcpRequestLogCreateInput,
  PersistenceLocalMcpRequestLogPage,
  PersistenceTaskRow,
  PersistenceTaskMessagesPage,
  PersistenceWorkspaceShell,
  PersistenceWorkspaceShellLite,
  PersistenceWorkspaceShellSummary,
  PersistenceProjectRegistryEntry,
  PersistenceNotificationCreateInput,
  PersistenceNotificationRecord,
  PersistenceTurnSummary,
  PersistenceWorkspaceSnapshot,
  PersistenceWorkspaceSummary,
} from "./types";
import {
  mergeTaskTurnDeltaPayload,
  toWorkspaceShellMetaSource,
} from "./task-turn-delta";
import { selectOrphanedNotificationWorkspaceIds } from "./notification-orphans";
import { parsePersistedTurnUsage } from "./turn-usage";
import type { PersistenceBootstrapStatus } from "../../src/lib/persistence/bootstrap-status";
import { IDLE_PERSISTENCE_BOOTSTRAP_STATUS } from "../../src/lib/persistence/bootstrap-status";
import type { ProviderId } from "../../src/lib/providers/provider.types";
import { buildNotificationExpiresAt } from "../../src/lib/notifications/notification.types";
import {
  createEmptyRoutineState,
  normalizeRoutineState,
  type RoutineState,
} from "../../src/lib/routines";
import type { BridgeEvent } from "../providers/types";
import {
  parseTurnEventPayload,
  prepareTurnEventPayload,
  type PersistedTurnStreamEvent,
} from "./turn-event-payload";
import { RunLedgerStore } from "./run-ledger-store";
import {
  CraneJobBindingStore,
  type LocalCraneJobBinding,
} from "./crane-job-binding-store";
import { TrackerTasksStore } from "./tracker-tasks-store";
import type {
  TrackerSourceId,
  TrackerTask,
  TrackerTaskStaveLink,
} from "../../src/lib/tracker-tasks/types";
import { TaskHeartbeatStore } from "./task-heartbeat-store";
import { ProjectMemoryStore } from "./project-memory-store";
import type { ProjectMemoryKind } from "../../src/lib/project-memory";
import type {
  TaskHeartbeat,
  TaskHeartbeatOccurrence,
} from "../../src/lib/automation/task-supervisor";
import {
  MartinSyncOutboxStore,
  type MartinOutboxEntry,
} from "./martin-sync-outbox-store";
import {
  shouldRunFullVacuumMigration,
  type SqliteStorageMetrics,
} from "./sqlite-maintenance-policy";

interface WorkspaceMetaRow {
  id: string;
  name: string;
  updated_at: string;
  shell_lite_json?: string | null;
  shell_summary_json?: string | null;
}

interface WorkspaceSnapshotRow {
  snapshot_json: string;
}

interface PersistedWorkspaceShellPayload extends Omit<
  PersistenceWorkspaceShell,
  "editorTabs"
> {
  editorTabs?: PersistenceWorkspaceShell["editorTabs"];
  editorTabsArtifactId?: string | null;
  editorTabsArtifactRelativePath?: string | null;
}

interface WorkspaceMessageRow {
  id: string;
  task_id: string;
  role: "user" | "assistant";
  model: string;
  provider_id: string;
  content: string;
  is_streaming: number;
  parts_json: string;
  message_json: string | null;
}

interface WorkspaceTaskRow {
  id: string;
  workspace_id: string;
  title: string;
  provider: ProviderId | "stave";
  updated_at: string;
  unread: number;
  archived_at: string | null;
}

interface TaskMessageCountRow {
  task_id: string;
  count: number;
}

interface JsonValueRow {
  value_json: string;
}

interface TurnSummaryRow {
  id: string;
  workspace_id: string;
  task_id: string;
  provider_id: ProviderId | "stave";
  created_at: string;
  completed_at: string | null;
  usage_json: string | null;
}

interface NotificationRow {
  id: string;
  kind:
    | "task.turn_completed"
    | "task.turn_failed"
    | "task.approval_requested"
    | "task.user_input_requested";
  title: string;
  body: string;
  project_path: string | null;
  project_name: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  task_id: string | null;
  task_title: string | null;
  turn_id: string | null;
  provider_id: ProviderId | "stave" | null;
  action_json: string | null;
  payload_json: string;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
  expires_at: string | null;
}

interface LocalMcpRequestLogRow {
  id: string;
  http_method: string;
  path: string;
  rpc_method: string | null;
  rpc_request_id: string | null;
  tool_name: string | null;
  status_code: number;
  duration_ms: number;
  has_request_payload: number;
  request_payload_json: string | null;
  error_message: string | null;
  created_at: string;
}

const MAX_LOCAL_MCP_REQUEST_LOGS = 500;
const LEGACY_TURN_JOURNAL_PURGE_KEY = "legacy_turn_journal_purged_v1";
const PERSISTENCE_COMPACTION_KEY = "persistence_compaction_v2";
export const MAX_ACTIVE_TURN_EVENTS = 2_000;
const EXPIRED_TURN_EVENT_COMPACTION_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const PERSISTENCE_COMPACTION_BATCH_SIZE = 2_000;
const ORPHAN_NOTIFICATION_DELETE_CHUNK_SIZE = 400;
const INCREMENTAL_VACUUM_PAGES_PER_MAINTENANCE = 4_096;

function normalizeNotificationWorkspaceIds(workspaceIds: string[]) {
  return Array.from(
    new Set(
      workspaceIds.map((workspaceId) => workspaceId.trim()).filter(Boolean),
    ),
  );
}
const LEGACY_TURN_EVENT_ARTIFACT_KIND = "turn_event_payload";
const ROUTINE_STATE_KEY = "routine_state_v1";
const ROUTINE_PROVIDER_TIMEOUT_KEY = "routine_provider_timeout_ms_v1";

function normalizePersistedProviderId(
  providerId: ProviderId | "stave",
): ProviderId {
  return providerId === "stave" ? "claude-code" : providerId;
}

export class SqliteStore {
  private db: Database.Database;
  private readonly dbPath: string;
  private artifactRootDir: string;
  private runLedger: RunLedgerStore;
  private craneJobBindings: CraneJobBindingStore;
  private trackerTasks: TrackerTasksStore;
  private martinSyncOutbox: MartinSyncOutboxStore;
  private taskHeartbeats: TaskHeartbeatStore;
  private projectMemories: ProjectMemoryStore;
  private _closed = false;
  private readonly runMaintenance: boolean;
  private maintenanceStart: NodeJS.Immediate | null = null;
  private onBootstrapStatusChange?: (
    status: PersistenceBootstrapStatus,
  ) => void;

  get closed() {
    return this._closed;
  }

  constructor(args: {
    dbPath: string;
    onBootstrapStatusChange?: (status: PersistenceBootstrapStatus) => void;
    runMaintenance?: boolean;
  }) {
    const dbPath = path.resolve(args.dbPath);
    this.dbPath = dbPath;
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.artifactRootDir = path.join(path.dirname(dbPath), "artifacts");
    this.onBootstrapStatusChange = args.onBootstrapStatusChange;
    this.runMaintenance = args.runMaintenance !== false;
    const hasExistingSchema = (
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'",
        )
        .get() as { count: number }
    ).count;
    if (hasExistingSchema === 0) {
      this.db.pragma("auto_vacuum = INCREMENTAL");
    }
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("wal_autocheckpoint = 1000");
    this.bootstrap();
    this.runLedger = new RunLedgerStore(this.db);
    this.craneJobBindings = new CraneJobBindingStore(this.db);
    this.trackerTasks = new TrackerTasksStore(this.db, {
      onUnreadableTaskRow: ({ source, taskRef }) => {
        console.warn(
          "[persistence] skipped an unreadable tracker task row",
          source,
          taskRef,
        );
      },
    });
    this.martinSyncOutbox = new MartinSyncOutboxStore(this.db);
    this.taskHeartbeats = new TaskHeartbeatStore(this.db);
    this.projectMemories = new ProjectMemoryStore(this.db);
    if (this.runMaintenance) {
      this.maintenanceStart = setImmediate(() => {
        this.maintenanceStart = null;
        if (this._closed) {
          return;
        }
        void this.compactOversizedPersistence().catch((error) => {
          console.warn("[persistence] background compaction failed", error);
        });
      });
      this.maintenanceStart.unref?.();
    }
  }

  private emitBootstrapStatus(status: PersistenceBootstrapStatus) {
    this.onBootstrapStatusChange?.(status);
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_meta (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        shell_lite_json TEXT,
        shell_summary_json TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        provider TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        unread INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_workspace_updated
        ON tasks (workspace_id, updated_at);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        role TEXT NOT NULL,
        model TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        content TEXT NOT NULL,
        is_streaming INTEGER NOT NULL DEFAULT 0,
        parts_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_workspace_task
        ON messages (workspace_id, task_id);

      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_turns_workspace_task_created
        ON turns (workspace_id, task_id, created_at);

      CREATE TABLE IF NOT EXISTS turn_events (
        id TEXT PRIMARY KEY,
        turn_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_artifact_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_turn_events_turn_sequence
        ON turn_events (turn_id, sequence);

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS terminal_snapshots (
        slot_key TEXT PRIMARY KEY,
        screen_state TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        project_path TEXT,
        project_name TEXT,
        workspace_id TEXT,
        workspace_name TEXT,
        task_id TEXT,
        task_title TEXT,
        turn_id TEXT,
        provider_id TEXT,
        action_json TEXT,
        payload_json TEXT NOT NULL,
        source_dedupe_key TEXT,
        created_at TEXT NOT NULL,
        read_at TEXT,
        resolved_at TEXT,
        expires_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source_dedupe
        ON notifications (source_dedupe_key)
        WHERE source_dedupe_key IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_notifications_created
        ON notifications (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_notifications_unread_created
        ON notifications (read_at, created_at DESC);

      CREATE TABLE IF NOT EXISTS local_mcp_request_logs (
        id TEXT PRIMARY KEY,
        http_method TEXT NOT NULL,
        path TEXT NOT NULL,
        rpc_method TEXT,
        rpc_request_id TEXT,
        tool_name TEXT,
        status_code INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        request_payload_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_mcp_request_logs_created
        ON local_mcp_request_logs (created_at DESC, id DESC);
    `);
    try {
      this.db.exec("ALTER TABLE messages ADD COLUMN message_json TEXT");
    } catch {
      // column already exists
    }
    try {
      this.db.exec(
        "ALTER TABLE workspace_meta ADD COLUMN shell_lite_json TEXT",
      );
    } catch {
      // column already exists
    }
    try {
      this.db.exec(
        "ALTER TABLE workspace_meta ADD COLUMN shell_summary_json TEXT",
      );
    } catch {
      // column already exists
    }
    try {
      this.db.exec(
        "ALTER TABLE turn_events ADD COLUMN payload_artifact_id TEXT",
      );
    } catch {
      // column already exists
    }
    try {
      this.db.exec("ALTER TABLE notifications ADD COLUMN resolved_at TEXT");
    } catch {
      // column already exists
    }
    try {
      // Per-turn token usage. Usage already lives inside `message_json`, but
      // only as denormalized text, so there was no way to ask "did turn N cost
      // less than turn N-1" — the question this column exists to answer.
      this.db.exec("ALTER TABLE turns ADD COLUMN usage_json TEXT");
    } catch {
      // column already exists
    }
    try {
      this.db.exec("ALTER TABLE notifications ADD COLUMN expires_at TEXT");
    } catch {
      // column already exists
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notifications_expires
        ON notifications (expires_at)
        WHERE expires_at IS NOT NULL;
    `);
    this.db
      .prepare(
        `
      UPDATE notifications
      SET expires_at = strftime(
        '%Y-%m-%dT%H:%M:%fZ',
        read_at,
        '+7 days'
      )
      WHERE expires_at IS NULL
        AND read_at IS NOT NULL
        AND kind IN ('task.turn_completed', 'task.turn_failed')
    `,
      )
      .run();
    if (this.runMaintenance) {
      this.purgeLegacyTurnJournal();
    }
  }

  private async compactOversizedPersistence() {
    if (this._closed) {
      return;
    }
    const alreadyCompacted = this.db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get(PERSISTENCE_COMPACTION_KEY) as JsonValueRow | undefined;
    let lastCompactedAt = Number.NaN;
    try {
      const marker = alreadyCompacted
        ? (JSON.parse(alreadyCompacted.value_json) as {
            compactedAt?: unknown;
          })
        : null;
      lastCompactedAt =
        typeof marker?.compactedAt === "string"
          ? Date.parse(marker.compactedAt)
          : Number.NaN;
    } catch {
      // An invalid marker is repaired by the compaction below.
    }
    if (
      alreadyCompacted &&
      Number.isFinite(lastCompactedAt) &&
      Date.now() - lastCompactedAt < EXPIRED_TURN_EVENT_COMPACTION_INTERVAL_MS
    ) {
      return;
    }

    this.emitBootstrapStatus({
      phase: "purging-legacy-turn-journal",
      message: alreadyCompacted
        ? "Removing expired conversation diagnostics."
        : "Compacting oversized conversation diagnostics from a previous version. This only runs once.",
    });

    try {
      const now = new Date().toISOString();
      while (!this._closed) {
        const removed = this.db
          .prepare(
            `
          DELETE FROM turn_events
          WHERE rowid IN (
            SELECT event.rowid
            FROM turn_events AS event
            JOIN turns AS turn ON turn.id = event.turn_id
            WHERE turn.completed_at IS NOT NULL
              AND event.event_type NOT IN (
                'error',
                'done',
                'provider_turn',
                'provider_session',
                'goal_status',
                'plan_ready'
              )
            LIMIT ?
          )
        `,
          )
          .run(PERSISTENCE_COMPACTION_BATCH_SIZE).changes;
        if (removed < PERSISTENCE_COMPACTION_BATCH_SIZE) {
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      if (!alreadyCompacted) {
        while (!this._closed) {
          const updated = this.db
            .prepare(
              `
            UPDATE messages
            SET parts_json = '[]'
            WHERE rowid IN (
              SELECT rowid
              FROM messages
              WHERE message_json IS NOT NULL AND parts_json <> '[]'
              LIMIT ?
            )
          `,
            )
            .run(PERSISTENCE_COMPACTION_BATCH_SIZE).changes;
          if (updated < PERSISTENCE_COMPACTION_BATCH_SIZE) {
            break;
          }
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
      while (!this._closed) {
        const removed = this.db
          .prepare(
            `
          DELETE FROM turn_events
          WHERE rowid IN (
            SELECT event.rowid
            FROM turn_events AS event
            JOIN turns AS turn ON turn.id = event.turn_id
            LEFT JOIN tasks AS task
              ON task.id = turn.workspace_id || ':' || turn.task_id
            WHERE task.id IS NULL AND turn.completed_at IS NOT NULL
            LIMIT ?
          )
        `,
          )
          .run(PERSISTENCE_COMPACTION_BATCH_SIZE).changes;
        if (removed < PERSISTENCE_COMPACTION_BATCH_SIZE) {
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      this.db
        .prepare(
          `
        DELETE FROM turns
        WHERE completed_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM tasks
            WHERE tasks.id = turns.workspace_id || ':' || turns.task_id
          )
      `,
        )
        .run();
      const orphanedArtifacts = this.db
        .prepare(
          `
        SELECT id, relative_path
        FROM artifacts AS artifact
        WHERE NOT EXISTS (
          SELECT 1
          FROM workspaces
          WHERE json_extract(snapshot_json, '$.editorTabsArtifactId') = artifact.id
        )
          AND NOT EXISTS (
            SELECT 1
            FROM turn_events
            WHERE payload_artifact_id = artifact.id
          )
      `,
        )
        .all() as Array<{ id: string; relative_path: string }>;
      this.deleteArtifactRows({
        artifactIds: orphanedArtifacts.map((artifact) => artifact.id),
      });
      if (this._closed) {
        return;
      }
      const tx = this.db.transaction(() => {
        this.db
          .prepare(
            `
          INSERT INTO app_state (key, value_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
        `,
          )
          .run(
            PERSISTENCE_COMPACTION_KEY,
            JSON.stringify({ compactedAt: now }),
            now,
          );
      });
      tx();
      if (Number(this.db.pragma("auto_vacuum", { simple: true })) === 2) {
        this.db.pragma(
          `incremental_vacuum(${INCREMENTAL_VACUUM_PAGES_PER_MAINTENANCE})`,
        );
      }
      this.removeArtifactFiles({
        relativePaths: orphanedArtifacts.map(
          (artifact) => artifact.relative_path,
        ),
      });
    } finally {
      this.emitBootstrapStatus(IDLE_PERSISTENCE_BOOTSTRAP_STATUS);
    }
  }

  private purgeLegacyTurnJournal() {
    const alreadyPurged = this.db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get(LEGACY_TURN_JOURNAL_PURGE_KEY) as JsonValueRow | undefined;
    if (alreadyPurged) {
      return;
    }

    this.emitBootstrapStatus({
      phase: "purging-legacy-turn-journal",
      message:
        "Cleaning up legacy workspace data from a previous version. This only runs once.",
    });

    try {
      const artifactRows = this.db
        .prepare(
          `
        SELECT id, relative_path
        FROM artifacts
        WHERE kind = ?
      `,
        )
        .all(LEGACY_TURN_EVENT_ARTIFACT_KIND) as Array<{
        id: string;
        relative_path: string;
      }>;
      const now = new Date().toISOString();

      const tx = this.db.transaction(() => {
        this.db.prepare("DELETE FROM turn_events").run();
        this.db
          .prepare("DELETE FROM artifacts WHERE kind = ?")
          .run(LEGACY_TURN_EVENT_ARTIFACT_KIND);
        this.db
          .prepare(
            `
          INSERT INTO app_state (key, value_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
        `,
          )
          .run(
            LEGACY_TURN_JOURNAL_PURGE_KEY,
            JSON.stringify({ purgedAt: now }),
            now,
          );
      });

      tx();
      this.removeArtifactFiles({
        relativePaths: artifactRows.map((row) => row.relative_path),
      });
    } finally {
      this.emitBootstrapStatus(IDLE_PERSISTENCE_BOOTSTRAP_STATUS);
    }
  }

  private mapNotificationRow(
    row: NotificationRow,
  ): PersistenceNotificationRecord {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      projectPath: row.project_path,
      projectName: row.project_name,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      taskId: row.task_id,
      taskTitle: row.task_title,
      turnId: row.turn_id,
      providerId: row.provider_id
        ? normalizePersistedProviderId(row.provider_id)
        : null,
      action: row.action_json ? JSON.parse(row.action_json) : null,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
      readAt: row.read_at,
      resolvedAt: row.resolved_at,
      expiresAt: row.expires_at,
    };
  }

  private mapLocalMcpRequestLogRow(
    row: LocalMcpRequestLogRow,
  ): PersistenceLocalMcpRequestLog {
    return {
      id: row.id,
      httpMethod: row.http_method,
      path: row.path,
      rpcMethod: row.rpc_method,
      rpcRequestId: row.rpc_request_id,
      toolName: row.tool_name,
      statusCode: row.status_code,
      durationMs: row.duration_ms,
      hasRequestPayload: row.has_request_payload === 1,
      requestPayload: row.request_payload_json
        ? JSON.parse(row.request_payload_json)
        : null,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }

  private insertArtifactRow(args: {
    artifact: PersistedWorkspaceShellEditorTabArtifactRecord;
  }) {
    this.db
      .prepare(
        `
      INSERT INTO artifacts (id, kind, relative_path, byte_size, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(
        args.artifact.id,
        args.artifact.kind,
        args.artifact.relativePath,
        args.artifact.byteSize,
        args.artifact.createdAt,
      );
  }

  private deleteArtifactRows(args: { artifactIds: string[] }) {
    if (args.artifactIds.length === 0) {
      return;
    }
    const deleteArtifact = this.db.prepare(
      "DELETE FROM artifacts WHERE id = ?",
    );
    for (const artifactId of args.artifactIds) {
      deleteArtifact.run(artifactId);
    }
  }

  private removeArtifactFiles(args: { relativePaths: string[] }) {
    if (args.relativePaths.length === 0) {
      return;
    }
    for (const relativePath of args.relativePaths) {
      try {
        rmSync(path.join(this.artifactRootDir, relativePath), { force: true });
      } catch {
        // Best-effort cleanup; stale artifacts should not break task deletion.
      }
    }
  }

  private getLocalMcpRequestLogCount(): number {
    const row = this.db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM local_mcp_request_logs
    `,
      )
      .get() as { count: number };
    return row.count;
  }

  private getNotificationById(
    id: string,
  ): PersistenceNotificationRecord | null {
    const row = this.db
      .prepare(
        `
      SELECT
        id,
        kind,
        title,
        body,
        project_path,
        project_name,
        workspace_id,
        workspace_name,
        task_id,
        task_title,
        turn_id,
        provider_id,
        action_json,
        payload_json,
        created_at,
        read_at,
        resolved_at,
        expires_at
      FROM notifications
      WHERE id = ?
    `,
      )
      .get(id) as NotificationRow | undefined;
    return row ? this.mapNotificationRow(row) : null;
  }

  private getNotificationByDedupeKey(
    dedupeKey: string,
  ): PersistenceNotificationRecord | null {
    const row = this.db
      .prepare(
        `
      SELECT
        id,
        kind,
        title,
        body,
        project_path,
        project_name,
        workspace_id,
        workspace_name,
        task_id,
        task_title,
        turn_id,
        provider_id,
        action_json,
        payload_json,
        created_at,
        read_at,
        resolved_at,
        expires_at
      FROM notifications
      WHERE source_dedupe_key = ?
      LIMIT 1
    `,
      )
      .get(dedupeKey) as NotificationRow | undefined;
    return row ? this.mapNotificationRow(row) : null;
  }

  private createWorkspaceShell(args: {
    snapshot: PersistenceWorkspaceSnapshot;
    messageCountByTask: Record<string, number>;
  }): PersistenceWorkspaceShell {
    return {
      activeTaskId: args.snapshot.activeTaskId,
      tasks: args.snapshot.tasks,
      promptDraftByTask: args.snapshot.promptDraftByTask ?? {},
      reviewCommentsByTask: args.snapshot.reviewCommentsByTask ?? {},
      providerSessionByTask: args.snapshot.providerSessionByTask ?? {},
      editorTabs: args.snapshot.editorTabs ?? [],
      activeEditorTabId: args.snapshot.activeEditorTabId ?? null,
      terminalTabs: args.snapshot.terminalTabs ?? [],
      activeTerminalTabId: args.snapshot.activeTerminalTabId ?? null,
      terminalDocked: args.snapshot.terminalDocked ?? false,
      cliSessionTabs: args.snapshot.cliSessionTabs ?? [],
      activeCliSessionTabId: args.snapshot.activeCliSessionTabId ?? null,
      activeSurface: args.snapshot.activeSurface ?? {
        kind: "task",
        taskId: args.snapshot.activeTaskId,
      },
      // Universal pane/tab model: copied WITHOUT defaults on purpose so a
      // missing field (legacy snapshot) stays missing across the round-trip
      // while an explicit empty value ([], {}, null) survives as-is.
      openTaskTabIds: args.snapshot.openTaskTabIds,
      lensTabs: args.snapshot.lensTabs,
      paneTabMeta: args.snapshot.paneTabMeta,
      dockLayout: args.snapshot.dockLayout,
      workspaceInformation: args.snapshot.workspaceInformation,
      messageCountByTask: args.messageCountByTask,
    };
  }

  private createWorkspaceShellSummary(args: {
    shell: Pick<
      PersistenceWorkspaceShell,
      | "activeTaskId"
      | "tasks"
      | "messageCountByTask"
      | "terminalTabs"
      | "cliSessionTabs"
      | "openTaskTabIds"
    >;
  }): PersistenceWorkspaceShellSummary {
    return {
      activeTaskId: args.shell.activeTaskId,
      tasks: args.shell.tasks,
      messageCountByTask: args.shell.messageCountByTask ?? {},
      terminalTabCount: args.shell.terminalTabs?.length ?? 0,
      cliSessionTabCount: args.shell.cliSessionTabs?.length ?? 0,
      openTaskTabIds: args.shell.openTaskTabIds,
    };
  }

  private preparePersistedWorkspaceShell(args: {
    shell: PersistenceWorkspaceShell;
    updatedAt: string;
    artifactId?: string;
    previousBodyByTabId?: Map<
      string,
      {
        id: string;
        content: string;
        originalContent?: string;
        savedContent?: string;
      }
    >;
  }) {
    const preparedEditorTabs = prepareWorkspaceShellEditorTabsPersistence({
      artifactId: args.artifactId ?? `workspace-shell-${randomUUID()}`,
      editorTabs: args.shell.editorTabs,
      createdAt: args.updatedAt,
      previousBodyByTabId: args.previousBodyByTabId,
    });

    return {
      persistedShellPayload: {
        ...args.shell,
        editorTabs: preparedEditorTabs.persistedEditorTabs,
        editorTabsArtifactId: preparedEditorTabs.artifact?.id ?? null,
        editorTabsArtifactRelativePath:
          preparedEditorTabs.artifact?.relativePath ?? null,
      } satisfies PersistedWorkspaceShellPayload,
      shellLiteJson: JSON.stringify(
        this.createWorkspaceShellLite({ shell: args.shell }),
      ),
      shellSummaryJson: JSON.stringify(
        this.createWorkspaceShellSummary({ shell: args.shell }),
      ),
      artifact: preparedEditorTabs.artifact,
    };
  }

  private createWorkspaceShellLite(args: {
    shell: Pick<
      PersistenceWorkspaceShell,
      | "activeTaskId"
      | "tasks"
      | "promptDraftByTask"
      | "reviewCommentsByTask"
      | "providerSessionByTask"
      | "messageCountByTask"
    >;
  }): PersistenceWorkspaceShellLite {
    return {
      activeTaskId: args.shell.activeTaskId,
      tasks: args.shell.tasks,
      promptDraftByTask: args.shell.promptDraftByTask ?? {},
      reviewCommentsByTask: args.shell.reviewCommentsByTask ?? {},
      providerSessionByTask: args.shell.providerSessionByTask ?? {},
      messageCountByTask: args.shell.messageCountByTask ?? {},
    };
  }

  private parseWorkspacePayload(args: {
    snapshotJson: string;
  }): PersistenceWorkspaceShell | PersistenceWorkspaceSnapshot {
    return JSON.parse(args.snapshotJson) as
      PersistedWorkspaceShellPayload | PersistenceWorkspaceSnapshot;
  }

  private parseWorkspaceShellLite(args: {
    shellLiteJson: string;
  }): PersistenceWorkspaceShellLite {
    return JSON.parse(args.shellLiteJson) as PersistenceWorkspaceShellLite;
  }

  private parseWorkspaceShellSummary(args: {
    shellSummaryJson: string;
  }): PersistenceWorkspaceShellSummary {
    return JSON.parse(
      args.shellSummaryJson,
    ) as PersistenceWorkspaceShellSummary;
  }

  private toWorkspaceShell(args: {
    payload: PersistedWorkspaceShellPayload | PersistenceWorkspaceSnapshot;
  }): PersistenceWorkspaceShell {
    if ("messagesByTask" in args.payload) {
      const snapshot = args.payload as PersistenceWorkspaceSnapshot;
      return this.createWorkspaceShell({
        snapshot,
        messageCountByTask: Object.fromEntries(
          Object.entries(snapshot.messagesByTask).map(
            ([taskId, messages]) => [taskId, messages.length] as const,
          ),
        ),
      });
    }
    const editorTabs = hydratePersistedWorkspaceEditorTabs({
      rootDir: this.artifactRootDir,
      persistedEditorTabs: args.payload.editorTabs,
      artifactRelativePath: args.payload.editorTabsArtifactRelativePath,
    });
    const {
      editorTabsArtifactId: _editorTabsArtifactId,
      editorTabsArtifactRelativePath: _editorTabsArtifactRelativePath,
      ...payloadWithoutArtifactPointers
    } = args.payload;
    return {
      promptDraftByTask: {},
      reviewCommentsByTask: {},
      providerSessionByTask: {},
      editorTabs,
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task", taskId: args.payload.activeTaskId },
      messageCountByTask: {},
      ...payloadWithoutArtifactPointers,
      editorTabs,
    };
  }

  private toWorkspaceShellForRestore(args: {
    payload: PersistedWorkspaceShellPayload | PersistenceWorkspaceSnapshot;
  }): PersistenceWorkspaceShell {
    if ("messagesByTask" in args.payload) {
      return this.toWorkspaceShell(args);
    }
    const editorTabs = restorePersistedWorkspaceEditorTabs({
      rootDir: this.artifactRootDir,
      persistedEditorTabs: args.payload.editorTabs,
      artifactRelativePath: args.payload.editorTabsArtifactRelativePath,
      activeEditorTabId: args.payload.activeEditorTabId,
    });
    const {
      editorTabsArtifactId: _editorTabsArtifactId,
      editorTabsArtifactRelativePath: _editorTabsArtifactRelativePath,
      ...payloadWithoutArtifactPointers
    } = args.payload;
    return {
      promptDraftByTask: {},
      reviewCommentsByTask: {},
      providerSessionByTask: {},
      editorTabs,
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      terminalDocked: false,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeSurface: { kind: "task", taskId: args.payload.activeTaskId },
      messageCountByTask: {},
      ...payloadWithoutArtifactPointers,
      editorTabs,
    };
  }

  private mergeShellWithPersistedTasks(args: {
    workspaceId: string;
    shell: PersistenceWorkspaceShell;
  }): PersistenceWorkspaceShell {
    const persistedTasks = this.listWorkspaceTasks({
      workspaceId: args.workspaceId,
    });
    if (persistedTasks.length === 0) {
      return args.shell;
    }

    const shellTaskIds = new Set(args.shell.tasks.map((task) => task.id));
    const missingTasks = persistedTasks.filter(
      (task) => !shellTaskIds.has(task.id),
    );
    if (missingTasks.length === 0) {
      return args.shell;
    }

    const countRows = this.db
      .prepare(
        `
      SELECT task_id, COUNT(*) AS count
      FROM messages
      WHERE workspace_id = ?
      GROUP BY task_id
    `,
      )
      .all(args.workspaceId) as TaskMessageCountRow[];
    const countByTask = new Map(
      countRows.map((row) => [row.task_id, row.count] as const),
    );
    const mergedTasks = [...args.shell.tasks, ...missingTasks];
    const activeTaskId = mergedTasks.some(
      (task) => task.id === args.shell.activeTaskId,
    )
      ? args.shell.activeTaskId
      : (mergedTasks[0]?.id ?? "");
    const mergedMessageCountByTask = {
      ...args.shell.messageCountByTask,
      ...Object.fromEntries(
        missingTasks.map(
          (task) => [task.id, countByTask.get(task.id) ?? 0] as const,
        ),
      ),
    };

    return {
      ...args.shell,
      activeTaskId,
      tasks: mergedTasks,
      messageCountByTask: mergedMessageCountByTask,
    };
  }

  private getWorkspaceShellArtifactPointer(args: {
    payload: PersistedWorkspaceShellPayload | PersistenceWorkspaceSnapshot;
  }): PersistedWorkspaceShellArtifactPointer | null {
    if ("messagesByTask" in args.payload) {
      return null;
    }
    if (
      !args.payload.editorTabsArtifactId ||
      !args.payload.editorTabsArtifactRelativePath
    ) {
      return null;
    }
    return {
      id: args.payload.editorTabsArtifactId,
      relativePath: args.payload.editorTabsArtifactRelativePath,
    };
  }

  private readWorkspacePayload(args: { workspaceId: string }) {
    const row = this.db
      .prepare("SELECT snapshot_json FROM workspaces WHERE id = ?")
      .get(args.workspaceId) as WorkspaceSnapshotRow | undefined;
    if (!row) {
      return null;
    }
    const payload = this.parseWorkspacePayload({
      snapshotJson: row.snapshot_json,
    });
    return {
      row,
      payload,
    };
  }

  loadWorkspaceShellSummary(args: {
    workspaceId: string;
  }): PersistenceWorkspaceShellSummary | null {
    const row = this.db
      .prepare("SELECT shell_summary_json FROM workspace_meta WHERE id = ?")
      .get(args.workspaceId) as
      Pick<WorkspaceMetaRow, "shell_summary_json"> | undefined;

    if (row?.shell_summary_json) {
      return this.parseWorkspaceShellSummary({
        shellSummaryJson: row.shell_summary_json,
      });
    }

    const payloadEntry = this.readWorkspacePayload(args);
    if (!payloadEntry) {
      return null;
    }

    return this.createWorkspaceShellSummary({
      shell: this.toWorkspaceShell({ payload: payloadEntry.payload }),
    });
  }

  loadWorkspaceShellLite(args: {
    workspaceId: string;
  }): PersistenceWorkspaceShellLite | null {
    const row = this.db
      .prepare("SELECT shell_lite_json FROM workspace_meta WHERE id = ?")
      .get(args.workspaceId) as
      Pick<WorkspaceMetaRow, "shell_lite_json"> | undefined;

    if (row?.shell_lite_json) {
      return this.parseWorkspaceShellLite({
        shellLiteJson: row.shell_lite_json,
      });
    }

    const payloadEntry = this.readWorkspacePayload(args);
    if (!payloadEntry) {
      return null;
    }

    return this.createWorkspaceShellLite({
      shell: this.toWorkspaceShell({ payload: payloadEntry.payload }),
    });
  }

  private mapTaskMessageRow(args: {
    workspaceId: string;
    taskId: string;
    row: WorkspaceMessageRow;
  }) {
    if (args.row.message_json) {
      return JSON.parse(
        args.row.message_json,
      ) as PersistenceWorkspaceSnapshot["messagesByTask"][string][number];
    }
    const prefix = `${args.workspaceId}:${args.taskId}:`;
    return {
      id: args.row.id.startsWith(prefix)
        ? args.row.id.slice(prefix.length)
        : args.row.id,
      role: args.row.role,
      model: args.row.model,
      providerId: args.row.provider_id,
      content: args.row.content,
      isStreaming: args.row.is_streaming === 1,
      parts: JSON.parse(args.row.parts_json),
    };
  }

  private mapWorkspaceTaskRow(args: {
    workspaceId: string;
    row: WorkspaceTaskRow;
  }): PersistenceTaskRow {
    const prefix = `${args.workspaceId}:`;
    return {
      id: args.row.id.startsWith(prefix)
        ? args.row.id.slice(prefix.length)
        : args.row.id,
      title: args.row.title,
      provider: normalizePersistedProviderId(args.row.provider),
      updatedAt: args.row.updated_at,
      unread: args.row.unread === 1,
      archivedAt: args.row.archived_at,
    };
  }

  listWorkspaceTasks(args: { workspaceId: string }): PersistenceTaskRow[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, workspace_id, title, provider, updated_at, unread, archived_at
      FROM tasks
      WHERE workspace_id = ?
      ORDER BY updated_at DESC, id DESC
    `,
      )
      .all(args.workspaceId) as WorkspaceTaskRow[];
    return rows.map((row) =>
      this.mapWorkspaceTaskRow({ workspaceId: args.workspaceId, row }),
    );
  }

  private insertTaskMessages(args: {
    workspaceId: string;
    taskId: string;
    messages: PersistenceWorkspaceSnapshot["messagesByTask"][string];
  }) {
    for (const message of args.messages) {
      const persistedMessageRowId = `${args.workspaceId}:${args.taskId}:${message.id}`;
      this.db
        .prepare(
          `
        INSERT INTO messages (
          id, workspace_id, task_id, role, model, provider_id, content, is_streaming, parts_json, message_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          role = excluded.role,
          model = excluded.model,
          provider_id = excluded.provider_id,
          content = excluded.content,
          is_streaming = excluded.is_streaming,
          parts_json = excluded.parts_json,
          message_json = excluded.message_json
      `,
        )
        .run(
          persistedMessageRowId,
          args.workspaceId,
          args.taskId,
          message.role,
          message.model,
          message.providerId,
          message.content,
          message.isStreaming ? 1 : 0,
          "[]",
          JSON.stringify(message),
        );
    }
  }

  loadAllTaskMessages(args: { workspaceId: string; taskId: string }) {
    const rows = this.db
      .prepare(
        `
      SELECT id, task_id, role, model, provider_id, content, is_streaming, parts_json, message_json
      FROM messages
      WHERE workspace_id = ? AND task_id = ?
      ORDER BY rowid ASC
    `,
      )
      .all(args.workspaceId, args.taskId) as WorkspaceMessageRow[];
    return rows.map((row) => this.mapTaskMessageRow({ ...args, row }));
  }

  truncateTaskMessagesAfter(args: {
    workspaceId: string;
    taskId: string;
    messageId: string;
  }) {
    const persistedMessageId = `${args.workspaceId}:${args.taskId}:${args.messageId}`;
    const target = this.db
      .prepare(
        `
        SELECT rowid
        FROM messages
        WHERE id = ? AND workspace_id = ? AND task_id = ?
      `,
      )
      .get(persistedMessageId, args.workspaceId, args.taskId) as
      { rowid: number } | undefined;
    if (!target) {
      return { ok: false, removedCount: 0 };
    }

    const result = this.db
      .prepare(
        `
        DELETE FROM messages
        WHERE workspace_id = ? AND task_id = ? AND rowid > ?
      `,
      )
      .run(args.workspaceId, args.taskId, target.rowid);
    return { ok: true, removedCount: result.changes };
  }

  listWorkspaceSummaries(): PersistenceWorkspaceSummary[] {
    const rows = this.db
      .prepare(
        "SELECT id, name, updated_at FROM workspace_meta ORDER BY updated_at DESC",
      )
      .all() as WorkspaceMetaRow[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
    }));
  }

  createNotification(args: {
    notification: PersistenceNotificationCreateInput;
  }): {
    inserted: boolean;
    notification: PersistenceNotificationRecord | null;
  } {
    const notification = args.notification;
    const createdAt = notification.createdAt ?? new Date().toISOString();
    const readAt = notification.readAt ?? null;
    const resolvedAt = notification.resolvedAt ?? null;
    const pendingAttention =
      (notification.kind === "task.approval_requested" ||
        notification.kind === "task.user_input_requested") &&
      !resolvedAt;
    const expiresAt = pendingAttention
      ? null
      : (notification.expiresAt ??
        (readAt ? buildNotificationExpiresAt({ readAt }) : null));
    const actionJson = notification.action
      ? JSON.stringify(notification.action)
      : null;
    const payloadJson = JSON.stringify(notification.payload ?? {});
    const dedupeKey = notification.dedupeKey ?? null;

    const result = this.db
      .prepare(
        `
      INSERT OR IGNORE INTO notifications (
        id,
        kind,
        title,
        body,
        project_path,
        project_name,
        workspace_id,
        workspace_name,
        task_id,
        task_title,
        turn_id,
        provider_id,
        action_json,
        payload_json,
        source_dedupe_key,
        created_at,
        read_at,
        resolved_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        notification.id,
        notification.kind,
        notification.title,
        notification.body,
        notification.projectPath ?? null,
        notification.projectName ?? null,
        notification.workspaceId ?? null,
        notification.workspaceName ?? null,
        notification.taskId ?? null,
        notification.taskTitle ?? null,
        notification.turnId ?? null,
        notification.providerId ?? null,
        actionJson,
        payloadJson,
        dedupeKey,
        createdAt,
        readAt,
        resolvedAt,
        expiresAt,
      );

    if (result.changes > 0) {
      return {
        inserted: true,
        notification: this.getNotificationById(notification.id),
      };
    }

    if (dedupeKey) {
      return {
        inserted: false,
        notification: this.getNotificationByDedupeKey(dedupeKey),
      };
    }

    return {
      inserted: false,
      notification: this.getNotificationById(notification.id),
    };
  }

  listNotifications(args?: {
    limit?: number;
    unreadOnly?: boolean;
  }): PersistenceNotificationRecord[] {
    const limit = Math.max(1, Math.min(500, args?.limit ?? 100));
    const unreadOnly = args?.unreadOnly === true;
    const pendingAttentionPredicate = `
      kind IN ('task.approval_requested', 'task.user_input_requested')
      AND resolved_at IS NULL
      AND expires_at IS NULL
    `;
    const rows = this.db
      .prepare(
        `
      SELECT
        id,
        kind,
        title,
        body,
        project_path,
        project_name,
        workspace_id,
        workspace_name,
        task_id,
        task_title,
        turn_id,
        provider_id,
        action_json,
        payload_json,
        created_at,
        read_at,
        resolved_at,
        expires_at
      FROM notifications
      WHERE (
        (${pendingAttentionPredicate})
        OR id IN (
          SELECT id
          FROM notifications
          WHERE NOT (${pendingAttentionPredicate})
          ${unreadOnly ? "AND read_at IS NULL" : ""}
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        )
      )
      ${unreadOnly ? "AND read_at IS NULL" : ""}
      ORDER BY created_at DESC, id DESC
    `,
      )
      .all(limit) as NotificationRow[];

    return rows.map((row) => this.mapNotificationRow(row));
  }

  markNotificationRead(args: {
    id: string;
    readAt?: string;
    resolvedAt?: string;
  }): PersistenceNotificationRecord | null {
    const readAt = args.readAt ?? new Date().toISOString();
    const expiresAt = buildNotificationExpiresAt({
      readAt: args.resolvedAt ?? readAt,
    });
    this.db
      .prepare(
        `
      UPDATE notifications
      SET
        read_at = COALESCE(read_at, ?),
        resolved_at = COALESCE(resolved_at, ?),
        expires_at = CASE
          WHEN kind IN ('task.approval_requested', 'task.user_input_requested')
            AND COALESCE(resolved_at, ?) IS NULL
          THEN NULL
          ELSE COALESCE(expires_at, ?)
        END
      WHERE id = ?
    `,
      )
      .run(
        readAt,
        args.resolvedAt ?? null,
        args.resolvedAt ?? null,
        expiresAt,
        args.id,
      );
    return this.getNotificationById(args.id);
  }

  markAllNotificationsRead(args?: { readAt?: string }): number {
    const readAt = args?.readAt ?? new Date().toISOString();
    const expiresAt = buildNotificationExpiresAt({ readAt });
    const result = this.db
      .prepare(
        `
      UPDATE notifications
      SET
        read_at = ?,
        expires_at = CASE
          WHEN kind IN ('task.approval_requested', 'task.user_input_requested')
            AND resolved_at IS NULL
          THEN NULL
          ELSE COALESCE(expires_at, ?)
        END
      WHERE read_at IS NULL
    `,
      )
      .run(readAt, expiresAt);
    return result.changes;
  }

  pruneNotifications(args?: { now?: string }): number {
    const now = args?.now ?? new Date().toISOString();
    const result = this.db
      .prepare(
        `
      DELETE FROM notifications
      WHERE expires_at IS NOT NULL
        AND expires_at <= ?
        AND NOT (
          kind IN ('task.approval_requested', 'task.user_input_requested')
          AND resolved_at IS NULL
        )
    `,
      )
      .run(now);
    return result.changes;
  }

  deleteNotificationsForWorkspaces(args: { workspaceIds: string[] }): number {
    const workspaceIds = normalizeNotificationWorkspaceIds(args.workspaceIds);
    if (workspaceIds.length === 0) {
      return 0;
    }
    const placeholders = workspaceIds.map(() => "?").join(", ");
    const result = this.db
      .prepare(
        `DELETE FROM notifications WHERE workspace_id IN (${placeholders})`,
      )
      .run(...workspaceIds);
    return result.changes;
  }

  /**
   * Drops notification rows whose workspace is gone. The main process owns the
   * authoritative inventory, so the verdict is reached here instead of being
   * handed down by the renderer; see `selectOrphanedNotificationWorkspaceIds`.
   * The purged workspace ids come back so the renderer can prune its in-memory
   * list without repeating the judgement.
   */
  deleteOrphanedNotifications(): { count: number; workspaceIds: string[] } {
    const notificationWorkspaceIds = (
      this.db
        .prepare(
          "SELECT DISTINCT workspace_id FROM notifications WHERE workspace_id IS NOT NULL",
        )
        .all() as { workspace_id: string }[]
    ).map((row) => row.workspace_id);
    const workspaceRowIds = (
      this.db.prepare("SELECT id FROM workspaces").all() as { id: string }[]
    ).map((row) => row.id);
    const registryWorkspaceIds = this.loadProjectRegistry().flatMap((project) =>
      (project.workspaces ?? []).map((workspace) => workspace.id),
    );

    const workspaceIds = selectOrphanedNotificationWorkspaceIds({
      notificationWorkspaceIds,
      workspaceRowIds,
      registryWorkspaceIds,
    });
    if (workspaceIds.length === 0) {
      return { count: 0, workspaceIds: [] };
    }

    // Chunked so a long-lived database cannot blow past SQLite's bound
    // parameter limit.
    let count = 0;
    for (
      let index = 0;
      index < workspaceIds.length;
      index += ORPHAN_NOTIFICATION_DELETE_CHUNK_SIZE
    ) {
      count += this.deleteNotificationsForWorkspaces({
        workspaceIds: workspaceIds.slice(
          index,
          index + ORPHAN_NOTIFICATION_DELETE_CHUNK_SIZE,
        ),
      });
    }
    return { count, workspaceIds };
  }

  clearNotificationHistory(): number {
    const result = this.db
      .prepare(
        `
      DELETE FROM notifications
      WHERE (read_at IS NOT NULL OR resolved_at IS NOT NULL)
    `,
      )
      .run();
    return result.changes;
  }

  createLocalMcpRequestLog(args: {
    log: PersistenceLocalMcpRequestLogCreateInput;
  }) {
    const createdAt = args.log.createdAt ?? new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `
        INSERT INTO local_mcp_request_logs (
          id,
          http_method,
          path,
          rpc_method,
          rpc_request_id,
          tool_name,
          status_code,
          duration_ms,
          request_payload_json,
          error_message,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          args.log.id,
          args.log.httpMethod,
          args.log.path,
          args.log.rpcMethod ?? null,
          args.log.rpcRequestId ?? null,
          args.log.toolName ?? null,
          args.log.statusCode,
          args.log.durationMs,
          args.log.requestPayload === null
            ? null
            : JSON.stringify(args.log.requestPayload),
          args.log.errorMessage ?? null,
          createdAt,
        );

      this.db
        .prepare(
          `
        DELETE FROM local_mcp_request_logs
        WHERE id NOT IN (
          SELECT id
          FROM local_mcp_request_logs
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        )
      `,
        )
        .run(MAX_LOCAL_MCP_REQUEST_LOGS);
    });

    tx();
  }

  listLocalMcpRequestLogs(args?: {
    limit?: number;
    offset?: number;
    includePayload?: boolean;
  }): PersistenceLocalMcpRequestLogPage {
    const limit = Math.max(1, Math.min(500, args?.limit ?? 100));
    const total = this.getLocalMcpRequestLogCount();
    const maxOffset = total === 0 ? 0 : Math.floor((total - 1) / limit) * limit;
    const offset = Math.max(0, Math.min(args?.offset ?? 0, maxOffset));
    const requestPayloadColumn =
      args?.includePayload === true
        ? "request_payload_json"
        : "NULL AS request_payload_json";
    const rows = this.db
      .prepare(
        `
      SELECT
        id,
        http_method,
        path,
        rpc_method,
        rpc_request_id,
        tool_name,
        status_code,
        duration_ms,
        CASE WHEN request_payload_json IS NULL THEN 0 ELSE 1 END AS has_request_payload,
        ${requestPayloadColumn},
        error_message,
        created_at
      FROM local_mcp_request_logs
      ORDER BY created_at DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
      )
      .all(limit, offset) as LocalMcpRequestLogRow[];

    return {
      logs: rows.map((row) => this.mapLocalMcpRequestLogRow(row)),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  getLocalMcpRequestLog(args: {
    id: string;
    includePayload?: boolean;
  }): PersistenceLocalMcpRequestLog | null {
    const requestPayloadColumn =
      args.includePayload === true
        ? "request_payload_json"
        : "NULL AS request_payload_json";
    const row = this.db
      .prepare(
        `
      SELECT
        id,
        http_method,
        path,
        rpc_method,
        rpc_request_id,
        tool_name,
        status_code,
        duration_ms,
        CASE WHEN request_payload_json IS NULL THEN 0 ELSE 1 END AS has_request_payload,
        ${requestPayloadColumn},
        error_message,
        created_at
      FROM local_mcp_request_logs
      WHERE id = ?
    `,
      )
      .get(args.id) as LocalMcpRequestLogRow | undefined;

    return row ? this.mapLocalMcpRequestLogRow(row) : null;
  }

  clearLocalMcpRequestLogs(): number {
    const result = this.db.prepare("DELETE FROM local_mcp_request_logs").run();
    return result.changes;
  }

  loadWorkspaceShell(args: {
    workspaceId: string;
  }): PersistenceWorkspaceShell | null {
    const payloadEntry = this.readWorkspacePayload(args);
    if (!payloadEntry) {
      return null;
    }
    return this.mergeShellWithPersistedTasks({
      workspaceId: args.workspaceId,
      shell: this.toWorkspaceShell({ payload: payloadEntry.payload }),
    });
  }

  loadWorkspaceShellForRestore(args: {
    workspaceId: string;
  }): PersistenceWorkspaceShell | null {
    const payloadEntry = this.readWorkspacePayload(args);
    if (!payloadEntry) {
      return null;
    }

    return this.mergeShellWithPersistedTasks({
      workspaceId: args.workspaceId,
      shell: this.toWorkspaceShellForRestore({ payload: payloadEntry.payload }),
    });
  }

  loadWorkspaceEditorTabBodies(args: {
    workspaceId: string;
    tabIds: string[];
  }) {
    if (args.tabIds.length === 0) {
      return [];
    }

    const payloadEntry = this.readWorkspacePayload({
      workspaceId: args.workspaceId,
    });
    if (!payloadEntry) {
      return [];
    }

    if ("messagesByTask" in payloadEntry.payload) {
      const snapshotTabs = payloadEntry.payload.editorTabs ?? [];
      const requestedIds = new Set(args.tabIds);
      return snapshotTabs
        .filter((tab) => requestedIds.has(tab.id))
        .map((tab) => ({
          id: tab.id,
          content: tab.content ?? "",
          ...(tab.originalContent !== undefined
            ? { originalContent: tab.originalContent }
            : {}),
          ...(tab.savedContent !== undefined
            ? { savedContent: tab.savedContent }
            : {}),
        }));
    }

    const bodyEntries = readPersistedWorkspaceEditorTabBodies({
      rootDir: this.artifactRootDir,
      artifactRelativePath: payloadEntry.payload.editorTabsArtifactRelativePath,
      tabIds: args.tabIds,
    });
    return args.tabIds.flatMap((tabId) => {
      const body = bodyEntries.get(tabId);
      return body ? [body] : [];
    });
  }

  loadTaskMessagesPage(args: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    offset?: number;
  }): PersistenceTaskMessagesPage | null {
    const payloadEntry = this.readWorkspacePayload({
      workspaceId: args.workspaceId,
    });
    if (!payloadEntry) {
      return null;
    }

    const limit = Math.max(1, Math.min(500, args.limit ?? 120));
    const offset = Math.max(0, args.offset ?? 0);

    if ("messagesByTask" in payloadEntry.payload) {
      const allMessages =
        (payloadEntry.payload as PersistenceWorkspaceSnapshot).messagesByTask[
          args.taskId
        ] ?? [];
      const start = Math.max(allMessages.length - offset - limit, 0);
      const end = Math.max(allMessages.length - offset, 0);
      return {
        messages: allMessages.slice(start, end),
        totalCount: allMessages.length,
        limit,
        offset,
        hasMoreOlder: start > 0,
      };
    }

    const totalCount =
      ("messageCountByTask" in payloadEntry.payload
        ? payloadEntry.payload.messageCountByTask?.[args.taskId]
        : undefined) ??
      (() => {
        const row = this.db
          .prepare(
            `
          SELECT COUNT(*) AS count
          FROM messages
          WHERE workspace_id = ? AND task_id = ?
        `,
          )
          .get(args.workspaceId, args.taskId) as { count: number };
        return row.count;
      })();
    const rows = this.db
      .prepare(
        `
      SELECT id, task_id, role, model, provider_id, content, is_streaming, parts_json, message_json
      FROM messages
      WHERE workspace_id = ? AND task_id = ?
      ORDER BY rowid DESC
      LIMIT ?
      OFFSET ?
    `,
      )
      .all(
        args.workspaceId,
        args.taskId,
        limit,
        offset,
      ) as WorkspaceMessageRow[];

    return {
      messages: rows.reverse().map((row) =>
        this.mapTaskMessageRow({
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          row,
        }),
      ),
      totalCount,
      limit,
      offset,
      hasMoreOlder: offset + rows.length < totalCount,
    };
  }

  loadWorkspaceSnapshot(args: {
    workspaceId: string;
  }): PersistenceWorkspaceSnapshot | null {
    const payloadEntry = this.readWorkspacePayload(args);
    if (!payloadEntry) {
      return null;
    }
    if ("messagesByTask" in payloadEntry.payload) {
      return payloadEntry.payload as PersistenceWorkspaceSnapshot;
    }
    const shell = this.loadWorkspaceShell(args);
    if (!shell) {
      return null;
    }
    const { messageCountByTask: _messageCountByTask, ...shellWithoutCounts } =
      shell;
    return {
      ...shellWithoutCounts,
      messagesByTask: Object.fromEntries(
        shell.tasks.map(
          (task) =>
            [
              task.id,
              this.loadAllTaskMessages({
                workspaceId: args.workspaceId,
                taskId: task.id,
              }),
            ] as const,
        ),
      ),
    };
  }

  loadProjectRegistry(): PersistenceProjectRegistryEntry[] {
    const row = this.db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get("project_registry") as JsonValueRow | undefined;
    if (!row) {
      return [];
    }
    return JSON.parse(row.value_json) as PersistenceProjectRegistryEntry[];
  }

  saveProjectRegistry(args: { projects: PersistenceProjectRegistryEntry[] }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO app_state (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
      )
      .run("project_registry", JSON.stringify(args.projects), now);
  }

  loadRoutineState(): RoutineState {
    const row = this.db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get(ROUTINE_STATE_KEY) as JsonValueRow | undefined;
    if (!row) {
      return createEmptyRoutineState();
    }
    try {
      return normalizeRoutineState(JSON.parse(row.value_json));
    } catch {
      return createEmptyRoutineState();
    }
  }

  saveRoutineState(args: { state: RoutineState }) {
    const now = new Date().toISOString();
    const state = normalizeRoutineState(args.state);
    this.db
      .prepare(
        `
      INSERT INTO app_state (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
      )
      .run(ROUTINE_STATE_KEY, JSON.stringify(state), now);
  }

  loadRoutineProviderTimeoutMs() {
    const row = this.db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get(ROUTINE_PROVIDER_TIMEOUT_KEY) as JsonValueRow | undefined;
    if (!row) {
      return null;
    }
    try {
      const value = JSON.parse(row.value_json);
      return typeof value === "number" && Number.isInteger(value)
        ? value
        : null;
    } catch {
      return null;
    }
  }

  saveRoutineProviderTimeoutMs(args: { providerTimeoutMs: number }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO app_state (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
      )
      .run(
        ROUTINE_PROVIDER_TIMEOUT_KEY,
        JSON.stringify(args.providerTimeoutMs),
        now,
      );
  }

  getRunAggregate(args: Parameters<RunLedgerStore["getAggregate"]>[0]) {
    return this.runLedger.getAggregate(args);
  }

  claimRunStep(args: Parameters<RunLedgerStore["claimStep"]>[0]) {
    return this.runLedger.claimStep(args);
  }

  markRunStepWaiting(args: Parameters<RunLedgerStore["markStepWaiting"]>[0]) {
    return this.runLedger.markStepWaiting(args);
  }

  completeRunStep(args: Parameters<RunLedgerStore["completeStep"]>[0]) {
    return this.runLedger.completeStep(args);
  }

  failRunStep(args: Parameters<RunLedgerStore["failStep"]>[0]) {
    return this.runLedger.failStep(args);
  }

  cancelRunStep(args: Parameters<RunLedgerStore["cancelStep"]>[0]) {
    return this.runLedger.cancelStep(args);
  }

  listRunReceipts(args: Parameters<RunLedgerStore["listReceipts"]>[0]) {
    return this.runLedger.listReceipts(args);
  }

  listRunAggregatesByOrigin(
    args: Parameters<RunLedgerStore["listAggregatesByOrigin"]>[0],
  ) {
    return this.runLedger.listAggregatesByOrigin(args);
  }

  listRunAggregatesByOwnedTask(
    args: Parameters<RunLedgerStore["listAggregatesByOwnedTask"]>[0],
  ) {
    return this.runLedger.listAggregatesByOwnedTask(args);
  }

  listActiveRunAggregatesByStepKind(
    args: Parameters<RunLedgerStore["listActiveAggregatesByStepKind"]>[0],
  ) {
    return this.runLedger.listActiveAggregatesByStepKind(args);
  }

  setRunStepTarget(args: Parameters<RunLedgerStore["setStepTarget"]>[0]) {
    return this.runLedger.setStepTarget(args);
  }

  interruptRunStep(args: Parameters<RunLedgerStore["interruptStep"]>[0]) {
    return this.runLedger.interruptStep(args);
  }

  reconcileInterruptedRuns(
    args: Parameters<RunLedgerStore["reconcileInterruptedRuns"]>[0],
  ) {
    return this.runLedger.reconcileInterruptedRuns(args);
  }

  saveTerminalSnapshot(args: { slotKey: string; screenState: string }) {
    this.db
      .prepare(
        `
        INSERT INTO terminal_snapshots (slot_key, screen_state, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(slot_key) DO UPDATE SET
          screen_state = excluded.screen_state,
          updated_at = excluded.updated_at
      `,
      )
      .run(args.slotKey, args.screenState, new Date().toISOString());
  }

  loadTerminalSnapshot(args: { slotKey: string }) {
    return this.db
      .prepare(
        "SELECT screen_state, updated_at FROM terminal_snapshots WHERE slot_key = ?",
      )
      .get(args.slotKey) as
      { screen_state: string; updated_at: string } | undefined;
  }

  deleteTerminalSnapshot(args: { slotKey: string }) {
    this.db
      .prepare("DELETE FROM terminal_snapshots WHERE slot_key = ?")
      .run(args.slotKey);
  }

  upsertWorkspace(args: {
    id: string;
    name: string;
    snapshot: PersistenceWorkspaceSnapshot;
  }) {
    const now = new Date().toISOString();
    const nextWorkspaceShellArtifactId = `workspace-shell-${randomUUID()}`;
    const previousPayloadEntry = this.readWorkspacePayload({
      workspaceId: args.id,
    });
    const previousWorkspaceShellArtifact = previousPayloadEntry
      ? this.getWorkspaceShellArtifactPointer({
          payload: previousPayloadEntry.payload,
        })
      : null;
    const previousWorkspaceShellBodies = previousWorkspaceShellArtifact
      ? readPersistedWorkspaceEditorTabBodies({
          rootDir: this.artifactRootDir,
          artifactRelativePath: previousWorkspaceShellArtifact.relativePath,
        })
      : new Map();
    const tx = this.db.transaction(() => {
      const existingPayloadEntry = previousPayloadEntry;
      const existingWorkspaceShellArtifact = previousWorkspaceShellArtifact;
      const nextTaskIds = new Set(args.snapshot.tasks.map((task) => task.id));
      const providedTaskIds = new Set(
        Object.keys(args.snapshot.messagesByTask).filter((taskId) =>
          nextTaskIds.has(taskId),
        ),
      );
      const preservedLegacyTaskIds =
        existingPayloadEntry && "messagesByTask" in existingPayloadEntry.payload
          ? args.snapshot.tasks
              .map((task) => task.id)
              .filter(
                (taskId) =>
                  !providedTaskIds.has(taskId) &&
                  taskId in
                    (
                      existingPayloadEntry.payload as PersistenceWorkspaceSnapshot
                    ).messagesByTask,
              )
          : [];

      for (const task of args.snapshot.tasks) {
        const persistedTaskRowId = `${args.id}:${task.id}`;
        this.db
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

      const countRows = this.db
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

      this.db
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
      this.db
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

    tx();
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
    /** Host-owned task row. `archivedAt` is always taken from disk. */
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
    const payloadEntry = this.readWorkspacePayload({
      workspaceId: args.workspaceId,
    });
    if (!payloadEntry) {
      return { ok: false, messageCount: 0 };
    }
    // A legacy snapshot payload still carries inline messages; converting it is
    // `upsertWorkspace`'s job, so let the caller fall back rather than doing a
    // partial migration here.
    if ("messagesByTask" in payloadEntry.payload) {
      return { ok: false, messageCount: 0 };
    }
    const payload = payloadEntry.payload as PersistedWorkspaceShellPayload;
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      if (args.task) {
        const persistedTaskRowId = `${args.workspaceId}:${args.task.id}`;
        // Archival is renderer-owned: never let a host write revive a task the
        // user just archived. Read the authoritative value for this one task
        // instead of listing the whole workspace.
        const persistedArchivedAt = (
          this.db
            .prepare("SELECT archived_at FROM tasks WHERE id = ?")
            .get(persistedTaskRowId) as { archived_at: string | null } | undefined
        )?.archived_at;
        const archivedAt =
          persistedArchivedAt === undefined
            ? (args.task.archivedAt ?? null)
            : persistedArchivedAt;
        this.db
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
            args.workspaceId,
            args.task.title,
            args.task.provider,
            args.task.updatedAt,
            args.task.unread ? 1 : 0,
            archivedAt,
          );
      }

      if (args.messages && args.messages.length > 0) {
        this.insertTaskMessages({
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          messages: args.messages,
        });
      }

      // Per-task count only.
      const messageCount = Number(
        (
          this.db
            .prepare(
              "SELECT COUNT(*) AS count FROM messages WHERE workspace_id = ? AND task_id = ?",
            )
            .get(args.workspaceId, args.taskId) as { count: number }
        ).count,
      );

      const nextPayload = mergeTaskTurnDeltaPayload({
        payload,
        taskId: args.taskId,
        ...(args.task ? { task: args.task } : {}),
        ...(args.activeTaskId ? { activeTaskId: args.activeTaskId } : {}),
        ...(args.providerSession
          ? { providerSession: args.providerSession }
          : {}),
        messageCount,
      });

      // `editorTabs` and its artifact pointers are copied through untouched, so
      // no artifact is rewritten and no editor body is re-serialized.
      this.db
        .prepare(
          `
        UPDATE workspaces
        SET name = COALESCE(?, name), updated_at = ?, snapshot_json = ?
        WHERE id = ?
      `,
        )
        .run(
          args.workspaceName ?? null,
          now,
          JSON.stringify(nextPayload),
          args.workspaceId,
        );

      const shellForMeta = toWorkspaceShellMetaSource(nextPayload);
      this.db
        .prepare(
          `
        UPDATE workspace_meta
        SET name = COALESCE(?, name),
            updated_at = ?,
            shell_lite_json = ?,
            shell_summary_json = ?
        WHERE id = ?
      `,
        )
        .run(
          args.workspaceName ?? null,
          now,
          JSON.stringify(
            this.createWorkspaceShellLite({
              shell: shellForMeta as never,
            }),
          ),
          JSON.stringify(
            this.createWorkspaceShellSummary({
              shell: shellForMeta as never,
            }),
          ),
          args.workspaceId,
        );

      return messageCount;
    });

    const messageCount = tx();
    return { ok: true, messageCount };
  }

  removeTaskFromWorkspace(args: { workspaceId: string; taskId: string }) {
    const existingPayloadEntry = this.readWorkspacePayload({
      workspaceId: args.workspaceId,
    });
    const existingWorkspaceShellArtifact = existingPayloadEntry
      ? this.getWorkspaceShellArtifactPointer({
          payload: existingPayloadEntry.payload,
        })
      : null;
    const tx = this.db.transaction(() => {
      const persistedTaskRowId = `${args.workspaceId}:${args.taskId}`;
      this.db
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
      this.db
        .prepare(
          `
        DELETE FROM turns
        WHERE workspace_id = ? AND task_id = ?
      `,
        )
        .run(args.workspaceId, args.taskId);
      this.db
        .prepare("DELETE FROM messages WHERE workspace_id = ? AND task_id = ?")
        .run(args.workspaceId, args.taskId);
      this.db
        .prepare("DELETE FROM tasks WHERE id = ? AND workspace_id = ?")
        .run(persistedTaskRowId, args.workspaceId);

      const payloadEntry = this.readWorkspacePayload({
        workspaceId: args.workspaceId,
      });
      if (!payloadEntry) {
        return;
      }
      const shell = this.toWorkspaceShell({ payload: payloadEntry.payload });
      const nextTasks = shell.tasks.filter((task) => task.id !== args.taskId);
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
      const preparedShell = this.preparePersistedWorkspaceShell({
        shell: nextShell,
        updatedAt: new Date().toISOString(),
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

      this.db
        .prepare(
          `
        UPDATE workspaces
        SET snapshot_json = ?, updated_at = ?
        WHERE id = ?
      `,
        )
        .run(
          JSON.stringify(preparedShell.persistedShellPayload),
          new Date().toISOString(),
          args.workspaceId,
        );
      this.db
        .prepare(
          `
        UPDATE workspace_meta
        SET updated_at = ?, shell_lite_json = ?, shell_summary_json = ?
        WHERE id = ?
      `,
        )
        .run(
          new Date().toISOString(),
          preparedShell.shellLiteJson,
          preparedShell.shellSummaryJson,
          args.workspaceId,
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

    tx();
    this.removeArtifactFiles({
      relativePaths: [
        ...(existingWorkspaceShellArtifact
          ? [existingWorkspaceShellArtifact.relativePath]
          : []),
      ],
    });
  }

  closeWorkspace(args: { workspaceId: string }) {
    const payloadEntry = this.readWorkspacePayload({
      workspaceId: args.workspaceId,
    });
    const workspaceShellArtifact = payloadEntry
      ? this.getWorkspaceShellArtifactPointer({ payload: payloadEntry.payload })
      : null;
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `
        DELETE FROM turn_events
        WHERE turn_id IN (SELECT id FROM turns WHERE workspace_id = ?)
      `,
        )
        .run(args.workspaceId);
      if (workspaceShellArtifact) {
        this.deleteArtifactRows({
          artifactIds: [workspaceShellArtifact.id],
        });
      }
      this.db
        .prepare("DELETE FROM turns WHERE workspace_id = ?")
        .run(args.workspaceId);
      this.db
        .prepare("DELETE FROM messages WHERE workspace_id = ?")
        .run(args.workspaceId);
      this.db
        .prepare("DELETE FROM tasks WHERE workspace_id = ?")
        .run(args.workspaceId);
      this.db
        .prepare("DELETE FROM workspaces WHERE id = ?")
        .run(args.workspaceId);
      this.db
        .prepare("DELETE FROM workspace_meta WHERE id = ?")
        .run(args.workspaceId);
    });
    tx();
    this.removeArtifactFiles({
      relativePaths: [
        ...(workspaceShellArtifact
          ? [workspaceShellArtifact.relativePath]
          : []),
      ],
    });
  }

  beginTurn(args: {
    id: string;
    workspaceId: string;
    taskId: string;
    providerId: ProviderId;
    createdAt?: string;
  }) {
    const createdAt = args.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO turns (id, workspace_id, task_id, provider_id, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `,
      )
      .run(args.id, args.workspaceId, args.taskId, args.providerId, createdAt);
  }

  completeTurn(args: {
    id: string;
    completedAt?: string;
    usage?: PersistenceTurnUsage | null;
  }) {
    if (this._closed) {
      return;
    }
    const completedAt = args.completedAt ?? new Date().toISOString();
    // A turn that reported no usage keeps whatever was already stored rather
    // than clearing it, so a late completion cannot erase a real measurement.
    const usageJson = args.usage ? JSON.stringify(args.usage) : null;
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          usageJson
            ? `
        UPDATE turns
        SET completed_at = ?, usage_json = ?
        WHERE id = ?
      `
            : `
        UPDATE turns
        SET completed_at = ?
        WHERE id = ?
      `,
        )
        .run(
          ...(usageJson
            ? [completedAt, usageJson, args.id]
            : [completedAt, args.id]),
        );
      this.compactCompletedTurnEvents(args.id);
    });
    tx();
  }

  /**
   * Closes a turn only when it is still open, reporting whether it did.
   *
   * The task supervisor's boot sweep needs this: a turn a heartbeat started
   * before Stave was killed stays `completed_at IS NULL` forever, and every
   * later occurrence would defer behind it. Unlike `completeTurn` this never
   * rewrites the timestamp of a turn that really did finish.
   */
  completeInterruptedTurn(args: { id: string; completedAt?: string }) {
    if (this._closed) {
      return false;
    }
    const completedAt = args.completedAt ?? new Date().toISOString();
    let closed = false;
    const tx = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `
        UPDATE turns
        SET completed_at = ?
        WHERE id = ? AND completed_at IS NULL
      `,
        )
        .run(completedAt, args.id);
      closed = Number(result.changes ?? 0) > 0;
      if (closed) {
        this.compactCompletedTurnEvents(args.id);
      }
    });
    tx();
    return closed;
  }

  private compactCompletedTurnEvents(turnId: string) {
    this.db
      .prepare(
        `
      DELETE FROM turn_events
      WHERE rowid IN (
        SELECT rowid
        FROM turn_events
        WHERE turn_id = ?
          AND event_type NOT IN (
            'error',
            'done',
            'provider_turn',
            'provider_session',
            'goal_status',
            'plan_ready'
          )
        LIMIT ?
      )
    `,
      )
      .run(turnId, PERSISTENCE_COMPACTION_BATCH_SIZE);
  }

  private pruneActiveTurnEvents(turnId: string) {
    this.db
      .prepare(
        `
      DELETE FROM turn_events
      WHERE rowid IN (
        SELECT rowid
        FROM turn_events
        WHERE turn_id = ?
          AND event_type NOT IN (
            'error',
            'done',
            'provider_turn',
            'provider_session',
            'goal_status',
            'plan_ready'
          )
          AND sequence <= COALESCE((
            SELECT sequence
            FROM turn_events
            WHERE turn_id = ?
              AND event_type NOT IN (
                'error',
                'done',
                'provider_turn',
                'provider_session',
                'goal_status',
                'plan_ready'
              )
            ORDER BY sequence DESC
            LIMIT 1 OFFSET ?
          ), -1)
        LIMIT ?
      )
    `,
      )
      .run(
        turnId,
        turnId,
        MAX_ACTIVE_TURN_EVENTS,
        PERSISTENCE_COMPACTION_BATCH_SIZE,
      );
  }

  /**
   * W1 Phase 0 — persist a single streamed turn event. Idempotent on
   * (turn_id, sequence): replaying the same event is a no-op, so replay/resume
   * paths can safely re-save. Oversized payloads are bounded by
   * `prepareTurnEventPayload`.
   */
  saveStreamEvent(args: {
    turnId: string;
    sequence: number;
    event: BridgeEvent;
    createdAt?: string;
  }) {
    if (this._closed) {
      return;
    }
    this.insertTurnEventRow(args);
    this.pruneActiveTurnEvents(args.turnId);
  }

  /**
   * Batch variant for the streaming hot path — persists a buffered run of events
   * in one transaction to keep per-event write cost off the provider stream.
   */
  saveStreamEvents(args: {
    turnId: string;
    events: Array<{ sequence: number; event: BridgeEvent }>;
    createdAt?: string;
  }) {
    if (this._closed || args.events.length === 0) {
      return;
    }
    const tx = this.db.transaction(
      (events: Array<{ sequence: number; event: BridgeEvent }>) => {
        for (const item of events) {
          this.insertTurnEventRow({
            turnId: args.turnId,
            sequence: item.sequence,
            event: item.event,
            createdAt: args.createdAt,
          });
        }
        this.pruneActiveTurnEvents(args.turnId);
      },
    );
    tx(args.events);
  }

  private insertTurnEventRow(args: {
    turnId: string;
    sequence: number;
    event: BridgeEvent;
    createdAt?: string;
  }) {
    const createdAt = args.createdAt ?? new Date().toISOString();
    const prepared = prepareTurnEventPayload(args.event);
    this.db
      .prepare(
        `
      INSERT OR IGNORE INTO turn_events (id, turn_id, sequence, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        `${args.turnId}-${args.sequence}`,
        args.turnId,
        args.sequence,
        prepared.eventType,
        prepared.payloadJson,
        createdAt,
      );
  }

  /**
   * W1 Phase 0 — read persisted turn events in sequence order, optionally only
   * those after `sinceSequence` (for resume/replay). Truncated payloads come
   * back with `event: null` and `truncated: true`.
   */
  getStreamEvents(args: {
    turnId: string;
    sinceSequence?: number;
  }): PersistedTurnStreamEvent[] {
    const sinceSequence = args.sinceSequence ?? 0;
    const rows = this.db
      .prepare(
        `
      SELECT sequence, event_type, payload_json
      FROM turn_events
      WHERE turn_id = ? AND sequence > ?
      ORDER BY sequence ASC
    `,
      )
      .all(args.turnId, sinceSequence) as Array<{
      sequence: number;
      event_type: string;
      payload_json: string;
    }>;

    return rows.map((row) => {
      const parsed = parseTurnEventPayload(row.payload_json);
      return {
        sequence: row.sequence,
        eventType: row.event_type,
        event: parsed.event,
        truncated: parsed.truncated,
      };
    });
  }

  listTurns(args: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    turnId?: string;
  }): PersistenceTurnSummary[] {
    const turnId = args.turnId?.trim() || null;
    const limit = turnId ? 1 : Math.max(1, Math.min(20, args.limit ?? 5));
    const rows = this.db
      .prepare(
        `
      SELECT
        turns.id,
        turns.workspace_id,
        turns.task_id,
        turns.provider_id,
        turns.created_at,
        turns.completed_at,
        turns.usage_json
      FROM turns
      WHERE turns.workspace_id = ? AND turns.task_id = ?
        ${turnId ? "AND turns.id = ?" : ""}
      ORDER BY turns.created_at DESC
      LIMIT ?
    `,
      )
      .all(
        ...(turnId
          ? [args.workspaceId, args.taskId, turnId, limit]
          : [args.workspaceId, args.taskId, limit]),
      ) as TurnSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      taskId: row.task_id,
      providerId: normalizePersistedProviderId(row.provider_id),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      usage: parsePersistedTurnUsage(row.usage_json),
    }));
  }

  listActiveTurnsForWorkspace(args: {
    workspaceId: string;
    limit?: number;
  }): PersistenceTurnSummary[] {
    const limit = Math.max(1, Math.min(500, args.limit ?? 200));
    const rows = this.db
      .prepare(
        `
      SELECT id, workspace_id, task_id, provider_id, created_at, completed_at, usage_json
      FROM (
        SELECT
          turns.id,
          turns.workspace_id,
          turns.task_id,
          turns.provider_id,
          turns.created_at,
          turns.completed_at,
          turns.usage_json,
          ROW_NUMBER() OVER (
            PARTITION BY turns.task_id
            ORDER BY turns.created_at DESC, turns.id DESC
          ) AS active_turn_rank
        FROM turns
        WHERE turns.workspace_id = ? AND turns.completed_at IS NULL
      ) active_turns
      WHERE active_turn_rank = 1
      ORDER BY created_at DESC
      LIMIT ?
    `,
      )
      .all(args.workspaceId, limit) as TurnSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      taskId: row.task_id,
      providerId: normalizePersistedProviderId(row.provider_id),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      usage: parsePersistedTurnUsage(row.usage_json),
    }));
  }

  listLatestTurnsForWorkspace(args: {
    workspaceId: string;
    limit?: number;
  }): PersistenceTurnSummary[] {
    const limit = Math.max(1, Math.min(500, args.limit ?? 200));
    const rows = this.db
      .prepare(
        `
      SELECT id, workspace_id, task_id, provider_id, created_at, completed_at, usage_json
      FROM (
        SELECT
          turns.id,
          turns.workspace_id,
          turns.task_id,
          turns.provider_id,
          turns.created_at,
          turns.completed_at,
          turns.usage_json,
          ROW_NUMBER() OVER (
            PARTITION BY turns.task_id
            ORDER BY turns.created_at DESC, turns.id DESC
          ) AS workspace_turn_rank
        FROM turns
        WHERE turns.workspace_id = ?
      ) latest_turns
      WHERE workspace_turn_rank = 1
      ORDER BY created_at DESC
      LIMIT ?
    `,
      )
      .all(args.workspaceId, limit) as TurnSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      taskId: row.task_id,
      providerId: normalizePersistedProviderId(row.provider_id),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      usage: parsePersistedTurnUsage(row.usage_json),
    }));
  }

  getCraneJobBinding(jobId: string) {
    return this.craneJobBindings.get(jobId);
  }

  listActiveCraneJobBindings(connectorId: string) {
    return this.craneJobBindings.listActive(connectorId);
  }

  upsertCraneJobBinding(binding: LocalCraneJobBinding) {
    return this.craneJobBindings.upsert(binding);
  }

  pruneCraneJobBindings(cutoff: string) {
    return this.craneJobBindings.pruneTerminalBefore(cutoff);
  }

  replaceTrackerSourceTasks(
    source: TrackerSourceId,
    tasks: TrackerTask[],
    fetchedAt: string,
  ) {
    return this.trackerTasks.replaceSourceTasks(source, tasks, fetchedAt);
  }

  listTrackerSourceTasks(source?: TrackerSourceId) {
    return this.trackerTasks.listSourceTasks(source);
  }

  getTrackerTask(source: TrackerSourceId, taskRef: string) {
    return this.trackerTasks.getTask(source, taskRef);
  }

  countUnreadableTrackerTaskRows() {
    return this.trackerTasks.getUnreadableTaskRowCount();
  }

  upsertTrackerTaskKickoff(link: TrackerTaskStaveLink) {
    return this.trackerTasks.upsertKickoff(link);
  }

  listTrackerTaskKickoffs(args?: {
    source?: TrackerSourceId;
    taskRefs?: string[];
  }) {
    return this.trackerTasks.listKickoffs(args);
  }

  findTrackerTaskKickoffByCraneJobId(craneJobId: string) {
    return this.trackerTasks.findKickoffByCraneJobId(craneJobId);
  }

  findTrackerTaskKickoffByStaveTask(taskId: string) {
    return this.trackerTasks.findKickoffByStaveTask(taskId);
  }

  findLatestTrackerTaskKickoff(source: TrackerSourceId, taskRef: string) {
    return this.trackerTasks.findLatestKickoffForTask(source, taskRef);
  }

  pruneTrackerTaskKickoffs(cutoff: string) {
    return this.trackerTasks.pruneKickoffsBefore(cutoff);
  }

  enqueueMartinOutboxEntry(input: {
    workspaceId: string;
    projectRef: string;
    kind: "event";
    payloadJson: string;
    now: string;
  }) {
    return this.martinSyncOutbox.enqueue(input);
  }

  upsertMartinLinksMergeEntry(input: {
    workspaceId: string;
    projectRef: string;
    payloadJson: string;
    nextAttemptAt: string;
    now: string;
  }) {
    return this.martinSyncOutbox.upsertLinksMerge(input);
  }

  listDueMartinOutboxEntries(args: {
    now: string;
    limit: number;
  }): MartinOutboxEntry[] {
    return this.martinSyncOutbox.listDue(args);
  }

  markMartinOutboxDelivered(id: string, deliveredAt: string) {
    this.martinSyncOutbox.markDelivered(id, deliveredAt);
  }

  markMartinOutboxRetry(id: string, attempts: number, nextAttemptAt: string) {
    this.martinSyncOutbox.markRetry(id, attempts, nextAttemptAt);
  }

  markMartinOutboxFailed(id: string) {
    this.martinSyncOutbox.markFailed(id);
  }

  setMartinOutboxWorkspaceHeld(
    workspaceId: string,
    held: boolean,
    projectRef?: string,
  ) {
    return this.martinSyncOutbox.setWorkspaceHeld(
      workspaceId,
      held,
      projectRef,
    );
  }

  discardMartinOutboxWorkspaceEntries(args: {
    workspaceId: string;
    projectRef?: string;
    exceptProjectRef?: string;
  }) {
    return this.martinSyncOutbox.discardWorkspaceEntries(args);
  }

  retryFailedMartinOutboxEntries() {
    return this.martinSyncOutbox.retryFailed();
  }

  countMartinOutbox() {
    return this.martinSyncOutbox.counts();
  }

  pruneMartinOutboxDeliveredBefore(cutoff: string) {
    return this.martinSyncOutbox.pruneDeliveredBefore(cutoff);
  }

  listTaskHeartbeats() {
    return this.taskHeartbeats.list();
  }

  listActiveTaskHeartbeats() {
    return this.taskHeartbeats.listActive();
  }

  listTaskHeartbeatsForWorkspace(workspaceId: string) {
    return this.taskHeartbeats.listForWorkspace(workspaceId);
  }

  getTaskHeartbeat(id: string) {
    return this.taskHeartbeats.get(id);
  }

  getTaskHeartbeatByTaskId(taskId: string) {
    return this.taskHeartbeats.getByTaskId(taskId);
  }

  upsertTaskHeartbeat(heartbeat: TaskHeartbeat) {
    return this.taskHeartbeats.upsert(heartbeat);
  }

  removeTaskHeartbeat(id: string) {
    return this.taskHeartbeats.remove(id);
  }

  recordTaskHeartbeatOccurrence(occurrence: TaskHeartbeatOccurrence) {
    return this.taskHeartbeats.recordOccurrence(occurrence);
  }

  listProjectMemories(args: { projectPath: string; includeDeleted?: boolean }) {
    return this.projectMemories.list(args);
  }

  getProjectMemory(id: string) {
    return this.projectMemories.get(id);
  }

  searchProjectMemories(args: { projectPath: string } & import("../../src/lib/project-memory").ProjectMemorySearchOptions) {
    return this.projectMemories.search(args);
  }

  rememberProjectMemory(args: {
    projectPath: string;
    kind: ProjectMemoryKind;
    content: string;
    confidence: number;
    recallMode?: import("../../src/lib/project-memory").ProjectMemoryRecallMode;
    sourceTaskId?: string | null;
    sourceTurnId?: string | null;
  }) {
    return this.projectMemories.remember(args);
  }

  updateProjectMemory(args: {
    id: string;
    projectPath: string;
    recallMode?: import("../../src/lib/project-memory").ProjectMemoryRecallMode;
    kind?: ProjectMemoryKind;
    content?: string;
  }) {
    return this.projectMemories.update(args);
  }

  deleteProjectMemory(id: string) {
    return this.projectMemories.softDelete({ id });
  }

  recallProjectMemories(args: {
    projectPath: string;
    query?: string | null;
    limit?: number;
  }) {
    return this.projectMemories.recall(args);
  }

  attachTaskHeartbeatOccurrenceTurn(args: { id: string; turnId: string }) {
    return this.taskHeartbeats.attachOccurrenceTurn(args);
  }

  listTaskHeartbeatOccurrences(args: { heartbeatId: string; limit?: number }) {
    return this.taskHeartbeats.listOccurrences(args);
  }

  pruneTaskHeartbeatOccurrences(args: { heartbeatId: string; keep?: number }) {
    return this.taskHeartbeats.pruneOccurrences(args);
  }

  getStorageMetrics(): SqliteStorageMetrics {
    const pageSizeBytes = Number(this.db.pragma("page_size", { simple: true }));
    const pageCount = Number(this.db.pragma("page_count", { simple: true }));
    const freePages = Number(
      this.db.pragma("freelist_count", { simple: true }),
    );
    return {
      pageSizeBytes,
      pageCount,
      freePages,
      usedBytes: Math.max(0, pageCount - freePages) * pageSizeBytes,
      fileBytes: pageCount * pageSizeBytes,
      autoVacuum: Number(this.db.pragma("auto_vacuum", { simple: true })),
    };
  }

  /**
   * Rebuild a materially bloated legacy database only after active runtimes
   * have stopped. New databases use incremental auto-vacuum from creation, so
   * the blocking full rebuild is a one-time compatibility migration.
   */
  compactStorageForShutdown(): boolean {
    if (this._closed) {
      return false;
    }
    const metrics = this.getStorageMetrics();
    if (metrics.autoVacuum === 2) {
      this.db.pragma("wal_checkpoint(TRUNCATE)");
      this.db.pragma("incremental_vacuum");
      this.db.pragma("wal_checkpoint(TRUNCATE)");
      return metrics.freePages > 0;
    }

    let availableBytes = 0;
    try {
      const stats = statfsSync(path.dirname(this.dbPath));
      availableBytes = stats.bavail * stats.bsize;
    } catch {
      return false;
    }
    if (!shouldRunFullVacuumMigration({ metrics, availableBytes })) {
      return false;
    }

    try {
      this.db.pragma("wal_checkpoint(TRUNCATE)");
      this.db.pragma("auto_vacuum = INCREMENTAL");
      this.db.exec("VACUUM");
      this.db.pragma("wal_checkpoint(TRUNCATE)");
      return true;
    } catch (error) {
      console.warn("[persistence] shutdown vacuum migration failed", error);
      return false;
    }
  }

  close(options?: { compactStorage?: boolean }) {
    if (this._closed) {
      return;
    }
    if (this.maintenanceStart) {
      clearImmediate(this.maintenanceStart);
      this.maintenanceStart = null;
    }
    if (options?.compactStorage) {
      this.compactStorageForShutdown();
    }
    this._closed = true;
    this.db.close();
  }
}
