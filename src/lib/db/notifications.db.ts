import { z } from "zod";
import type {
  AppNotification,
  AppNotificationAction,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import {
  buildNotificationExpiresAt,
  isNotificationHistoryClearable,
  isNotificationPendingAttention,
  sortNotificationsNewestFirst,
} from "@/lib/notifications/notification.types";

const ProviderIdSchema = z.preprocess(
  (value) => (value === "stave" ? "claude-code" : value),
  z.union([
    z.literal("claude-code"),
    z.literal("codex"),
    z.literal("cursor"),
    z.literal("kiro"),
  ]),
);

const AppNotificationActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("approval"),
      requestId: z.string(),
      messageId: z.string().nullable().optional(),
    })
    .strict(),
]);

const AppNotificationSchema = z
  .object({
    id: z.string(),
    kind: z.union([
      z.literal("task.turn_completed"),
      z.literal("task.turn_failed"),
      z.literal("task.approval_requested"),
      z.literal("task.user_input_requested"),
    ]),
    title: z.string(),
    body: z.string(),
    projectPath: z.string().nullable().optional(),
    projectName: z.string().nullable().optional(),
    workspaceId: z.string().nullable().optional(),
    workspaceName: z.string().nullable().optional(),
    taskId: z.string().nullable().optional(),
    taskTitle: z.string().nullable().optional(),
    turnId: z.string().nullable().optional(),
    providerId: ProviderIdSchema.nullable().optional(),
    action: AppNotificationActionSchema.nullable().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string(),
    readAt: z.string().nullable().optional(),
    resolvedAt: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  })
  .strict();

const AppNotificationCreateInputSchema = z
  .object({
    id: z.string(),
    kind: z.union([
      z.literal("task.turn_completed"),
      z.literal("task.turn_failed"),
      z.literal("task.approval_requested"),
      z.literal("task.user_input_requested"),
    ]),
    title: z.string(),
    body: z.string(),
    projectPath: z.string().nullable().optional(),
    projectName: z.string().nullable().optional(),
    workspaceId: z.string().nullable().optional(),
    workspaceName: z.string().nullable().optional(),
    taskId: z.string().nullable().optional(),
    taskTitle: z.string().nullable().optional(),
    turnId: z.string().nullable().optional(),
    providerId: ProviderIdSchema.nullable().optional(),
    action: AppNotificationActionSchema.nullable().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().optional(),
    readAt: z.string().nullable().optional(),
    resolvedAt: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    dedupeKey: z.string().nullable().optional(),
  })
  .strict();

const FallbackNotificationRowSchema = AppNotificationSchema.extend({
  dedupeKey: z.string().nullable().optional(),
}).strict();

type FallbackNotificationRow = AppNotification & {
  dedupeKey: string | null;
};

interface RequiredPersistenceApi {
  listNotifications: (args?: {
    limit?: number;
    unreadOnly?: boolean;
  }) => Promise<{
    ok: boolean;
    notifications: AppNotification[];
  }>;
  createNotification: (args: {
    notification: AppNotificationCreateInput;
  }) => Promise<{
    ok: boolean;
    inserted: boolean;
    notification: AppNotification | null;
  }>;
  markNotificationRead: (args: {
    id: string;
    readAt?: string;
    resolvedAt?: string;
  }) => Promise<{
    ok: boolean;
    notification: AppNotification | null;
  }>;
  markAllNotificationsRead: (args?: { readAt?: string }) => Promise<{
    ok: boolean;
    count: number;
  }>;
  pruneNotifications?: (args?: { now?: string }) => Promise<{
    ok: boolean;
    count: number;
  }>;
  deleteNotificationsForWorkspaces?: (args: {
    workspaceIds: string[];
  }) => Promise<{
    ok: boolean;
    count: number;
  }>;
  deleteOrphanedNotifications?: () => Promise<{
    ok: boolean;
    count: number;
    workspaceIds: string[];
  }>;
  clearNotificationHistory?: () => Promise<{
    ok: boolean;
    count: number;
  }>;
}

const fallbackStorageKey = "stave:notifications-fallback:v1";
let memoryFallbackRows: FallbackNotificationRow[] = [];

function hasWindow() {
  return typeof window !== "undefined";
}

function normalizeNotificationRecord(payload: unknown): AppNotification | null {
  const parsed = AppNotificationSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return {
    ...parsed.data,
    projectPath: parsed.data.projectPath ?? null,
    projectName: parsed.data.projectName ?? null,
    workspaceId: parsed.data.workspaceId ?? null,
    workspaceName: parsed.data.workspaceName ?? null,
    taskId: parsed.data.taskId ?? null,
    taskTitle: parsed.data.taskTitle ?? null,
    turnId: parsed.data.turnId ?? null,
    providerId: parsed.data.providerId ?? null,
    action: (parsed.data.action ?? null) as AppNotificationAction | null,
    payload: parsed.data.payload ?? {},
    readAt: parsed.data.readAt ?? null,
    resolvedAt: parsed.data.resolvedAt ?? null,
    expiresAt: parsed.data.expiresAt ?? null,
  };
}

function normalizeFallbackRow(
  payload: unknown,
): FallbackNotificationRow | null {
  const parsed = FallbackNotificationRowSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  const readAt = parsed.data.readAt ?? null;
  const pendingAttention = isNotificationPendingAttention({
    kind: parsed.data.kind,
    resolvedAt: parsed.data.resolvedAt,
  });
  const expiresAt = pendingAttention
    ? null
    : (parsed.data.expiresAt ??
      (readAt ? buildNotificationExpiresAt({ readAt }) : null));
  return {
    id: parsed.data.id,
    kind: parsed.data.kind,
    title: parsed.data.title,
    body: parsed.data.body,
    projectPath: parsed.data.projectPath ?? null,
    projectName: parsed.data.projectName ?? null,
    workspaceId: parsed.data.workspaceId ?? null,
    workspaceName: parsed.data.workspaceName ?? null,
    taskId: parsed.data.taskId ?? null,
    taskTitle: parsed.data.taskTitle ?? null,
    turnId: parsed.data.turnId ?? null,
    providerId: parsed.data.providerId ?? null,
    action: (parsed.data.action ?? null) as AppNotificationAction | null,
    payload: parsed.data.payload ?? {},
    createdAt: parsed.data.createdAt,
    readAt,
    resolvedAt: parsed.data.resolvedAt ?? null,
    expiresAt,
    dedupeKey: parsed.data.dedupeKey ?? null,
  };
}

function toFallbackRow(
  input: AppNotificationCreateInput,
): FallbackNotificationRow {
  const pendingAttention = isNotificationPendingAttention({
    kind: input.kind,
    resolvedAt: input.resolvedAt,
  });
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    projectPath: input.projectPath ?? null,
    projectName: input.projectName ?? null,
    workspaceId: input.workspaceId ?? null,
    workspaceName: input.workspaceName ?? null,
    taskId: input.taskId ?? null,
    taskTitle: input.taskTitle ?? null,
    turnId: input.turnId ?? null,
    providerId: input.providerId ?? null,
    action: input.action ?? null,
    payload: input.payload ?? {},
    createdAt: input.createdAt ?? new Date().toISOString(),
    readAt: input.readAt ?? null,
    resolvedAt: input.resolvedAt ?? null,
    expiresAt: pendingAttention
      ? null
      : (input.expiresAt ??
        (input.readAt
          ? buildNotificationExpiresAt({ readAt: input.readAt })
          : null)),
    dedupeKey: input.dedupeKey ?? null,
  };
}

function normalizeCreateInput(
  input: z.infer<typeof AppNotificationCreateInputSchema>,
): AppNotificationCreateInput {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    projectPath: input.projectPath ?? null,
    projectName: input.projectName ?? null,
    workspaceId: input.workspaceId ?? null,
    workspaceName: input.workspaceName ?? null,
    taskId: input.taskId ?? null,
    taskTitle: input.taskTitle ?? null,
    turnId: input.turnId ?? null,
    providerId: input.providerId ?? null,
    action: (input.action ?? null) as AppNotificationAction | null,
    payload: input.payload ?? {},
    createdAt: input.createdAt,
    readAt: input.readAt ?? null,
    resolvedAt: input.resolvedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    dedupeKey: input.dedupeKey ?? null,
  };
}

function toPublicNotification(row: FallbackNotificationRow): AppNotification {
  const { dedupeKey: _dedupeKey, ...notification } = row;
  return notification;
}

function loadFallbackRows() {
  if (!hasWindow()) {
    return memoryFallbackRows;
  }
  try {
    const raw = window.localStorage.getItem(fallbackStorageKey);
    if (!raw) {
      return memoryFallbackRows;
    }
    const parsed = JSON.parse(raw) as unknown[];
    const rows = Array.isArray(parsed)
      ? parsed
          .map(normalizeFallbackRow)
          .filter((row): row is FallbackNotificationRow => Boolean(row))
      : memoryFallbackRows;
    memoryFallbackRows = rows;
    return rows;
  } catch {
    return memoryFallbackRows;
  }
}

function saveFallbackRows(rows: FallbackNotificationRow[]) {
  memoryFallbackRows = rows;
  if (!hasWindow()) {
    return;
  }
  try {
    window.localStorage.setItem(fallbackStorageKey, JSON.stringify(rows));
  } catch {
    // Ignore localStorage quota/runtime errors.
  }
}

function isPendingAttentionNotification(
  notification: Pick<AppNotification, "kind" | "resolvedAt">,
) {
  return isNotificationPendingAttention(notification);
}

function pruneFallbackRows(now: string) {
  const rows = loadFallbackRows();
  const nextRows = rows.filter(
    (row) =>
      isNotificationPendingAttention(row) ||
      !row.expiresAt ||
      row.expiresAt > now,
  );
  if (nextRows.length !== rows.length) {
    saveFallbackRows(nextRows);
  }
  return {
    count: rows.length - nextRows.length,
    rows: nextRows,
  };
}

function getPersistenceApi() {
  const api = window.api?.persistence;
  if (
    !api?.listNotifications ||
    !api.createNotification ||
    !api.markNotificationRead ||
    !api.markAllNotificationsRead
  ) {
    return null;
  }
  return api as RequiredPersistenceApi;
}

export async function listNotifications(args?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<AppNotification[]> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const notifications = loadFallbackRows()
      .map(toPublicNotification)
      .filter((notification) => !args?.unreadOnly || !notification.readAt);
    const sorted = sortNotificationsNewestFirst(notifications);
    const pending = sorted.filter(isPendingAttentionNotification);
    const regular = sorted
      .filter((notification) => !isPendingAttentionNotification(notification))
      .slice(0, Math.max(1, args?.limit ?? 100));
    return sortNotificationsNewestFirst([...pending, ...regular]);
  }

  const response = await persistence.listNotifications(args);
  if (!response.ok) {
    throw new Error("Failed to list notifications from persistence bridge.");
  }

  const notifications = response.notifications
    .map(normalizeNotificationRecord)
    .filter((notification): notification is AppNotification =>
      Boolean(notification),
    );
  return sortNotificationsNewestFirst(notifications);
}

export async function createNotification(args: {
  notification: AppNotificationCreateInput;
}): Promise<{ inserted: boolean; notification: AppNotification | null }> {
  const parsedInput = AppNotificationCreateInputSchema.safeParse(
    args.notification,
  );
  if (!parsedInput.success) {
    throw new Error("Invalid notification payload.");
  }
  const normalizedInput = normalizeCreateInput(parsedInput.data);

  const persistence = getPersistenceApi();
  if (!persistence) {
    const candidate = toFallbackRow(normalizedInput);
    const rows = loadFallbackRows();
    const existing = candidate.dedupeKey
      ? (rows.find((row) => row.dedupeKey === candidate.dedupeKey) ?? null)
      : null;
    if (existing) {
      return { inserted: false, notification: toPublicNotification(existing) };
    }
    const nextRows = sortNotificationsNewestFirst([candidate, ...rows]);
    saveFallbackRows(nextRows);
    return { inserted: true, notification: toPublicNotification(candidate) };
  }

  const response = await persistence.createNotification({
    notification: normalizedInput,
  });
  if (!response.ok) {
    throw new Error("Failed to create notification.");
  }
  return {
    inserted: response.inserted,
    notification: response.notification
      ? normalizeNotificationRecord(response.notification)
      : null,
  };
}

export async function markNotificationRead(args: {
  id: string;
  readAt?: string;
  resolvedAt?: string;
}): Promise<AppNotification | null> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const rows = loadFallbackRows();
    const requestedReadAt = args.readAt ?? new Date().toISOString();
    let nextNotification: AppNotification | null = null;
    const nextRows = rows.map((row) => {
      if (row.id !== args.id) {
        return row;
      }
      const readAt = row.readAt ?? requestedReadAt;
      const resolvedAt = row.resolvedAt ?? args.resolvedAt ?? null;
      const retentionAnchor = args.resolvedAt ?? readAt;
      const updated = {
        ...row,
        readAt,
        resolvedAt,
        expiresAt: isNotificationPendingAttention({ ...row, resolvedAt })
          ? null
          : (row.expiresAt ??
            buildNotificationExpiresAt({ readAt: retentionAnchor })),
      };
      nextNotification = toPublicNotification(updated);
      return updated;
    });
    saveFallbackRows(nextRows);
    return nextNotification;
  }

  const response = await persistence.markNotificationRead(args);
  if (!response.ok) {
    throw new Error(`Failed to mark notification as read: ${args.id}`);
  }
  return response.notification
    ? normalizeNotificationRecord(response.notification)
    : null;
}

export async function markAllNotificationsRead(args?: {
  readAt?: string;
}): Promise<number> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const readAt = args?.readAt ?? new Date().toISOString();
    const expiresAt = buildNotificationExpiresAt({ readAt });
    let changed = 0;
    const nextRows = loadFallbackRows().map((row) => {
      if (row.readAt) {
        return row;
      }
      changed += 1;
      return {
        ...row,
        readAt,
        expiresAt: isNotificationPendingAttention(row)
          ? null
          : (row.expiresAt ?? expiresAt),
      };
    });
    saveFallbackRows(nextRows);
    return changed;
  }

  const response = await persistence.markAllNotificationsRead(args);
  if (!response.ok) {
    throw new Error("Failed to mark all notifications as read.");
  }
  return response.count;
}

export async function pruneNotifications(args?: {
  now?: string;
}): Promise<number> {
  const now = args?.now ?? new Date().toISOString();
  const persistence = getPersistenceApi();
  if (!persistence?.pruneNotifications) {
    return pruneFallbackRows(now).count;
  }

  const response = await persistence.pruneNotifications({ now });
  if (!response.ok) {
    throw new Error("Failed to prune expired notifications.");
  }
  return response.count;
}

function normalizeWorkspaceIds(workspaceIds: readonly string[]) {
  return Array.from(
    new Set(workspaceIds.map((workspaceId) => workspaceId.trim()).filter(Boolean)),
  );
}

/**
 * Drops every notification owned by the given workspaces. Called when a
 * workspace is archived or its project is removed: the request behind an
 * unresolved attention notification can no longer be answered, and those rows
 * never expire on their own.
 */
export async function deleteNotificationsForWorkspaces(args: {
  workspaceIds: readonly string[];
}): Promise<number> {
  const workspaceIds = normalizeWorkspaceIds(args.workspaceIds);
  if (workspaceIds.length === 0) {
    return 0;
  }

  const persistence = getPersistenceApi();
  if (!persistence?.deleteNotificationsForWorkspaces) {
    const rows = loadFallbackRows();
    const removable = new Set(workspaceIds);
    const nextRows = rows.filter(
      (row) => !row.workspaceId || !removable.has(row.workspaceId),
    );
    saveFallbackRows(nextRows);
    return rows.length - nextRows.length;
  }

  const response = await persistence.deleteNotificationsForWorkspaces({
    workspaceIds,
  });
  if (!response.ok) {
    throw new Error("Failed to delete workspace notifications.");
  }
  return response.count;
}

/**
 * Reconciles leftovers from before workspace-scoped cleanup existed: drops every
 * workspace-scoped notification whose workspace is no longer known. Notifications
 * without a workspace are app-wide and always kept.
 *
 * The main process decides which workspaces are gone, because only it holds the
 * full inventory. The purged workspace ids come back so the caller can prune its
 * in-memory list against the same verdict.
 */
export async function deleteOrphanedNotifications(): Promise<{
  count: number;
  workspaceIds: string[];
}> {
  const persistence = getPersistenceApi();
  if (!persistence?.deleteOrphanedNotifications) {
    // The localStorage fallback has no workspace inventory to compare against,
    // so it cannot tell an orphan from a workspace it simply never saw.
    return { count: 0, workspaceIds: [] };
  }

  const response = await persistence.deleteOrphanedNotifications();
  if (!response.ok) {
    throw new Error("Failed to delete orphaned notifications.");
  }
  return {
    count: response.count,
    workspaceIds: normalizeWorkspaceIds(response.workspaceIds ?? []),
  };
}

export async function clearNotificationHistory(): Promise<number> {
  const persistence = getPersistenceApi();
  if (!persistence?.clearNotificationHistory) {
    const rows = loadFallbackRows();
    const nextRows = rows.filter((row) => !isNotificationHistoryClearable(row));
    saveFallbackRows(nextRows);
    return rows.length - nextRows.length;
  }

  const response = await persistence.clearNotificationHistory();
  if (!response.ok) {
    throw new Error("Failed to clear notification history.");
  }
  return response.count;
}
