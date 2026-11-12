import type { AppNotification, AppNotificationCreateInput } from "@/lib/notifications/notification.types";
import { isTarsNotificationKind } from "@/lib/notifications/notification.types";
import { describeTarsNotifications } from "./notifications";
import type { TarsSnapshot } from "./types";

export interface TarsNotificationSyncDeps {
  getSnapshot: () => TarsSnapshot | null;
  getNotifications: () => readonly AppNotification[];
  notificationsReady: () => boolean;
  persist: (notifications: AppNotificationCreateInput[]) => Promise<void>;
  markRead: (args: { id: string; resolvedAt: string }) => Promise<void>;
}

/** Serializes hydration and changes, including a fact disappearing during its insert. */
export function createTarsNotificationSync(deps: TarsNotificationSyncDeps) {
  let active = true;
  let dirty = false;
  let current: Promise<void> | null = null;
  const seen = new Set<string>();
  const reconcile = () => {
    dirty = true;
    if (current) return current;
    current = Promise.resolve().then(async () => {
      while (active && dirty) {
        dirty = false;
        const snapshot = deps.getSnapshot();
        // A failed or unfinished read cannot withdraw a live request.
        if (!snapshot || !deps.notificationsReady()) continue;
        const drafts = describeTarsNotifications(snapshot);
        const live = new Set(drafts.map((notification) => notification.id));
        const notifications = deps.getNotifications();
        const known = new Set(notifications.map((notification) => notification.id));
        for (const id of known) seen.add(id);
        const missing = drafts.filter((notification) => !seen.has(notification.id));
        if (missing.length) {
          await deps.persist(missing);
          for (const row of deps.getNotifications()) seen.add(row.id);
          // Re-read after the asynchronous insert, even without a subscription.
          dirty = true;
          // A failed insert must wait for another change rather than spinning.
          if (missing.some((draft) => !deps.getNotifications().some((row) => row.id === draft.id))) dirty = false;
          continue;
        }
        for (const notification of notifications) {
          if (!active) break;
          if (!isTarsNotificationKind(notification.kind) || notification.resolvedAt || live.has(notification.id)) continue;
          await deps.markRead({ id: notification.id, resolvedAt: new Date().toISOString() });
          dirty = true;
        }
      }
    }).finally(() => { current = null; });
    return current;
  };
  return { reconcile, stop: () => { active = false; } };
}
