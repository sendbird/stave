import type Database from "better-sqlite3";
import type { ProviderId } from "../../src/lib/providers/provider.types";
import {
  MAX_NOTIFICATION_HISTORY,
  buildNotificationExpiresAt,
} from "../../src/lib/notifications/notification.types";
import type {
  PersistenceNotificationCreateInput,
  PersistenceNotificationRecord,
  PersistenceProjectRegistryEntry,
} from "./types";
import { selectOrphanedNotificationWorkspaceIds } from "./notification-orphans";

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

const ORPHAN_NOTIFICATION_DELETE_CHUNK_SIZE = 400;

function normalizeNotificationWorkspaceIds(workspaceIds: string[]) {
  return Array.from(
    new Set(
      workspaceIds.map((workspaceId) => workspaceId.trim()).filter(Boolean),
    ),
  );
}

function normalizeNotificationProviderId(
  providerId: ProviderId | "stave",
): ProviderId {
  return providerId === "stave" ? "claude-code" : providerId;
}

export class NotificationStore {
  constructor(
    private readonly db: Database.Database,
    private readonly loadProjectRegistry: () => PersistenceProjectRegistryEntry[],
  ) {}

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
        ? normalizeNotificationProviderId(row.provider_id)
        : null,
      action: row.action_json ? JSON.parse(row.action_json) : null,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
      readAt: row.read_at,
      resolvedAt: row.resolved_at,
      expiresAt: row.expires_at,
    };
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
      this.trimNotificationHistory();
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

  /**
   * Enforces the retained-history cap. Unresolved attention notifications are
   * never dropped: their request is still answerable, so they stay outside the
   * cap just like they stay outside expiry-based pruning.
   */
  private trimNotificationHistory(limit = MAX_NOTIFICATION_HISTORY): number {
    const maxHistory = Math.max(1, limit);
    const result = this.db
      .prepare(
        `
      DELETE FROM notifications
      WHERE NOT (
          kind IN ('task.approval_requested', 'task.user_input_requested')
          AND resolved_at IS NULL
        )
        AND id NOT IN (
          SELECT id
          FROM notifications
          WHERE NOT (
            kind IN ('task.approval_requested', 'task.user_input_requested')
            AND resolved_at IS NULL
          )
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        )
    `,
      )
      .run(maxHistory);
    return result.changes;
  }

  listNotifications(args?: {
    limit?: number;
    unreadOnly?: boolean;
  }): PersistenceNotificationRecord[] {
    const limit = Math.max(
      1,
      Math.min(
        MAX_NOTIFICATION_HISTORY,
        args?.limit ?? MAX_NOTIFICATION_HISTORY,
      ),
    );
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
    return result.changes + this.trimNotificationHistory();
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

}
