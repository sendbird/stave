import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
  type BuiltInContextMenuItem,
  type GetTabContextMenuItemsParams,
  type IContextMenuItemComponentProps,
  type IDockviewPanel,
  type IDockviewPanelProps,
  type ReactContextMenuItemConfig,
  type SerializedDockview,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { PaneHeaderActions } from "@/components/panes/PaneHeaderActions";
import { PaneTabChip } from "@/components/panes/PaneTabChip";
import { PaneWatermark } from "@/components/panes/PaneWatermark";
import { TaskHistoryDrawer } from "@/components/panes/TaskHistoryDrawer";
import { TaskSessionIdsDialog } from "@/components/panes/TaskSessionIdsDialog";
import { shouldPreventPaneDropAboveTaskBar } from "@/components/panes/pane-drop-guard";
import {
  OPEN_TASK_HISTORY_EVENT,
  OPEN_TASK_SESSION_IDS_EVENT,
  REQUEST_CLOSE_CLI_SESSION_EVENT,
  REQUEST_CLOSE_EDITOR_TABS_EVENT,
  closePaneSurface,
  dispatchOpenTaskSessionIds,
  dispatchPaneRenameRequest,
  requestEditorBulkClose,
  type EditorTabsCloseRequest,
} from "@/components/panes/pane-surface-actions";
import { registerPaneHostController } from "@/components/panes/pane-host-controller";
import {
  resolveTerminalGroupHeight,
  resolveTerminalPanelPosition,
} from "@/components/panes/terminal-pane-group";
import { CliSessionSurfacePanel } from "@/components/panes/surfaces/CliSessionSurfacePanel";
import { CompareRunSurfacePanel } from "@/components/panes/surfaces/CompareRunSurfacePanel";
import { EditorSurfacePanel } from "@/components/panes/surfaces/EditorSurfacePanel";
import { LensSurfacePanel } from "@/components/panes/surfaces/LensSurfacePanel";
import { TaskSurfacePanel } from "@/components/panes/surfaces/TaskSurfacePanel";
import { TerminalSurfacePanel } from "@/components/panes/surfaces/TerminalSurfacePanel";
import {
  buildPanePanelId,
  parsePanePanelId,
  type PaneDockLayout,
  type PaneSurfaceDescriptor,
  type PaneSurfaceKind,
} from "@/lib/panes/types";
import { canTakeOverTask, isTaskArchived, isTaskManaged } from "@/lib/tasks";
import { closeTerminalSessionForTab } from "@/lib/terminal/terminal-session-cleanup";
import { useAppStore } from "@/store/app.store";
import {
  buildEditorBulkClosePlan,
  closeEditorTabs,
  copyEditorTabBreadcrumbsPath,
  copyEditorTabPath,
  copyEditorTabRelativePath,
} from "@/components/panes/editor-tab-actions";
import { clearLensTabState } from "@/components/panes/lens-tab-state";
import {
  PANE_CUSTOM_ICON_OPTIONS,
  resolvePaneCustomIcon,
} from "@/components/panes/pane-tab-icon-options";
import { splitPanelInDirection } from "@/components/panes/pane-split";

const LAYOUT_PERSIST_DEBOUNCE_MS = 300;

const STAVE_DOCKVIEW_THEME: DockviewTheme = {
  name: "stave",
  className: "dockview-theme-stave",
  edgeGroupCollapsedSize: 46,
  tabGroupIndicator: "none",
};

function PaneIconPicker(props: IContextMenuItemComponentProps) {
  const options = props.componentProps as
    { panelId?: string; selectedIcon?: string | null } | undefined;
  const panelId = options?.panelId;
  if (!panelId) {
    return null;
  }

  const setIcon = (customIcon?: string) => {
    useAppStore.getState().setPaneTabMeta({
      panelId,
      meta: { customIcon },
    });
    props.close();
  };

  return (
    <div className="flex min-w-48 items-center gap-1 px-2 py-1.5">
      <span className="mr-1 text-xs text-muted-foreground">Icon</span>
      <button
        type="button"
        className="flex size-7 items-center justify-center rounded-sm border border-border/70 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Use default tab icon"
        title="Default"
        onClick={() => setIcon(undefined)}
      >
        ×
      </button>
      {PANE_CUSTOM_ICON_OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = options?.selectedIcon === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={
              selected
                ? "flex size-7 items-center justify-center rounded-sm bg-accent text-accent-foreground"
                : "flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            }
            aria-label={`Use ${option.label} tab icon`}
            title={option.label}
            onClick={() => setIcon(option.id)}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

/** Panel `component` name == surface kind (see impl contract). */
const PANEL_COMPONENTS: Record<
  PaneSurfaceKind,
  React.FunctionComponent<IDockviewPanelProps>
> = {
  task: TaskSurfacePanel,
  "cli-session": CliSessionSurfacePanel,
  "compare-run": CompareRunSurfacePanel,
  lens: LensSurfacePanel,
  terminal: TerminalSurfacePanel,
  editor: EditorSurfacePanel,
};

/** Kinds whose DOM must survive being hidden (terminal buffers, webviews). */
const KEEP_ALIVE_KINDS: ReadonlySet<PaneSurfaceKind> = new Set([
  "terminal",
  "cli-session",
  "lens",
]);

type StoreState = ReturnType<typeof useAppStore.getState>;

/**
 * Store collections → the set of surfaces that must have a Dockview panel.
 * Order matters for the synthesized default layout.
 */
function buildDesiredSurfaces(
  state: StoreState,
): Map<string, PaneSurfaceDescriptor> {
  const desired = new Map<string, PaneSurfaceDescriptor>();
  const add = (surface: PaneSurfaceDescriptor) => {
    desired.set(buildPanePanelId(surface), surface);
  };
  const openableTaskIds = new Set(
    state.tasks.filter((task) => !isTaskArchived(task)).map((task) => task.id),
  );
  for (const taskId of state.openTaskTabIds) {
    if (openableTaskIds.has(taskId)) {
      add({ kind: "task", taskId });
    }
  }
  for (const tab of state.cliSessionTabs) {
    add({ kind: "cli-session", cliSessionTabId: tab.id });
  }
  if (
    state.activeCompareRunId &&
    state.compareRunsById[state.activeCompareRunId]
  ) {
    add({ kind: "compare-run", compareRunId: state.activeCompareRunId });
  }
  for (const tab of state.lensTabs) {
    add({ kind: "lens", lensSessionId: tab.id });
  }
  for (const tab of state.terminalTabs) {
    add({ kind: "terminal", terminalTabId: tab.id });
  }
  for (const tab of state.editorTabs) {
    add({ kind: "editor", editorTabId: tab.id });
  }
  return desired;
}

function surfaceExistsInStore(
  surface: PaneSurfaceDescriptor,
  state: StoreState,
): boolean {
  switch (surface.kind) {
    case "task":
      return state.tasks.some(
        (task) => task.id === surface.taskId && !isTaskArchived(task),
      );
    case "cli-session":
      return state.cliSessionTabs.some(
        (tab) => tab.id === surface.cliSessionTabId,
      );
    case "compare-run":
      return Boolean(state.compareRunsById[surface.compareRunId]);
    case "lens":
      return state.lensTabs.some((tab) => tab.id === surface.lensSessionId);
    case "terminal":
      return state.terminalTabs.some((tab) => tab.id === surface.terminalTabId);
    case "editor":
      return state.editorTabs.some((tab) => tab.id === surface.editorTabId);
  }
}

/**
 * A persisted layout is restorable only when every serialized panel id still
 * parses AND maps onto a surface the store currently knows about; otherwise
 * the host falls back to a synthesized single-group layout.
 */
function isRestorableLayout(
  layout: PaneDockLayout,
  desiredIds: ReadonlySet<string>,
): boolean {
  const panels = (layout as { panels?: unknown }).panels;
  const grid = (layout as { grid?: unknown }).grid;
  if (!panels || typeof panels !== "object" || Array.isArray(panels)) {
    return false;
  }
  if (!grid || typeof grid !== "object" || Array.isArray(grid)) {
    return false;
  }
  return Object.keys(panels as Record<string, unknown>).every(
    (panelId) => parsePanePanelId(panelId) !== null && desiredIds.has(panelId),
  );
}

function addSurfacePanel(
  api: DockviewApi,
  surface: PaneSurfaceDescriptor,
  options?: {
    inactive?: boolean;
    position?: {
      referencePanelId?: string;
      referenceGroupId?: string;
      direction?: string;
    };
  },
) {
  const panelId = buildPanePanelId(surface);
  return api.addPanel({
    id: panelId,
    component: surface.kind,
    title: panelId,
    inactive: options?.inactive ?? true,
    ...(KEEP_ALIVE_KINDS.has(surface.kind)
      ? { renderer: "always" as const }
      : {}),
    ...(options?.position
      ? {
          position: options.position.referencePanelId
            ? {
                referencePanel: options.position.referencePanelId,
                direction: options.position.direction as never,
              }
            : options.position.referenceGroupId
              ? {
                  referenceGroup: options.position.referenceGroupId,
                  direction: options.position.direction as never,
                }
              : {
                  direction: (options.position.direction ?? "within") as never,
                },
        }
      : {}),
  });
}

/**
 * Kind-aware default placement: terminals live in a dedicated bottom group.
 * A new terminal joins the existing terminal group when one exists; otherwise
 * it splits a ~30%-tall group below the active group. Other kinds open in the
 * active group as before.
 */
function addSurfacePanelWithDefaultPlacement(
  api: DockviewApi,
  surface: PaneSurfaceDescriptor,
  options?: { inactive?: boolean },
) {
  if (surface.kind !== "terminal") {
    const referenceGroupId = api.activeGroup?.id;
    const referencePanelId = referenceGroupId
      ? undefined
      : (api.activePanel?.id ?? api.panels[0]?.id);
    return addSurfacePanel(api, surface, {
      ...options,
      ...(referenceGroupId
        ? {
            position: {
              referenceGroupId,
              direction: "within",
            },
          }
        : referencePanelId
          ? {
              position: {
                referencePanelId,
                direction: "within",
              },
            }
          : {}),
    });
  }
  const position = resolveTerminalPanelPosition(
    api.panels.map((panel) => panel.id),
  );
  const createsTerminalGroup = !("referencePanelId" in position);
  const panel = addSurfacePanel(api, surface, {
    // A new group needs a selected panel of its own. The host restores the
    // globally active surface after reconciliation, so this does not steal
    // the user's final focus from another group.
    inactive: createsTerminalGroup ? false : (options?.inactive ?? true),
    position,
  });
  if (createsTerminalGroup) {
    const height = resolveTerminalGroupHeight(api.height);
    if (height !== null) {
      panel.api.setSize({ height });
    }
  }
  return panel;
}

function closeSurfaceInStoreDirect(surface: PaneSurfaceDescriptor) {
  const store = useAppStore.getState();
  switch (surface.kind) {
    case "task":
      store.closeTaskTab({ taskId: surface.taskId });
      return;
    case "cli-session":
      store.closeCliSessionTab({ tabId: surface.cliSessionTabId });
      return;
    case "terminal": {
      // Dockview removed the panel before the store knew, so the surface has
      // already unmounted (detach only) — close the backend PTY by slot key.
      const workspaceId = store.activeWorkspaceId;
      store.closeTerminalTab({ tabId: surface.terminalTabId });
      if (workspaceId) {
        void closeTerminalSessionForTab({
          workspaceId,
          terminalTabId: surface.terminalTabId,
        });
      }
      return;
    }
    case "lens": {
      const workspaceId = store.activeWorkspaceId;
      if (workspaceId) {
        void window.api?.lens
          ?.closeSession?.({
            workspaceId,
            lensSessionId: surface.lensSessionId,
          })
          .catch(() => {
            // Best-effort teardown; the main process reaps on workspace dispose.
          });
      }
      clearLensTabState(surface.lensSessionId);
      store.closeLensTab({ lensSessionId: surface.lensSessionId });
      return;
    }
    case "editor":
      store.closeEditorTab({ tabId: surface.editorTabId });
      return;
    case "compare-run":
      store.closeCompareRun({ compareRunId: surface.compareRunId });
      return;
  }
}

/** Tab right-click menu, shared across kinds with per-kind extras. */
function buildTabContextMenuItems(
  params: GetTabContextMenuItemsParams,
): (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] {
  const surface = parsePanePanelId(params.panel.id);
  if (!surface) {
    return [];
  }
  const panelId = params.panel.id;
  const store = useAppStore.getState();
  const pinned = Boolean(store.paneTabMeta[panelId]?.pinned);
  const task =
    surface.kind === "task"
      ? (store.tasks.find((item) => item.id === surface.taskId) ?? null)
      : null;
  const isManagedTask = isTaskManaged(task);

  const groupPanels = params.group.panels;
  const panelIndex = groupPanels.findIndex((panel) => panel.id === panelId);
  const closeSurfaces = (panels: IDockviewPanel[]) => {
    const editorTabIds: string[] = [];
    for (const panel of panels) {
      const panelSurface = parsePanePanelId(panel.id);
      if (!panelSurface) {
        continue;
      }
      if (useAppStore.getState().paneTabMeta[panel.id]?.pinned) {
        continue;
      }
      if (panelSurface.kind === "editor") {
        editorTabIds.push(panelSurface.editorTabId);
        continue;
      }
      closePaneSurface(panelSurface);
    }
    if (editorTabIds.length > 0) {
      const current = useAppStore.getState();
      const targetTabs = current.editorTabs.filter((tab) =>
        editorTabIds.includes(tab.id),
      );
      const dirtyTabIds = targetTabs
        .filter((tab) => tab.isDirty)
        .map((tab) => tab.id);
      requestEditorBulkClose({
        kind: "all",
        tabIds: targetTabs.map((tab) => tab.id),
        dirtyTabIds,
        title: "Close Editor Tabs",
        description:
          dirtyTabIds.length > 0
            ? `Close the selected tabs? ${dirtyTabIds.length} unsaved tab(s) will also be closed.`
            : "Close the selected editor tabs?",
      });
    }
  };

  const items: (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] = [
    {
      label: "Rename",
      disabled: isManagedTask,
      action: () => dispatchPaneRenameRequest({ panelId }),
    },
    {
      label: pinned ? "Unpin" : "Pin",
      action: () =>
        useAppStore.getState().setPaneTabMeta({
          panelId,
          meta: { pinned: !pinned },
        }),
    },
    {
      component: PaneIconPicker,
      componentProps: {
        panelId,
        selectedIcon: resolvePaneCustomIcon(
          store.paneTabMeta[panelId]?.customIcon,
        )
          ? store.paneTabMeta[panelId]?.customIcon
          : null,
      },
    },
    "separator",
    {
      label: "Split Right",
      action: () => splitPanelInDirection(params.api, params.panel, "right"),
    },
    {
      label: "Split Down",
      action: () => splitPanelInDirection(params.api, params.panel, "below"),
    },
  ];

  if (surface.kind === "task") {
    items.push("separator");
    if (isManagedTask) {
      items.push({
        label: "Take Over",
        disabled: !canTakeOverTask({
          task,
          activeTurnId: store.activeTurnIdsByTask[surface.taskId] ?? null,
        }),
        action: () =>
          useAppStore.getState().takeOverTask({ taskId: surface.taskId }),
      });
    }
    items.push(
      {
        label: "Session IDs",
        action: () => dispatchOpenTaskSessionIds({ taskId: surface.taskId }),
      },
      {
        label: "Archive",
        disabled: isManagedTask,
        action: () =>
          useAppStore.getState().archiveTask({ taskId: surface.taskId }),
      },
      {
        label: "Export",
        action: () =>
          void useAppStore.getState().exportTask({ taskId: surface.taskId }),
      },
    );
  }

  if (surface.kind === "editor") {
    const editorTab = store.editorTabs.find(
      (tab) => tab.id === surface.editorTabId,
    );
    const workspaceRootPath =
      store.workspacePathById[store.activeWorkspaceId] ??
      store.projectPath ??
      "";
    const runBulkClose = (kind: "others" | "right" | "saved") => {
      const current = useAppStore.getState();
      const pinnedTabIds = current.editorTabs
        .filter((tab) =>
          Boolean(
            current.paneTabMeta[
              buildPanePanelId({ kind: "editor", editorTabId: tab.id })
            ]?.pinned,
          ),
        )
        .map((tab) => tab.id);
      const plan = buildEditorBulkClosePlan({
        editorTabs: current.editorTabs,
        anchorTabId: surface.editorTabId,
        kind,
        pinnedTabIds,
      });
      if (plan) {
        requestEditorBulkClose(plan);
      }
    };

    items.push("separator");
    if (editorTab) {
      items.push(
        {
          label: "Copy Path",
          action: () =>
            void copyEditorTabPath({
              filePath: editorTab.filePath,
              workspaceRootPath,
            }),
        },
        {
          label: "Copy Relative Path",
          action: () =>
            void copyEditorTabRelativePath({ filePath: editorTab.filePath }),
        },
        {
          label: "Copy Breadcrumbs",
          action: () =>
            void copyEditorTabBreadcrumbsPath({
              filePath: editorTab.filePath,
            }),
        },
      );
    }
    items.push(
      "separator",
      {
        label: "Close",
        disabled: pinned,
        action: () => closePaneSurface(surface),
      },
      {
        label: "Close Others",
        action: () => runBulkClose("others"),
      },
      {
        label: "Close to the Right",
        action: () => runBulkClose("right"),
      },
      {
        label: "Close Saved",
        action: () => runBulkClose("saved"),
      },
    );
    return items;
  }

  items.push(
    "separator",
    {
      label: "Close",
      disabled: pinned,
      action: () => closePaneSurface(surface),
    },
    {
      label: "Close Others",
      action: () =>
        closeSurfaces(groupPanels.filter((panel) => panel.id !== panelId)),
    },
    {
      label: "Close to the Right",
      disabled: panelIndex < 0 || panelIndex >= groupPanels.length - 1,
      action: () => closeSurfaces(groupPanels.slice(panelIndex + 1)),
    },
  );

  return items;
}

export function WorkspacePaneHost() {
  const apiRef = useRef<DockviewApi | null>(null);
  /** True while this host mutates panels itself (reconcile / restore). */
  const reconcilingRef = useRef(false);
  const restoringRef = useRef(false);
  const lastLoadedWorkspaceIdRef = useRef<string | null>(null);
  /** Layout object last written by our own debounce (identity check). */
  const lastWrittenLayoutRef = useRef<PaneDockLayout | null>(null);
  const lastAppliedLayoutRef = useRef<PaneDockLayout | null>(null);
  const layoutPersistTimerRef = useRef<number | null>(null);
  /** Focus history for the terminal toggle (⌘J-style focus round-trip). */
  const lastTerminalPanelIdRef = useRef<string | null>(null);
  const lastNonTerminalPanelIdRef = useRef<string | null>(null);
  const [cliSessionToClose, setCliSessionToClose] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [taskHistoryOpen, setTaskHistoryOpen] = useState(false);
  const [taskSessionIdsTaskId, setTaskSessionIdsTaskId] = useState<
    string | null
  >(null);
  const [taskHistoryWorkspaceId, setTaskHistoryWorkspaceId] = useState<
    string | null
  >(null);
  const [taskHistoryProjectPath, setTaskHistoryProjectPath] = useState<
    string | null
  >(null);
  const [editorTabsToClose, setEditorTabsToClose] =
    useState<EditorTabsCloseRequest | null>(null);

  const [
    activeWorkspaceId,
    openTaskTabIds,
    tasks,
    cliSessionTabs,
    terminalTabs,
    lensTabs,
    editorTabs,
    activeCompareRunId,
    activeSurface,
    dockLayout,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.openTaskTabIds,
          state.tasks,
          state.cliSessionTabs,
          state.terminalTabs,
          state.lensTabs,
          state.editorTabs,
          state.activeCompareRunId,
          state.activeSurface,
          state.dockLayout,
        ] as const,
    ),
  );

  // Derived outside the selector per the Zustand guardrails (no fresh
  // containers from selectors).
  const desiredPanelKey = useMemo(
    () =>
      Array.from(buildDesiredSurfaces(useAppStore.getState()).keys()).join(
        "\n",
      ),
    // Collections are the actual inputs of buildDesiredSurfaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      openTaskTabIds,
      tasks,
      cliSessionTabs,
      terminalTabs,
      lensTabs,
      editorTabs,
      activeCompareRunId,
    ],
  );

  const focusActiveSurface = useCallback((api: DockviewApi) => {
    const state = useAppStore.getState();
    const panelId = buildPanePanelId(state.activeSurface);
    const panel = api.getPanel(panelId);
    if (panel) {
      if (api.activePanel?.id !== panelId) {
        panel.api.setActive();
      }
      return;
    }
    // Defensive fallback: the active surface may reference a panel that no
    // longer exists (e.g. legacy state restored without that tab). Without an
    // active panel the pane area can render blank, so activate any non-terminal
    // panel (or the first panel) instead of silently doing nothing.
    if (api.activePanel) {
      return;
    }
    const fallback =
      api.panels.find((candidate) => {
        const surface = parsePanePanelId(candidate.id);
        return surface !== null && surface.kind !== "terminal";
      }) ?? api.panels[0];
    if (fallback) {
      console.warn(
        "[pane-host] active surface panel missing, falling back to",
        fallback.id,
      );
      fallback.api.setActive();
    }
  }, []);

  /** Store collections → panels (add missing, drop orphans). */
  const reconcilePanels = useCallback((api: DockviewApi) => {
    const desired = buildDesiredSurfaces(useAppStore.getState());
    reconcilingRef.current = true;
    try {
      for (const panel of [...api.panels]) {
        if (!desired.has(panel.id)) {
          api.removePanel(panel);
        }
      }
      for (const [panelId, surface] of desired) {
        if (!api.getPanel(panelId)) {
          addSurfacePanelWithDefaultPlacement(api, surface, {
            inactive: true,
          });
        }
      }
    } finally {
      reconcilingRef.current = false;
    }
  }, []);

  const loadLayoutForActiveWorkspace = useCallback(
    (api: DockviewApi) => {
      const state = useAppStore.getState();
      const desired = buildDesiredSurfaces(state);
      restoringRef.current = true;
      try {
        const layout = state.dockLayout;
        let restored = false;
        if (layout && isRestorableLayout(layout, new Set(desired.keys()))) {
          try {
            api.fromJSON(layout as unknown as SerializedDockview);
            restored = true;
          } catch (error) {
            console.warn(
              "[pane-host] failed to restore dock layout, synthesizing default",
              error,
            );
          }
        }
        if (!restored) {
          api.clear();
          for (const surface of desired.values()) {
            addSurfacePanelWithDefaultPlacement(api, surface, {
              inactive: true,
            });
          }
        }
      } finally {
        restoringRef.current = false;
      }
      // Surfaces missing from the restored layout still need panels.
      reconcilePanels(api);
      focusActiveSurface(api);
      // Dockview can restore an active tab before its only-when-visible
      // renderer is attached. Re-activating the selected panel invokes
      // Dockview's idempotent repair path and restores the missing content.
      api.activePanel?.api.setActive();
    },
    [focusActiveSurface, reconcilePanels],
  );

  const scheduleLayoutPersist = useCallback(() => {
    const workspaceId = useAppStore.getState().activeWorkspaceId;
    if (layoutPersistTimerRef.current !== null) {
      window.clearTimeout(layoutPersistTimerRef.current);
    }
    layoutPersistTimerRef.current = window.setTimeout(() => {
      layoutPersistTimerRef.current = null;
      const api = apiRef.current;
      const state = useAppStore.getState();
      if (
        !api ||
        state.activeWorkspaceId !== workspaceId ||
        lastLoadedWorkspaceIdRef.current !== workspaceId
      ) {
        return;
      }
      const layout = api.toJSON() as unknown as PaneDockLayout;
      lastWrittenLayoutRef.current = layout;
      lastAppliedLayoutRef.current = layout;
      state.setDockLayout({ layout });
    }, LAYOUT_PERSIST_DEBOUNCE_MS);
  }, []);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api;
      apiRef.current = api;

      api.onWillShowOverlay((dropEvent) => {
        if (shouldPreventPaneDropAboveTaskBar(dropEvent)) {
          dropEvent.preventDefault();
        }
      });
      api.onWillDrop((dropEvent) => {
        if (shouldPreventPaneDropAboveTaskBar(dropEvent)) {
          dropEvent.preventDefault();
        }
      });

      api.onDidActivePanelChange(({ panel }) => {
        if (!panel) {
          return;
        }
        const surface = parsePanePanelId(panel.id);
        if (!surface) {
          return;
        }
        // Track focus history (also during restore) for the terminal toggle.
        if (surface.kind === "terminal") {
          lastTerminalPanelIdRef.current = panel.id;
        } else {
          lastNonTerminalPanelIdRef.current = panel.id;
        }
        // Skip the store mirror while restoring OR reconciling: removing an
        // orphan panel makes Dockview auto-activate a neighbor, and mirroring
        // that transient focus would clobber the store's activeSurface before
        // focusActiveSurface() re-asserts it.
        if (restoringRef.current || reconcilingRef.current) {
          return;
        }
        useAppStore.getState().setActiveSurfaceFromPane(surface);
      });

      api.onDidRemovePanel((panel) => {
        if (restoringRef.current || reconcilingRef.current) {
          return;
        }
        const surface = parsePanePanelId(panel.id);
        if (!surface) {
          return;
        }
        // Removal initiated inside Dockview (not via our chrome): mirror it
        // into the store with kind-specific close semantics, skipping the
        // CLI-session confirm because the panel is already gone.
        closeSurfaceInStoreDirect(surface);
      });

      api.onDidLayoutChange(() => {
        if (restoringRef.current) {
          return;
        }
        scheduleLayoutPersist();
      });

      const state = useAppStore.getState();
      lastLoadedWorkspaceIdRef.current = state.activeWorkspaceId;
      lastAppliedLayoutRef.current = state.dockLayout;
      loadLayoutForActiveWorkspace(api);
    },
    [loadLayoutForActiveWorkspace, scheduleLayoutPersist],
  );

  // Workspace switch (or an externally hydrated layout) → restore layout.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    const workspaceChanged =
      lastLoadedWorkspaceIdRef.current !== activeWorkspaceId;
    const layoutHydratedExternally =
      dockLayout !== null &&
      dockLayout !== lastWrittenLayoutRef.current &&
      dockLayout !== lastAppliedLayoutRef.current;
    if (!workspaceChanged && !layoutHydratedExternally) {
      return;
    }
    if (layoutPersistTimerRef.current !== null) {
      window.clearTimeout(layoutPersistTimerRef.current);
      layoutPersistTimerRef.current = null;
    }
    lastLoadedWorkspaceIdRef.current = activeWorkspaceId;
    lastAppliedLayoutRef.current = dockLayout;
    loadLayoutForActiveWorkspace(api);
  }, [activeWorkspaceId, dockLayout, loadLayoutForActiveWorkspace]);

  // Store collections → panels.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || lastLoadedWorkspaceIdRef.current !== activeWorkspaceId) {
      return;
    }
    reconcilePanels(api);
    focusActiveSurface(api);
    // desiredPanelKey encodes the collection state feeding the reconciler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredPanelKey, activeWorkspaceId, reconcilePanels, focusActiveSurface]);

  // Store activeSurface → active panel.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || lastLoadedWorkspaceIdRef.current !== activeWorkspaceId) {
      return;
    }
    focusActiveSurface(api);
  }, [activeSurface, activeWorkspaceId, focusActiveSurface]);

  // Imperative bridge for shortcuts / non-pane UI.
  useEffect(() => {
    const unregister = registerPaneHostController({
      openSurface: (surface, options) => {
        const api = apiRef.current;
        const store = useAppStore.getState();
        if (surface.kind === "task") {
          // selectTask both ensures tab membership and focuses the surface;
          // an inactive task open is not part of wave-1 semantics.
          store.selectTask({ taskId: surface.taskId });
          return;
        }
        if (surface.kind === "compare-run") {
          store.openCompareRun({ compareRunId: surface.compareRunId });
          return;
        }
        if (!api) {
          return;
        }
        const panelId = buildPanePanelId(surface);
        let panel = api.getPanel(panelId);
        if (!panel) {
          if (!surfaceExistsInStore(surface, store)) {
            return;
          }
          panel = options?.position
            ? addSurfacePanel(api, surface, {
                inactive: options?.activate === false,
                position: options.position,
              })
            : addSurfacePanelWithDefaultPlacement(api, surface, {
                inactive: options?.activate === false,
              });
        }
        if (options?.activate !== false) {
          panel.api.setActive();
        }
      },
      closeSurface: (surface) => {
        closePaneSurface(surface);
      },
      focusSurface: (surface) => {
        apiRef.current?.getPanel(buildPanePanelId(surface))?.api.setActive();
      },
      splitActivePanel: (direction) => {
        const api = apiRef.current;
        const panel = api?.activePanel;
        if (api && panel) {
          splitPanelInDirection(
            api,
            panel,
            direction === "right" ? "right" : "below",
          );
        }
      },
      toggleTerminalGroup: () => {
        const api = apiRef.current;
        const store = useAppStore.getState();
        const createAndFocusTerminalTab = () => {
          // The reconciler places the new panel in the bottom terminal
          // group; createTerminalTab also marks the pane as active so the
          // host focuses it right after reconciliation.
          store.createTerminalTab();
        };
        if (!api) {
          createAndFocusTerminalTab();
          return;
        }
        const terminalPanels = api.panels.filter(
          (panel) => parsePanePanelId(panel.id)?.kind === "terminal",
        );
        if (terminalPanels.length === 0) {
          createAndFocusTerminalTab();
          return;
        }
        const activePanel = api.activePanel;
        const activeIsTerminal = activePanel
          ? parsePanePanelId(activePanel.id)?.kind === "terminal"
          : false;
        if (!activeIsTerminal) {
          // Focus the most recently focused terminal, falling back to the
          // newest terminal panel.
          const remembered = lastTerminalPanelIdRef.current
            ? api.getPanel(lastTerminalPanelIdRef.current)
            : undefined;
          const target =
            remembered ?? terminalPanels[terminalPanels.length - 1];
          target?.api.setActive();
          return;
        }
        // A terminal is focused — return to the previously focused
        // non-terminal panel (or any non-terminal panel as a fallback).
        const rememberedOther = lastNonTerminalPanelIdRef.current
          ? api.getPanel(lastNonTerminalPanelIdRef.current)
          : undefined;
        const target =
          rememberedOther ??
          api.panels.find(
            (panel) => parsePanePanelId(panel.id)?.kind !== "terminal",
          );
        target?.api.setActive();
      },
    });
    return unregister;
  }, []);

  // Chrome events: destructive close confirmations + task history drawer.
  useEffect(() => {
    function handleRequestCloseCliSession(event: Event) {
      const detail = (event as CustomEvent<{ id: string; title: string }>)
        .detail;
      if (detail?.id) {
        setCliSessionToClose(detail);
      }
    }
    function handleOpenTaskHistory(event: Event) {
      const detail = (
        event as CustomEvent<{ workspaceId?: string; projectPath?: string }>
      ).detail;
      setTaskHistoryWorkspaceId(detail?.workspaceId ?? null);
      setTaskHistoryProjectPath(detail?.projectPath ?? null);
      setTaskHistoryOpen(true);
    }
    function handleOpenTaskSessionIds(event: Event) {
      const detail = (event as CustomEvent<{ taskId?: string }>).detail;
      if (detail?.taskId) {
        setTaskSessionIdsTaskId(detail.taskId);
      }
    }
    function handleRequestCloseEditorTabs(event: Event) {
      const detail = (event as CustomEvent<EditorTabsCloseRequest>).detail;
      if (detail?.tabIds.length) {
        setEditorTabsToClose(detail);
      }
    }
    window.addEventListener(
      REQUEST_CLOSE_CLI_SESSION_EVENT,
      handleRequestCloseCliSession,
    );
    window.addEventListener(OPEN_TASK_HISTORY_EVENT, handleOpenTaskHistory);
    window.addEventListener(
      OPEN_TASK_SESSION_IDS_EVENT,
      handleOpenTaskSessionIds,
    );
    window.addEventListener(
      REQUEST_CLOSE_EDITOR_TABS_EVENT,
      handleRequestCloseEditorTabs,
    );
    return () => {
      window.removeEventListener(
        REQUEST_CLOSE_CLI_SESSION_EVENT,
        handleRequestCloseCliSession,
      );
      window.removeEventListener(
        OPEN_TASK_HISTORY_EVENT,
        handleOpenTaskHistory,
      );
      window.removeEventListener(
        OPEN_TASK_SESSION_IDS_EVENT,
        handleOpenTaskSessionIds,
      );
      window.removeEventListener(
        REQUEST_CLOSE_EDITOR_TABS_EVENT,
        handleRequestCloseEditorTabs,
      );
    };
  }, []);

  useEffect(
    () => () => {
      if (layoutPersistTimerRef.current !== null) {
        window.clearTimeout(layoutPersistTimerRef.current);
      }
      apiRef.current = null;
    },
    [],
  );

  return (
    <div
      className="h-full min-h-0 w-full min-w-0"
      data-testid="workspace-pane-host"
    >
      <DockviewReact
        theme={STAVE_DOCKVIEW_THEME}
        components={PANEL_COMPONENTS}
        defaultTabComponent={PaneTabChip}
        rightHeaderActionsComponent={PaneHeaderActions}
        watermarkComponent={PaneWatermark}
        getTabContextMenuItems={buildTabContextMenuItems}
        onReady={handleReady}
      />
      <ConfirmDialog
        open={Boolean(cliSessionToClose)}
        title="Close CLI Session"
        description={
          cliSessionToClose
            ? `Close CLI session "${cliSessionToClose.title}"? The underlying process will be terminated.`
            : ""
        }
        confirmLabel="Close"
        onCancel={() => setCliSessionToClose(null)}
        onConfirm={() => {
          if (!cliSessionToClose) {
            return;
          }
          useAppStore
            .getState()
            .closeCliSessionTab({ tabId: cliSessionToClose.id });
          setCliSessionToClose(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(editorTabsToClose)}
        title={editorTabsToClose?.title ?? "Close Editor Tabs"}
        description={editorTabsToClose?.description ?? ""}
        confirmLabel="Close"
        onCancel={() => setEditorTabsToClose(null)}
        onConfirm={() => {
          if (!editorTabsToClose) {
            return;
          }
          closeEditorTabs({ tabIds: editorTabsToClose.tabIds });
          setEditorTabsToClose(null);
        }}
      />
      <TaskHistoryDrawer
        open={taskHistoryOpen}
        onOpenChange={(open) => {
          setTaskHistoryOpen(open);
          if (!open) {
            setTaskHistoryWorkspaceId(null);
            setTaskHistoryProjectPath(null);
          }
        }}
        workspaceId={taskHistoryWorkspaceId}
        projectPath={taskHistoryProjectPath}
      />
      <TaskSessionIdsDialog
        taskId={taskSessionIdsTaskId}
        onOpenChange={(open) => {
          if (!open) {
            setTaskSessionIdsTaskId(null);
          }
        }}
      />
    </div>
  );
}
