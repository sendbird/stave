import { clearLensTabState } from "@/components/panes/lens-tab-state";
import {
  closeEditorTabs,
  getEditorTabCloseRequest,
  type EditorBulkClosePlan,
} from "@/components/panes/editor-tab-actions";
import type { PaneSurfaceDescriptor } from "@/lib/panes/types";
import { useAppStore } from "@/store/app.store";

/**
 * Renderer-wide events used by the pane host chrome. CustomEvents keep the
 * tab chip, context menu, and host dialogs decoupled from each other.
 */
export const PANE_RENAME_REQUEST_EVENT = "stave:pane-rename-request";
export const OPEN_TASK_HISTORY_EVENT = "stave:open-task-history";
export const OPEN_TASK_SESSION_IDS_EVENT = "stave:open-task-session-ids";
export const REQUEST_CLOSE_CLI_SESSION_EVENT =
  "stave:request-close-cli-session";
export const REQUEST_CLOSE_EDITOR_TABS_EVENT =
  "stave:request-close-editor-tabs";

export interface EditorTabsCloseRequest {
  tabIds: string[];
  title: string;
  description: string;
}

export function dispatchPaneRenameRequest(args: { panelId: string }) {
  window.dispatchEvent(
    new CustomEvent(PANE_RENAME_REQUEST_EVENT, {
      detail: { panelId: args.panelId },
    }),
  );
}

export interface OpenTaskHistoryRequest {
  /** Workspace whose history to show. Omit to follow the active workspace. */
  workspaceId?: string;
  /** Project the workspace belongs to (needed to restore a task across projects). */
  projectPath?: string;
}

export function dispatchOpenTaskHistory(args?: OpenTaskHistoryRequest) {
  window.dispatchEvent(
    new CustomEvent(OPEN_TASK_HISTORY_EVENT, {
      detail: {
        workspaceId: args?.workspaceId,
        projectPath: args?.projectPath,
      },
    }),
  );
}

export function dispatchOpenTaskSessionIds(args: { taskId: string }) {
  window.dispatchEvent(
    new CustomEvent(OPEN_TASK_SESSION_IDS_EVENT, {
      detail: { taskId: args.taskId },
    }),
  );
}

export function dispatchEditorTabsCloseRequest(
  request: EditorTabsCloseRequest,
) {
  window.dispatchEvent(
    new CustomEvent(REQUEST_CLOSE_EDITOR_TABS_EVENT, { detail: request }),
  );
}

export function requestEditorBulkClose(plan: EditorBulkClosePlan) {
  if (plan.dirtyTabIds.length > 0) {
    dispatchEditorTabsCloseRequest({
      tabIds: plan.tabIds,
      title: plan.title,
      description: plan.description,
    });
    return;
  }
  closeEditorTabs({ tabIds: plan.tabIds });
}

/**
 * Closes a surface honoring per-kind semantics:
 * - task: closes the tab WITHOUT archiving,
 * - cli-session: raises the confirm dialog (process termination is destructive),
 * - lens: tears down the main-process browser session, then the store tab
 *   (hidden panes keep their session alive; only a tab close destroys it),
 * - terminal / editor / compare-run: direct store close.
 */
export function closePaneSurface(surface: PaneSurfaceDescriptor) {
  const store = useAppStore.getState();
  switch (surface.kind) {
    case "task":
      store.closeTaskTab({ taskId: surface.taskId });
      return;
    case "cli-session": {
      const tab = store.cliSessionTabs.find(
        (item) => item.id === surface.cliSessionTabId,
      );
      if (tab) {
        window.dispatchEvent(
          new CustomEvent(REQUEST_CLOSE_CLI_SESSION_EVENT, {
            detail: { id: tab.id, title: tab.title },
          }),
        );
      }
      return;
    }
    case "terminal":
      store.closeTerminalTab({ tabId: surface.terminalTabId });
      return;
    case "lens": {
      const workspaceId = store.activeWorkspaceId;
      if (workspaceId) {
        void window.api?.lens
          ?.closeSession?.({
            workspaceId,
            lensSessionId: surface.lensSessionId,
          })
          .catch(() => {
            // Session teardown is best-effort; the tab closes regardless.
          });
      }
      clearLensTabState(surface.lensSessionId);
      store.closeLensTab({ lensSessionId: surface.lensSessionId });
      return;
    }
    case "editor": {
      const closeRequest = getEditorTabCloseRequest({
        editorTabs: store.editorTabs,
        tabId: surface.editorTabId,
      });
      if (!closeRequest) {
        return;
      }
      if (closeRequest.isDirty) {
        dispatchEditorTabsCloseRequest({
          tabIds: [closeRequest.tabId],
          title: "Close Unsaved File",
          description: `Close "${closeRequest.fileName}" without saving? Your unsaved changes will be lost.`,
        });
        return;
      }
      store.closeEditorTab({ tabId: surface.editorTabId });
      return;
    }
    case "compare-run":
      store.closeCompareRun({ compareRunId: surface.compareRunId });
      return;
  }
}
