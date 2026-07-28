import type { StoreApi } from "zustand";
import { parsePanePanelId } from "@/lib/panes/types";
import { isTaskArchived } from "@/lib/tasks";
import type { AppState } from "@/store/app-store.types";
import {
  reduceActiveSurfaceFromPane,
  reduceCloseCompareRun,
  reduceCloseLensTab,
  reduceCloseTaskTab,
  reduceOpenLensTab,
  reducePaneTabMeta,
  resolveCreatedLensSessionId,
} from "@/store/workspace-pane-state";

type PaneActionName =
  | "setActiveSurfaceFromPane"
  | "closeTaskTab"
  | "closeCompareRun"
  | "createLensTab"
  | "openLensTab"
  | "closeLensTab"
  | "setPaneTabMeta"
  | "renamePaneTab"
  | "setDockLayout";

type PaneActions = Pick<AppState, PaneActionName>;
type AppStoreSet = StoreApi<AppState>["setState"];
type AppStoreGet = StoreApi<AppState>["getState"];

function incrementWorkspaceSnapshotVersion(
  state: Pick<AppState, "workspaceSnapshotVersion">,
) {
  return state.workspaceSnapshotVersion + 1;
}

function shouldLoadLatestTaskMessages(args: {
  taskId: string;
  messagesByTask: AppState["messagesByTask"];
  messageCountByTask: AppState["messageCountByTask"];
}) {
  return (
    (args.messagesByTask[args.taskId]?.length ?? 0) === 0 &&
    (args.messageCountByTask[args.taskId] ?? 0) > 0
  );
}

export function createPaneActions(args: {
  set: AppStoreSet;
  get: AppStoreGet;
  loadTaskMessagesIntoSession: (args: {
    workspaceId: string;
    taskId: string;
    mode: "latest" | "older";
  }) => Promise<void>;
}): PaneActions {
  const { set, get, loadTaskMessagesIntoSession } = args;

  return {
    setActiveSurfaceFromPane: (surface) => {
      const stateBefore = get();
      const taskId = surface.kind === "task" ? surface.taskId : "";
      const targetTask = taskId
        ? (stateBefore.tasks.find((task) => task.id === taskId) ?? null)
        : null;
      const workspaceId = taskId
        ? (stateBefore.taskWorkspaceIdById[taskId] ??
          stateBefore.activeWorkspaceId)
        : null;
      const shouldLoadMessages =
        targetTask !== null &&
        !isTaskArchived(targetTask) &&
        shouldLoadLatestTaskMessages({
          taskId,
          messagesByTask: stateBefore.messagesByTask,
          messageCountByTask: stateBefore.messageCountByTask,
        });
      set((state) =>
        reduceActiveSurfaceFromPane({
          state,
          surface,
          nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        }),
      );
      if (workspaceId && shouldLoadMessages) {
        void loadTaskMessagesIntoSession({
          workspaceId,
          taskId,
          mode: "latest",
        });
      }
    },
    closeTaskTab: ({ taskId }) =>
      set((state) =>
        reduceCloseTaskTab({
          state,
          taskId,
          nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        }),
      ),
    closeCompareRun: ({ compareRunId }) =>
      set((state) =>
        reduceCloseCompareRun({
          state,
          compareRunId,
          nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        }),
      ),
    createLensTab: () => {
      const state = get();
      if (!state.activeWorkspaceId) {
        return null;
      }
      return state.openLensTab({
        lensSessionId: resolveCreatedLensSessionId(
          state.lensTabs,
          crypto.randomUUID(),
        ),
      });
    },
    openLensTab: ({ lensSessionId, activate }) => {
      const normalizedLensSessionId = lensSessionId.trim();
      if (!get().activeWorkspaceId || !normalizedLensSessionId) {
        return null;
      }
      set((state) =>
        reduceOpenLensTab({
          state,
          lensSessionId: normalizedLensSessionId,
          activate,
          createdAt: Date.now(),
          nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        }),
      );
      return normalizedLensSessionId;
    },
    closeLensTab: ({ lensSessionId }) =>
      set((state) =>
        reduceCloseLensTab({
          state,
          lensSessionId,
          nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        }),
      ),
    setPaneTabMeta: ({ panelId, meta }) =>
      set((state) =>
        reducePaneTabMeta({
          state,
          panelId,
          meta,
          nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        }),
      ),
    renamePaneTab: ({ panelId, title }) => {
      const surface = parsePanePanelId(panelId);
      const normalizedTitle = title.trim();
      if (!surface || !normalizedTitle) {
        return;
      }
      switch (surface.kind) {
        case "task":
          get().renameTask({
            taskId: surface.taskId,
            title: normalizedTitle,
          });
          return;
        case "cli-session":
          get().renameCliSessionTab({
            tabId: surface.cliSessionTabId,
            title: normalizedTitle,
          });
          return;
        case "terminal":
          get().renameTerminalTab({
            tabId: surface.terminalTabId,
            title: normalizedTitle,
          });
          return;
        default:
          get().setPaneTabMeta({
            panelId,
            meta: { customTitle: normalizedTitle },
          });
      }
    },
    setDockLayout: ({ layout }) => {
      set((state) => {
        if (state.dockLayout === layout) {
          return state;
        }
        return {
          dockLayout: layout,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
  };
}
