import { getLensTabState } from "@/components/panes/lens-tab-state";
import {
  focusOrCreateGitGraphSurface,
  paneHost,
} from "@/components/panes/pane-host-controller";
import { workspaceFsAdapter } from "@/lib/fs";
import {
  ClosedTabRegistry,
  type ClosedPaneTab,
} from "@/lib/panes/closed-tab-stack";
import type { PaneSurfaceDescriptor } from "@/lib/panes/types";
import { isTaskArchived } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";

/**
 * Reopen-closed-tab for the workspace panes. Close paths call
 * `recordClosedPaneTab` just before they remove a tab; Cmd/Ctrl+Shift+T calls
 * `reopenLastClosedPaneTab`. Tasks, file and commit-graph editor tabs and Lens
 * tabs can come back. Terminals, CLI sessions and compare runs cannot: closing
 * them ends the process behind them.
 */
const closedTabs = new ClosedTabRegistry();

function describeClosedTab(
  surface: PaneSurfaceDescriptor,
): ClosedPaneTab | null {
  const state = useAppStore.getState();
  switch (surface.kind) {
    case "task":
      return state.openTaskTabIds.includes(surface.taskId)
        ? { kind: "task", taskId: surface.taskId }
        : null;
    case "editor": {
      const tab = state.editorTabs.find(
        (item) => item.id === surface.editorTabId,
      );
      if (!tab) {
        return null;
      }
      if (tab.kind === "git-graph") {
        return { kind: "git-graph", editorTabId: tab.id };
      }
      // Diff tabs are built from a comparison, not a path, so only file tabs
      // can be opened again.
      if (!tab.id.startsWith("file:")) {
        return null;
      }
      return {
        kind: "editor",
        editorTabId: tab.id,
        filePath: tab.filePath,
        editorKind: tab.kind === "image" ? "image" : "text",
      };
    }
    case "lens":
      return state.lensTabs.some((tab) => tab.id === surface.lensSessionId)
        ? {
            kind: "lens",
            url: getLensTabState(surface.lensSessionId).url ?? null,
          }
        : null;
    default:
      return null;
  }
}

/** Remember a tab that is about to close in the active workspace. */
export function recordClosedPaneTab(surface: PaneSurfaceDescriptor) {
  const entry = describeClosedTab(surface);
  if (entry) {
    closedTabs.record(useAppStore.getState().activeWorkspaceId, entry);
  }
}

async function fileStillExists(entry: Extract<ClosedPaneTab, { kind: "editor" }>) {
  try {
    const data =
      entry.editorKind === "image"
        ? await workspaceFsAdapter.readFileDataUrl({ filePath: entry.filePath })
        : await workspaceFsAdapter.readFile({ filePath: entry.filePath });
    return data !== null;
  } catch {
    return false;
  }
}

/** True while the entry's target exists and is not already open again. */
async function canReopen(entry: ClosedPaneTab): Promise<boolean> {
  const state = useAppStore.getState();
  switch (entry.kind) {
    case "task": {
      const task = state.tasks.find((item) => item.id === entry.taskId);
      return (
        Boolean(task) &&
        !isTaskArchived(task!) &&
        !state.openTaskTabIds.includes(entry.taskId)
      );
    }
    case "editor":
      if (state.editorTabs.some((tab) => tab.filePath === entry.filePath)) {
        return false;
      }
      return fileStillExists(entry);
    case "git-graph":
      return !state.editorTabs.some((tab) => tab.id === entry.editorTabId);
    case "lens":
      return Boolean(state.activeWorkspaceId);
  }
}

async function restoreLensPage(args: {
  workspaceId: string;
  lensSessionId: string;
  url: string;
}) {
  const lens = window.api?.lens;
  if (!lens?.openSession || !lens.navigate) {
    return;
  }
  const state = useAppStore.getState();
  try {
    const opened = await lens.openSession({
      workspaceId: args.workspaceId,
      lensSessionId: args.lensSessionId,
      sessionScope: state.settings.lensSessionScope,
      repositoryKey: state.repositoryPath,
    });
    if (opened.ok) {
      await lens.navigate(args);
    }
  } catch {
    // The tab is back either way; only its page could not be restored.
  }
}

async function reopen(entry: ClosedPaneTab) {
  const store = useAppStore.getState();
  switch (entry.kind) {
    case "task":
      paneHost.openSurface({ kind: "task", taskId: entry.taskId });
      return;
    case "editor":
      await store.openFileFromTree({ filePath: entry.filePath });
      paneHost.openSurface({ kind: "editor", editorTabId: entry.editorTabId });
      return;
    case "git-graph":
      focusOrCreateGitGraphSurface();
      return;
    case "lens": {
      const workspaceId = store.activeWorkspaceId;
      const lensSessionId = store.createLensTab();
      if (!lensSessionId) {
        return;
      }
      paneHost.openSurface({ kind: "lens", lensSessionId });
      if (entry.url) {
        await restoreLensPage({ workspaceId, lensSessionId, url: entry.url });
      }
    }
  }
}

/**
 * Reopen the newest closed tab of the active workspace that still exists.
 * Returns false when there is nothing to reopen.
 */
export async function reopenLastClosedPaneTab(): Promise<boolean> {
  const workspaceId = useAppStore.getState().activeWorkspaceId;
  if (!workspaceId) {
    return false;
  }
  const entry = await closedTabs.take(workspaceId, canReopen);
  if (!entry || useAppStore.getState().activeWorkspaceId !== workspaceId) {
    return false;
  }
  await reopen(entry);
  return true;
}

/** Test seam. */
export function resetClosedPaneTabs() {
  closedTabs.clear();
}
