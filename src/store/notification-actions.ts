import {
  clearNotificationHistory as clearPersistedNotificationHistory,
  markAllNotificationsRead as markAllPersistedNotificationsRead,
  markNotificationRead as markPersistedNotificationRead,
} from "@/lib/db/notifications.db";
import {
  clearNotificationHistoryInList,
  getNotificationHistoryClearableIds,
  markAllNotificationsReadInList,
  markNotificationReadInList,
  mergeNotificationIntoList,
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
