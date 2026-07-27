import {
  clearNotificationHistory as clearPersistedNotificationHistory,
  deleteNotificationsForWorkspaces as deletePersistedWorkspaceNotifications,
  deleteNotificationsOutsideWorkspaces as deletePersistedOrphanedNotifications,
  listNotifications as listPersistedNotifications,
  markAllNotificationsRead as markAllPersistedNotificationsRead,
  markNotificationRead as markPersistedNotificationRead,
  pruneNotifications as prunePersistedNotifications,
} from "@/lib/db/notifications.db";
import { collectKnownWorkspaceIds } from "@/store/project.utils";
import {
  clearNotificationHistoryInList,
  getNotificationHistoryClearableIds,
  markAllNotificationsReadInList,
  markNotificationReadInList,
  mergeNotificationIntoList,
  removeNotificationsFromList,
  selectNotificationIdsForWorkspaces,
  selectOrphanedNotificationIds,
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

/** The workspace inventory needed to tell live notifications from orphaned ones. */
interface NotificationWorkspaceInventory {
  hasHydratedWorkspaces: boolean;
  recentProjects: readonly { workspaces: readonly { id: string }[] }[];
  workspaces: readonly { id: string }[];
}

export interface NotificationHydrationDeps
  extends Omit<NotificationActionDeps, "get"> {
  get: () => NotificationSliceState & NotificationWorkspaceInventory;
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
 */
export async function reconcileOrphanedNotificationsAction(
  deps: NotificationHydrationDeps,
) {
  const state = deps.get();
  // Judging orphans needs a hydrated inventory. Bailing out is the safe default:
  // an empty registry mid-hydration would look like "every workspace is gone".
  if (!state.hasHydratedWorkspaces) {
    return 0;
  }
  const knownWorkspaceIds = collectKnownWorkspaceIds({
    recentProjects: state.recentProjects,
    workspaces: state.workspaces,
  });
  // An empty inventory cannot be told apart from a failed load, and the cost of
  // guessing wrong is deleting live requests. Nothing is reachable in that state
  // anyway, so waiting for the next startup is free.
  if (knownWorkspaceIds.size === 0) {
    return 0;
  }

  dropNotificationsFromSlice(
    deps,
    selectOrphanedNotificationIds({
      notifications: state.notifications,
      knownWorkspaceIds,
    }),
  );

  try {
    const count = await deletePersistedOrphanedNotifications({
      workspaceIds: [...knownWorkspaceIds],
    });
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
  deps: NotificationHydrationDeps,
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
