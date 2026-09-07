import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { workspaceToastManager } from "@/lib/notifications/toast";
import { useAppStore } from "@/store/app.store";
import { flushPendingSnapshotPersists } from "@/store/workspace-session-state";
import { workspaceSaveStatus } from "@/store/workspace-save-status";

/**
 * Stable id so the notice is a single toast that is updated in place. Every
 * re-render of the failure state (each queue retry, each `retrying` flip) would
 * otherwise stack another identical toast on the bottom-right rail.
 */
export const WORKSPACE_SAVE_TOAST_ID = "workspace-save-failure";

const TITLE = "Some workspace changes could not be saved.";
const DESCRIPTION = "Keep Stave open and retry.";

/**
 * Surfaces the acknowledged-write-queue failure flag on the shared ADS toast
 * rail (bottom-right, `workspaceToastManager` / `ToastHost`) instead of the
 * hand-drawn bottom-left box that used to overlap the sidebar and the composer.
 *
 * Renders nothing itself: the store wiring (the `workspaceSaveStatus` flag and
 * the flush/retry callback) is unchanged, only the surface moved. `timeout: 0`
 * keeps the toast up for as long as the failure persists, and the toast is
 * closed as soon as the queue drains.
 */
export function WorkspaceSaveNotice() {
  const failures = useSyncExternalStore(
    workspaceSaveStatus.subscribe,
    workspaceSaveStatus.getSnapshot,
    workspaceSaveStatus.getSnapshot,
  );
  const [retrying, setRetrying] = useState(false);
  // Tracks whether the toast is currently on the rail, so the effect below
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
        workspaceToastManager.close(WORKSPACE_SAVE_TOAST_ID);
      }
      return;
    }

    const content = {
      title: TITLE,
      description: DESCRIPTION,
      type: "danger",
      priority: "high" as const,
      // Persist while the failure persists; only a successful save (or the
      // user's own dismiss) takes it down.
      timeout: 0,
      actionProps: {
        children: retrying ? "Saving…" : "Retry save",
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
      workspaceToastManager.update(WORKSPACE_SAVE_TOAST_ID, content);
      return;
    }
    shownRef.current = true;
    workspaceToastManager.add({ id: WORKSPACE_SAVE_TOAST_ID, ...content });
  }, [failures, retry, retrying]);

  return null;
}
