import {
  buildPanePanelId,
  paneSurfaceEquals,
  parsePanePanelId,
  type PaneDockLayout,
  type PaneTabMeta,
  type WorkspaceLensTab,
} from "@/lib/panes/types";
import { DEFAULT_LENS_SESSION_ID } from "@/lib/lens/lens.types";
import type { WorkspaceActiveSurface } from "@/lib/terminal/types";

export interface WorkspacePaneStoreState {
  /** Tasks whose center tab is currently open (close does not archive). */
  openTaskTabIds: string[];
  lensTabs: WorkspaceLensTab[];
  paneTabMeta: Record<string, PaneTabMeta>;
  dockLayout: PaneDockLayout | null;
}

export interface WorkspacePaneStoreActions {
  setActiveSurfaceFromPane: (surface: WorkspaceActiveSurface) => void;
  closeTaskTab: (args: { taskId: string }) => void;
  closeCompareRun: (args: { compareRunId: string }) => void;
  createLensTab: () => string | null;
  openLensTab: (args: { lensSessionId: string }) => string | null;
  closeLensTab: (args: { lensSessionId: string }) => void;
  setPaneTabMeta: (args: { panelId: string; meta: PaneTabMeta }) => void;
  renamePaneTab: (args: { panelId: string; title: string }) => void;
  setDockLayout: (args: { layout: PaneDockLayout | null }) => void;
}

export function resolveCreatedLensSessionId(
  lensTabs: ReadonlyArray<WorkspaceLensTab>,
  generatedId: string,
): string {
  return lensTabs.length === 0 ? DEFAULT_LENS_SESSION_ID : generatedId;
}

export function reduceOpenLensTab<
  State extends WorkspacePaneReducerState,
>(args: {
  state: State;
  lensSessionId: string;
  createdAt: number;
  nextSnapshotVersion: number;
}): State | WorkspacePaneReducerPatch {
  const existing = args.state.lensTabs.some(
    (tab) => tab.id === args.lensSessionId,
  );
  const alreadyActive =
    args.state.activeAppSurface.kind === "workspace" &&
    args.state.activeSurface.kind === "lens" &&
    args.state.activeSurface.lensSessionId === args.lensSessionId;
  if (existing && alreadyActive) {
    return args.state;
  }

  return {
    lensTabs: existing
      ? args.state.lensTabs
      : [
          ...args.state.lensTabs,
          { id: args.lensSessionId, createdAt: args.createdAt },
        ],
    activeAppSurface: { kind: "workspace" },
    activeSurface: {
      kind: "lens",
      lensSessionId: args.lensSessionId,
    },
    workspaceSnapshotVersion: args.nextSnapshotVersion,
  };
}

interface WorkspacePaneReducerState extends WorkspacePaneStoreState {
  activeAppSurface: { kind: "workspace" } | { kind: "fleet-view" };
  activeSurface: WorkspaceActiveSurface;
  activeTaskId: string;
  activeCliSessionTabId: string | null;
  activeTerminalTabId: string | null;
  activeEditorTabId: string | null;
  activeCompareRunId: string | null;
  tasks: ReadonlyArray<{ id: string }>;
  workspaceSnapshotVersion: number;
}

type WorkspacePaneReducerPatch = Partial<
  WorkspacePaneStoreState &
    Pick<
      WorkspacePaneReducerState,
      | "activeAppSurface"
      | "activeSurface"
      | "activeTaskId"
      | "activeCliSessionTabId"
      | "activeTerminalTabId"
      | "activeEditorTabId"
      | "activeCompareRunId"
      | "workspaceSnapshotVersion"
    >
>;

export function removePaneTabMetaEntry(args: {
  paneTabMeta: Record<string, PaneTabMeta>;
  panelId: string;
}) {
  if (!(args.panelId in args.paneTabMeta)) {
    return args.paneTabMeta;
  }
  const { [args.panelId]: _removed, ...rest } = args.paneTabMeta;
  return rest;
}

export function reduceActiveSurfaceFromPane<
  State extends WorkspacePaneReducerState,
>(args: {
  state: State;
  surface: WorkspaceActiveSurface;
  nextSnapshotVersion: number;
}): State | WorkspacePaneReducerPatch {
  const patch: WorkspacePaneReducerPatch = {
    activeAppSurface: { kind: "workspace" },
    activeSurface: args.surface,
  };
  switch (args.surface.kind) {
    case "task": {
      const taskId = args.surface.taskId;
      if (taskId && args.state.tasks.some((task) => task.id === taskId)) {
        patch.activeTaskId = taskId;
        if (!args.state.openTaskTabIds.includes(taskId)) {
          patch.openTaskTabIds = [...args.state.openTaskTabIds, taskId];
        }
      }
      break;
    }
    case "cli-session":
      patch.activeCliSessionTabId = args.surface.cliSessionTabId;
      break;
    case "terminal":
      patch.activeTerminalTabId = args.surface.terminalTabId;
      break;
    case "editor":
      patch.activeEditorTabId = args.surface.editorTabId;
      break;
    case "compare-run":
      patch.activeCompareRunId = args.surface.compareRunId;
      break;
    case "lens":
      break;
  }
  const isNoop =
    args.state.activeAppSurface.kind === "workspace" &&
    paneSurfaceEquals(args.state.activeSurface, args.surface) &&
    patch.openTaskTabIds === undefined &&
    (patch.activeTaskId === undefined ||
      patch.activeTaskId === args.state.activeTaskId) &&
    (patch.activeCliSessionTabId === undefined ||
      patch.activeCliSessionTabId === args.state.activeCliSessionTabId) &&
    (patch.activeTerminalTabId === undefined ||
      patch.activeTerminalTabId === args.state.activeTerminalTabId) &&
    (patch.activeEditorTabId === undefined ||
      patch.activeEditorTabId === args.state.activeEditorTabId) &&
    (patch.activeCompareRunId === undefined ||
      patch.activeCompareRunId === args.state.activeCompareRunId);
  if (isNoop) {
    return args.state;
  }
  return { ...patch, workspaceSnapshotVersion: args.nextSnapshotVersion };
}

export function reduceCloseTaskTab<
  State extends WorkspacePaneReducerState,
>(args: {
  state: State;
  taskId: string;
  nextSnapshotVersion: number;
}): State | WorkspacePaneReducerPatch {
  const closingIndex = args.state.openTaskTabIds.indexOf(args.taskId);
  if (closingIndex < 0) {
    return args.state;
  }
  const openTaskTabIds = args.state.openTaskTabIds.filter(
    (taskId) => taskId !== args.taskId,
  );
  const wasActiveSurface =
    args.state.activeSurface.kind === "task" &&
    args.state.activeSurface.taskId === args.taskId;
  const fallbackTaskId = wasActiveSurface
    ? (openTaskTabIds[
        Math.min(closingIndex, Math.max(openTaskTabIds.length - 1, 0))
      ] ?? "")
    : "";
  return {
    openTaskTabIds,
    ...(wasActiveSurface
      ? {
          activeTaskId: fallbackTaskId,
          activeSurface: { kind: "task" as const, taskId: fallbackTaskId },
        }
      : {}),
    paneTabMeta: removePaneTabMetaEntry({
      paneTabMeta: args.state.paneTabMeta,
      panelId: buildPanePanelId({ kind: "task", taskId: args.taskId }),
    }),
    workspaceSnapshotVersion: args.nextSnapshotVersion,
  };
}

export function reduceCloseCompareRun<
  State extends WorkspacePaneReducerState,
>(args: {
  state: State;
  compareRunId: string;
  nextSnapshotVersion: number;
}): State | WorkspacePaneReducerPatch {
  const wasActiveSurface =
    args.state.activeSurface.kind === "compare-run" &&
    args.state.activeSurface.compareRunId === args.compareRunId;
  if (
    args.state.activeCompareRunId !== args.compareRunId &&
    !wasActiveSurface
  ) {
    return args.state;
  }
  return {
    activeCompareRunId:
      args.state.activeCompareRunId === args.compareRunId
        ? null
        : args.state.activeCompareRunId,
    activeSurface: wasActiveSurface
      ? { kind: "task", taskId: args.state.activeTaskId }
      : args.state.activeSurface,
    paneTabMeta: removePaneTabMetaEntry({
      paneTabMeta: args.state.paneTabMeta,
      panelId: buildPanePanelId({
        kind: "compare-run",
        compareRunId: args.compareRunId,
      }),
    }),
    workspaceSnapshotVersion: args.nextSnapshotVersion,
  };
}

export function reduceCloseLensTab<
  State extends WorkspacePaneReducerState,
>(args: {
  state: State;
  lensSessionId: string;
  nextSnapshotVersion: number;
}): State | WorkspacePaneReducerPatch {
  const closingIndex = args.state.lensTabs.findIndex(
    (tab) => tab.id === args.lensSessionId,
  );
  if (closingIndex < 0) {
    return args.state;
  }
  const lensTabs = args.state.lensTabs.filter(
    (tab) => tab.id !== args.lensSessionId,
  );
  const fallbackTab =
    lensTabs[Math.min(closingIndex, Math.max(lensTabs.length - 1, 0))] ?? null;
  return {
    lensTabs,
    activeSurface:
      args.state.activeSurface.kind === "lens" &&
      args.state.activeSurface.lensSessionId === args.lensSessionId
        ? fallbackTab
          ? { kind: "lens", lensSessionId: fallbackTab.id }
          : { kind: "task", taskId: args.state.activeTaskId }
        : args.state.activeSurface,
    paneTabMeta: removePaneTabMetaEntry({
      paneTabMeta: args.state.paneTabMeta,
      panelId: buildPanePanelId({
        kind: "lens",
        lensSessionId: args.lensSessionId,
      }),
    }),
    workspaceSnapshotVersion: args.nextSnapshotVersion,
  };
}

export function reducePaneTabMeta<
  State extends WorkspacePaneReducerState,
>(args: {
  state: State;
  panelId: string;
  meta: PaneTabMeta;
  nextSnapshotVersion: number;
}): State | WorkspacePaneReducerPatch {
  if (!parsePanePanelId(args.panelId)) {
    return args.state;
  }
  const merged: PaneTabMeta = {
    ...(args.state.paneTabMeta[args.panelId] ?? {}),
    ...args.meta,
  };
  if (!merged.customTitle?.trim()) delete merged.customTitle;
  if (!merged.customIcon?.trim()) delete merged.customIcon;
  if (!merged.pinned) delete merged.pinned;

  const isEmpty = Object.keys(merged).length === 0;
  if (isEmpty && !(args.panelId in args.state.paneTabMeta)) {
    return args.state;
  }
  const paneTabMeta = { ...args.state.paneTabMeta };
  if (isEmpty) {
    delete paneTabMeta[args.panelId];
  } else {
    paneTabMeta[args.panelId] = merged;
  }
  return {
    paneTabMeta,
    workspaceSnapshotVersion: args.nextSnapshotVersion,
  };
}
