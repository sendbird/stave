import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { paneHost } from "@/components/panes/pane-host-controller";
import { useAppStore } from "@/store/app.store";

interface EditorFocusSnapshot {
  workspaceId: string;
  tabId: string | null;
  pendingSelection: unknown;
}

/**
 * Bridges editor open actions into the pane host.
 *
 * The store's editor open/select actions (openFileFromTree, openDiffInEditor,
 * openGitGraph, setActiveEditorTab) update `activeEditorTabId` but never set
 * `activeSurface`, so the pane host's activeSurface effect would not reveal
 * the corresponding Dockview panel. This hook watches the active editor tab
 * and opens/focuses its panel — activating the panel then syncs
 * `activeSurface` back through `setActiveSurfaceFromPane`.
 */
export function useEditorPaneFocus() {
  const [activeWorkspaceId, activeEditorTabId, pendingEditorSelection] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.activeWorkspaceId,
            state.activeEditorTabId,
            state.pendingEditorSelection,
          ] as const,
      ),
    );
  const lastSnapshotRef = useRef<EditorFocusSnapshot | null>(null);

  useEffect(() => {
    const previous = lastSnapshotRef.current;
    lastSnapshotRef.current = {
      workspaceId: activeWorkspaceId,
      tabId: activeEditorTabId,
      pendingSelection: pendingEditorSelection,
    };
    if (!activeEditorTabId) {
      return;
    }
    // Skip the initial mount and workspace switches: those restore persisted
    // state and must not steal focus from the restored active surface.
    if (!previous || previous.workspaceId !== activeWorkspaceId) {
      return;
    }
    const tabChanged = previous.tabId !== activeEditorTabId;
    const selectionRequested =
      pendingEditorSelection != null &&
      pendingEditorSelection !== previous.pendingSelection &&
      pendingEditorSelection.tabId === activeEditorTabId;
    if (!tabChanged && !selectionRequested) {
      return;
    }
    if (tabChanged && !selectionRequested) {
      // Ignore close-fallback activations (the previous tab no longer
      // exists): Dockview already decides what receives focus when a panel
      // is closed.
      const previousTabStillOpen =
        previous.tabId == null ||
        useAppStore
          .getState()
          .editorTabs.some((tab) => tab.id === previous.tabId);
      if (!previousTabStillOpen) {
        return;
      }
    }
    paneHost.openSurface({ kind: "editor", editorTabId: activeEditorTabId });
  }, [activeWorkspaceId, activeEditorTabId, pendingEditorSelection]);
}
