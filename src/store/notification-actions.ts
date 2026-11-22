import {
  clearNotificationHistory as clearPersistedNotificationHistory,
  deleteNotificationsForWorkspaces as deletePersistedWorkspaceNotifications,
  deleteOrphanedNotifications as deletePersistedOrphanedNotifications,
  listNotifications as listPersistedNotifications,
  markAllNotificationsRead as markAllPersistedNotificationsRead,
  markNotificationRead as markPersistedNotificationRead,
  pruneNotifications as prunePersistedNotifications,
} from "@/lib/db/notifications.db";
import {
  clearNotificationHistoryInList,
  getNotificationHistoryClearableIds,
  markAllNotificationsReadInList,
  markNotificationReadInList,
  mergeNotificationIntoList,
  removeNotificationsFromList,
  selectNotificationIdsForWorkspaces,
} from "@/lib/notifications/notification-state";
import type { AppNotification, NotificationsLoad } from "@/lib/notifications/notification.types";
import {
  MAX_NOTIFICATION_HISTORY,
  buildNotificationExpiresAt,
  isNotificationPendingAttention,
} from "@/lib/notifications/notification.types";

interface NotificationSliceState {
  notifications: AppNotification[];
  notificationsLoad: NotificationsLoad;
}

/**
 * Read and retention lifecycle for the notification list. Kept out of the store
 * module so the store only wires these actions up.
 */
export interface NotificationActionDeps {
  set: (
    updater: (state: NotificationSliceState) => Partial<NotificationSliceState>,
  ) => void;
  get: () => NotificationSliceState;
}

function syncUnreadBadge(get: NotificationActionDeps["get"]) {
  void window.api?.notifications?.setBadge?.({
    count: get().notifications.filter((item) => !item.readAt).length,
  });
}

/**
 * Mark-reads of one notification still being saved. When the last of them
 * settles and any failed, the list is set to what was saved: the last record
 * the store returned (or the record before the first write), plus what a
 * successful write without a returned record wrote (read; resolved when it
 * resolved), plus a mark-all made since (read). A record something else
 * replaced meanwhile (a hydration, a host merge) is left alone.
 */
interface MarkReadBatch {
  /** The last record known to be saved: the one before the first write, or one the store returned. */
  before: AppNotification;
  /** Records these writes put in the list; anything else replaced them. */
  own: Set<AppNotification>;
  inFlight: number;
  failed: boolean;
  savedRead: boolean;
  savedResolvedAt: string | null;
  markAllGeneration: number;
}
const markReadBatches = new Map<string, MarkReadBatch>();
let markAllGeneration = 0;

function settleMarkReadBatch(deps: NotificationActionDeps, id: string, batch: MarkReadBatch) {
  markReadBatches.delete(id);
  if (!batch.failed) return;
  const read = batch.savedRead || batch.markAllGeneration !== markAllGeneration;
  deps.set((state) => ({
    notifications: state.notifications.map((item) => {
      if (item.id !== id || !batch.own.has(item)) return item;
      // Nothing of these writes was saved: the record as it was.
      if (!read && !batch.savedResolvedAt) return batch.before;
      const saved = {
        ...item,
        readAt: read ? item.readAt : batch.before.readAt,
        resolvedAt: batch.savedResolvedAt ?? batch.before.resolvedAt,
      };
      const expiresAt = isNotificationPendingAttention(saved)
        ? null
        : saved.readAt
          ? item.expiresAt
          : batch.before.expiresAt;
      return { ...saved, expiresAt };
    }),
  }));
}

/**
 * Marks one notification read (and resolved, when `resolvedAt` is given) at
 * once, then persists it. Resolves to whether this write was saved. When a
 * write fails the list is set back to what was actually saved, so it never
 * shows a state the next load would undo, and a write that did save is kept.
 */
export async function markNotificationReadAction(
  deps: NotificationActionDeps & { id: string; resolvedAt?: string },
): Promise<boolean> {
  const readAt = new Date().toISOString();
  const expiresAt = buildNotificationExpiresAt({
    readAt: deps.resolvedAt ?? readAt,
  });
  const previous = deps.get().notifications.find((item) => item.id === deps.id);
  let batch = markReadBatches.get(deps.id);
  if (!batch && previous) {
    batch = {
      before: previous,
      own: new Set([previous]),
      inFlight: 0,
      failed: false,
      savedRead: false,
      savedResolvedAt: null,
      markAllGeneration,
    };
    markReadBatches.set(deps.id, batch);
  }
  if (batch) batch.inFlight += 1;
  deps.set((state) => ({
    notifications: markNotificationReadInList({
      notifications: state.notifications,
      id: deps.id,
      readAt,
      resolvedAt: deps.resolvedAt,
      expiresAt,
    }),
  }));
  const optimistic = deps.get().notifications.find((item) => item.id === deps.id);
  if (batch && optimistic) batch.own.add(optimistic);
  let saved = false;
  try {
    const persisted = await markPersistedNotificationRead({
      id: deps.id,
      readAt,
      resolvedAt: deps.resolvedAt,
    });
    saved = true;
    if (batch) {
      batch.savedRead = true;
      batch.savedResolvedAt ??= deps.resolvedAt ?? null;
    }
    if (batch && persisted) {
      // What the store returned is what it holds, including changes made
      // elsewhere (another window resolving the request) since this began.
      // The store only ever fills read and resolved, never clears them, so a
      // response that arrives late cannot take back what an earlier one showed.
      batch.before = {
        ...persisted,
        readAt: persisted.readAt ?? batch.before.readAt,
        resolvedAt: persisted.resolvedAt ?? batch.before.resolvedAt,
      };
    }
    if (persisted) {
      deps.set((state) => ({
        notifications: mergeNotificationIntoList({
          notifications: state.notifications,
          notification: persisted,
        }),
      }));
      const merged = deps.get().notifications.find((item) => item.id === deps.id);
      if (batch && merged) batch.own.add(merged);
      syncUnreadBadge(deps.get);
    }
  } catch (error) {
    console.error(
      "[notifications] failed to mark notification as read",
      error,
    );
    if (batch) batch.failed = true;
  } finally {
    if (batch) {
      batch.inFlight -= 1;
      if (batch.inFlight === 0) settleMarkReadBatch(deps, deps.id, batch);
    }
  }
  return saved;
}

export async function markAllNotificationsReadAction(
  deps: NotificationActionDeps,
) {
  markAllGeneration += 1;
  const readAt = new Date().toISOString();
  const expiresAt = buildNotificationExpiresAt({ readAt });
  deps.set((state) => ({
    notifications: markAllNotificationsReadInList({
      notifications: state.notifications,
      readAt,
      expiresAt,
    }),
  }));
  try {
    await markAllPersistedNotificationsRead({ readAt });
    syncUnreadBadge(deps.get);
  } catch (error) {
    console.error(
      "[notifications] failed to mark all notifications as read",
      error,
    );
  }
}

function dropNotificationsFromSlice(
  deps: NotificationActionDeps,
  notificationIds: string[],
) {
  if (notificationIds.length === 0) {
    return;
  }
  const removable = new Set(notificationIds);
  deps.set((state) => ({
    notifications: removeNotificationsFromList({
      notifications: state.notifications,
      notificationIds: removable,
    }),
  }));
}

/**
 * An archived workspace can never answer its pending approvals or questions
 * again, and unresolved attention notifications are exempt from expiry-based
 * pruning. Without this they pile up forever in the Fleet attention count.
 */
export async function purgeWorkspaceNotificationsAction(
  deps: NotificationActionDeps & { workspaceIds: readonly string[] },
) {
  const workspaceIds = [...deps.workspaceIds]
    .map((workspaceId) => workspaceId.trim())
    .filter(Boolean);
  if (workspaceIds.length === 0) {
    return 0;
  }

  dropNotificationsFromSlice(
    deps,
    selectNotificationIdsForWorkspaces({
      notifications: deps.get().notifications,
      workspaceIds,
    }),
  );

  try {
    const count = await deletePersistedWorkspaceNotifications({ workspaceIds });
    syncUnreadBadge(deps.get);
    return count;
  } catch (error) {
    console.error(
      "[notifications] failed to delete notifications for archived workspaces",
      { workspaceIds },
      error,
    );
    return 0;
  }
}

/**
 * Cleans up rows written before workspace-scoped cleanup existed. The persisted
 * sweep is workspace-scoped rather than id-scoped so it also reaches rows beyond
 * the hydration limit.
 *
 * The renderer deliberately does not decide what counts as an orphan. Its
 * inventory is a capped, per-project snapshot that a host-created workspace is
 * missing from, and acting on it deleted live requests. The main process owns
 * the verdict; this only mirrors it into the in-memory list.
 */
export async function reconcileOrphanedNotificationsAction(
  deps: NotificationActionDeps,
) {
  try {
    const { count, workspaceIds } = await deletePersistedOrphanedNotifications();
    if (workspaceIds.length === 0) {
      return count;
    }
    dropNotificationsFromSlice(
      deps,
      selectNotificationIdsForWorkspaces({
        notifications: deps.get().notifications,
        workspaceIds,
      }),
    );
    syncUnreadBadge(deps.get);
    return count;
  } catch (error) {
    console.error(
      "[notifications] failed to reconcile orphaned notifications",
      error,
    );
    return 0;
  }
}

export async function hydrateNotificationsAction(
  deps: NotificationActionDeps,
) {
  try {
    await prunePersistedNotifications();
  } catch (error) {
    console.error(
      "[notifications] failed to prune expired notifications",
      error,
    );
  }
  try {
    const notifications = await listPersistedNotifications({
      limit: MAX_NOTIFICATION_HISTORY,
    });
    deps.set(() => ({ notifications, notificationsLoad: { status: "ready" } }));
    await reconcileOrphanedNotificationsAction(deps);
  } catch (error) {
    console.error("[notifications] failed to hydrate notifications", error);
    // Keep what the inbox shows: an empty list would read as "no notifications".
    deps.set(() => ({ notificationsLoad: { status: "error", message: error instanceof Error ? error.message : String(error) } }));
  }
}

export async function clearNotificationHistoryAction(
  deps: NotificationActionDeps,
) {
  const notificationIds = getNotificationHistoryClearableIds(
    deps.get().notifications,
  );
  try {
    const count = await clearPersistedNotificationHistory();
    deps.set((state) => ({
      notifications: clearNotificationHistoryInList({
        notifications: state.notifications,
        notificationIds,
      }),
    }));
    return count;
  } catch (error) {
    console.error(
      "[notifications] failed to clear notification history",
      error,
    );
    throw error;
  }
}
