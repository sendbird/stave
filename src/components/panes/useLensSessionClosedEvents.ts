import { useEffect } from "react";
import { clearLensTabState } from "@/components/panes/lens-tab-state";
import { useAppStore } from "@/store/app.store";

/**
 * Drop Lens tabs whose native session has been torn down in the main process.
 *
 * Sessions can die without going through the pane UI — `stave_lens_close_session`
 * with `force: true`, `lens:destroy-view`, or a workspace dispose. The tab and
 * its Dockview panel used to survive as an empty shell whose `setVisible` and
 * `setBounds` calls silently no-op, so the user was left with a Lens pane that
 * could not be revived and did not look closable.
 *
 * This only reacts to sessions belonging to the active workspace: `lensTabs` is
 * per-workspace state, and background workspaces reconcile their own tabs when
 * they are hydrated back in.
 */
export function useLensSessionClosedEvents(): void {
  useEffect(() => {
    const unsubscribe = window.api?.lens?.subscribeSessionClosed?.(
      (payload) => {
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
