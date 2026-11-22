import { createTarsNotificationSync } from "@/lib/tars/notification-sync";
import { persistRendererNotifications } from "./app-store-notification-runtime";
import { useAppStore } from "./app.store";
import { useTarsSnapshotStore } from "./tars-snapshot-store";

/** Both hydration orders and later host changes feed the same serialized reconciliation. */
export function subscribeTarsNotifications() {
  const sync = createTarsNotificationSync({
    getSnapshot: () => useTarsSnapshotStore.getState().snapshot,
    getNotifications: () => useAppStore.getState().notifications,
    notificationsReady: () => useAppStore.getState().notificationsLoad.status === "ready",
    persist: persistRendererNotifications,
    markRead: (args) => useAppStore.getState().markNotificationRead(args),
  });
  const reconcile = () => { void sync.reconcile().catch((error) => console.error("[notifications] Tars reconciliation failed", error)); };
  const offSnapshot = useTarsSnapshotStore.subscribe((state, previous) => {
    if (state.snapshot !== previous.snapshot) reconcile();
  });
  const offNotifications = useAppStore.subscribe((state, previous) => {
    if (state.notifications !== previous.notifications || state.notificationsLoad !== previous.notificationsLoad) reconcile();
  });
  reconcile();
  return () => { sync.stop(); offSnapshot(); offNotifications(); };
}
