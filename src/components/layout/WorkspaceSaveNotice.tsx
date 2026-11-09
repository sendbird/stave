import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toastManager } from "@/lib/notifications/toast";
import { useAppStore } from "@/store/app.store";
import { flushPendingSnapshotPersists } from "@/store/workspace-session-state";
import { workspaceSaveStatus } from "@/store/workspace-save-status";
import { useTranslation } from "@/i18n";

/**
 * Stable id so the notice is a single toast that is updated in place. Every
 * re-render of the failure state (each queue retry, each `retrying` flip) would
 * otherwise stack another identical toast in the bottom-right stack.
 */
export const WORKSPACE_SAVE_TOAST_ID = "workspace-save-failure";

/**
 * Surfaces the acknowledged-write-queue failure flag on the shared AUI toast
 * stack (bottom-right, `toastManager` / `ToastHost`) instead of the
 * hand-drawn bottom-left box that used to overlap the sidebar and the composer.
 *
 * Renders nothing itself: the store wiring (the `workspaceSaveStatus` flag and
 * the flush/retry callback) is unchanged, only the surface moved. `timeout: 0`
 * keeps the toast up for as long as the failure persists, and the toast is
 * closed as soon as the queue drains.
 */
export function WorkspaceSaveNotice() {
  const { t } = useTranslation(["workspace", "common"]);
  const failures = useSyncExternalStore(
    workspaceSaveStatus.subscribe,
    workspaceSaveStatus.getSnapshot,
    workspaceSaveStatus.getSnapshot,
  );
  const [retrying, setRetrying] = useState(false);
  // Tracks whether the toast is currently shown, so the effect below
  // adds once and updates thereafter rather than pushing a duplicate.
  const shownRef = useRef(false);

  const retry = useCallback(() => {
    setRetrying(true);
    void (async () => {
      try {
        await useAppStore.getState().flushActiveWorkspaceSnapshot();
        await flushPendingSnapshotPersists();
      } catch {
        // The queue retains failed writes and this notice until saved.
      } finally {
        setRetrying(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!failures) {
      if (shownRef.current) {
        shownRef.current = false;
        toastManager.close(WORKSPACE_SAVE_TOAST_ID);
      }
      return;
    }

    const content = {
      title: t("storeMessages.saveNotice.title"),
      description: t("storeMessages.saveNotice.description"),
      type: "danger",
      priority: "high" as const,
      // Persist while the failure persists; only a successful save (or the
      // user's own dismiss) takes it down.
      timeout: 0,
      actionProps: {
        children: retrying ? t("common:status.saving") : t("storeMessages.saveNotice.retry"),
        disabled: retrying,
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          // Keep the toast up: the failure is still unresolved until the queue
          // drains, and the flag is what dismisses it.
          event.preventDefault();
          retry();
        },
      },
    };

    if (shownRef.current) {
      toastManager.update(WORKSPACE_SAVE_TOAST_ID, content);
      return;
    }
    shownRef.current = true;
    toastManager.add({ id: WORKSPACE_SAVE_TOAST_ID, ...content });
  }, [failures, retry, retrying, t]);

  return null;
}
