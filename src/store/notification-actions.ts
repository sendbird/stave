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
import type { AppNotification } from "@/lib/notifications/notification.types";
import { buildNotificationExpiresAt } from "@/lib/notifications/notification.types";

interface NotificationSliceState {
  notifications: AppNotification[];
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

export async function markNotificationReadAction(
  deps: NotificationActionDeps & { id: string; resolvedAt?: string },
) {
  const readAt = new Date().toISOString();
  const expiresAt = buildNotificationExpiresAt({
    readAt: deps.resolvedAt ?? readAt,
  });
  deps.set((state) => ({
    notifications: markNotificationReadInList({
      notifications: state.notifications,
      id: deps.id,
      readAt,
      resolvedAt: deps.resolvedAt,
      expiresAt,
    }),
  }));
  try {
    const persisted = await markPersistedNotificationRead({
      id: deps.id,
      readAt,
      resolvedAt: deps.resolvedAt,
    });
    if (!persisted) {
      return;
    }
    deps.set((state) => ({
      notifications: mergeNotificationIntoList({
        notifications: state.notifications,
        notification: persisted,
      }),
    }));
    syncUnreadBadge(deps.get);
  } catch (error) {
    console.error(
      "[notifications] failed to mark notification as read",
      error,
    );
  }
}

export async function markAllNotificationsReadAction(
  deps: NotificationActionDeps,
) {
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
    const notifications = await listPersistedNotifications({ limit: 500 });
    deps.set(() => ({ notifications }));
    await reconcileOrphanedNotificationsAction(deps);
  } catch (error) {
    console.error("[notifications] failed to hydrate notifications", error);
    deps.set(() => ({ notifications: [] }));
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
