import { useEffect } from "react";
import { clearLensTabState } from "@/components/panes/lens-tab-state";
import { shouldCloseLensTabOnSessionClose } from "@/lib/lens/lens-session-close";
import { useAppStore } from "@/store/app.store";

/**
 * Drop Lens tabs whose session has been torn down in the main process.
 *
 * Sessions can end without going through the pane UI — `stave_lens_close_session`
 * with `force: true`, or a workspace dispose. The tab and its Dockview panel
 * would otherwise survive as an empty shell pointed at a page that no longer
 * exists, so the user was left with a Lens pane that could not be revived and
 * did not look closable.
 *
 * **Only a deliberate close takes the tab with it.** A guest that crashed, and a
 * guest reclaimed by the hidden-guest cap, both emit the same event under a tab
 * the user still has open, and `useLensSession` rebuilds them. Closing the tab
 * on those is what turned a page crash into a Lens pane that silently vanished:
 * it also raced the rebuild, so the recovery budget and the "Lens keeps closing"
 * message were unreachable in exactly the case they were written for.
 *
 * This only reacts to sessions belonging to the active workspace: `lensTabs` is
 * per-workspace state, and background workspaces reconcile their own tabs when
 * they are hydrated back in.
 */
export function useLensSessionClosedEvents(): void {
  useEffect(() => {
    const unsubscribe = window.api?.lens?.subscribeSessionClosed?.(
      (payload) => {
        if (!shouldCloseLensTabOnSessionClose(payload.reason)) {
          return;
        }
        const store = useAppStore.getState();
        if (store.activeWorkspaceId !== payload.workspaceId) {
          return;
        }
        if (
          !store.lensTabs.some((tab) => tab.id === payload.lensSessionId)
        ) {
          return;
        }
        clearLensTabState(payload.lensSessionId);
        store.closeLensTab({ lensSessionId: payload.lensSessionId });
      },
    );
    return () => {
      unsubscribe?.();
    };
  }, []);
}
