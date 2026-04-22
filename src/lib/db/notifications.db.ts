import { z } from "zod";
import type {
  AppNotification,
  AppNotificationAction,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import { sortNotificationsNewestFirst } from "@/lib/notifications/notification.types";

const ProviderIdSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
  z.literal("stave"),
]);

const AppNotificationActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("approval"),
    requestId: z.string(),
    messageId: z.string().nullable().optional(),
  }).strict(),
]);

const AppNotificationSchema = z.object({
  id: z.string(),
  kind: z.union([
    z.literal("task.turn_completed"),
    z.literal("task.approval_requested"),
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
}).strict();

const AppNotificationCreateInputSchema = z.object({
  id: z.string(),
  kind: z.union([
    z.literal("task.turn_completed"),
    z.literal("task.approval_requested"),
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
  dedupeKey: z.string().nullable().optional(),
}).strict();

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
  }) => Promise<{
    ok: boolean;
    notification: AppNotification | null;
  }>;
  markAllNotificationsRead: (args?: {
    readAt?: string;
  }) => Promise<{
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
  };
}

function normalizeFallbackRow(payload: unknown): FallbackNotificationRow | null {
  const parsed = FallbackNotificationRowSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
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
    readAt: parsed.data.readAt ?? null,
    dedupeKey: parsed.data.dedupeKey ?? null,
  };
}

function toFallbackRow(input: AppNotificationCreateInput): FallbackNotificationRow {
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
    dedupeKey: input.dedupeKey ?? null,
  };
}

function toPublicNotification(row: FallbackNotificationRow): AppNotification {
  const {
    dedupeKey: _dedupeKey,
    ...notification
  } = row;
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
      ? parsed.map(normalizeFallbackRow).filter((row): row is FallbackNotificationRow => Boolean(row))
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

function getPersistenceApi() {
  const api = window.api?.persistence;
  if (
    !api?.listNotifications
    || !api.createNotification
    || !api.markNotificationRead
    || !api.markAllNotificationsRead
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
    return sortNotificationsNewestFirst(notifications).slice(0, Math.max(1, args?.limit ?? 100));
  }

  const response = await persistence.listNotifications(args);
  if (!response.ok) {
    throw new Error("Failed to list notifications from persistence bridge.");
  }

  const notifications = response.notifications
    .map(normalizeNotificationRecord)
    .filter((notification): notification is AppNotification => Boolean(notification));
  return sortNotificationsNewestFirst(notifications);
}

export async function createNotification(args: {
  notification: AppNotificationCreateInput;
}): Promise<{ inserted: boolean; notification: AppNotification | null }> {
  const parsedInput = AppNotificationCreateInputSchema.safeParse(args.notification);
  if (!parsedInput.success) {
    throw new Error("Invalid notification payload.");
  }
  const normalizedInput = normalizeCreateInput(parsedInput.data);

  const persistence = getPersistenceApi();
  if (!persistence) {
    const candidate = toFallbackRow(normalizedInput);
    const rows = loadFallbackRows();
    const existing = candidate.dedupeKey
      ? rows.find((row) => row.dedupeKey === candidate.dedupeKey) ?? null
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
    notification: response.notification ? normalizeNotificationRecord(response.notification) : null,
  };
}

export async function markNotificationRead(args: {
  id: string;
  readAt?: string;
}): Promise<AppNotification | null> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const rows = loadFallbackRows();
    let nextNotification: AppNotification | null = null;
    const nextRows = rows.map((row) => {
      if (row.id !== args.id) {
        return row;
      }
      const updated = {
        ...row,
        readAt: row.readAt ?? args.readAt ?? new Date().toISOString(),
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
  return response.notification ? normalizeNotificationRecord(response.notification) : null;
}

export async function markAllNotificationsRead(args?: {
  readAt?: string;
}): Promise<number> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const readAt = args?.readAt ?? new Date().toISOString();
    let changed = 0;
    const nextRows = loadFallbackRows().map((row) => {
      if (row.readAt) {
        return row;
      }
      changed += 1;
      return {
        ...row,
        readAt,
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
