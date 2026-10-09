import { i18n, useTranslation } from "@/i18n";
import { WorkspaceWelcome } from "./WorkspaceWelcome";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import type { ProviderId } from "@/lib/providers/provider.types";
import { GlobalCommandPalette } from "@/components/layout/GlobalCommandPalette";
import { TopBar } from "@/components/layout/TopBar";
import { FleetView } from "@/components/layout/FleetView";
import { AutomationCenterView } from "@/components/layout/automation-center/AutomationCenterView";
import { AgentsView } from "@/components/agents/AgentsView";
import { UsageView } from "@/components/usage/UsageView";
import {
  COLLAPSED_REPOSITORY_SIDEBAR_WIDTH,
  RepositoryWorkspaceSidebar,
} from "@/components/layout/RepositoryWorkspaceSidebar";
import { PresetBar } from "@/components/layout/PresetBar";
import { WorkspacePaneHost } from "@/components/panes/WorkspacePaneHost";
import {
  focusOrCreateGitGraphSurface,
  focusOrCreateLensSurface,
  paneHost,
} from "@/components/panes/pane-host-controller";
import { closePaneSurface } from "@/components/panes/pane-surface-actions";
import { useEditorPaneFocus } from "@/components/panes/use-editor-pane-focus";
import { useFleetResultAutoReview } from "@/components/layout/useFleetResultAutoReview";
import { resolveLatestCompletedTurnTarget } from "@/components/layout/command-palette-navigation";
import { useScriptsCommandPaletteContributor } from "@/components/layout/command-palette-scripts";
import { dispatchTopBarPrAction } from "@/components/layout/top-bar-pr-events";
import { Card, Toaster, toast } from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { QuitConfirmationDialog } from "@/components/layout/QuitConfirmationDialog";
import { requestComparePreparation } from "@/components/compare/compare-prepare-request";
import { listLatestWorkspaceTurns } from "@/lib/db/turns.db";
import { LENS_SURFACE_ROOT_ID } from "@/lib/lens/lens-guest-host";
import { layers } from "@/lib/ui-layers.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { appShellStyles } from "@/components/layout/app-shell.styles";
import { isTaskArchived } from "@/lib/tasks";
import { refreshTrackerIssues } from "@/lib/tracker-issues/client-state";
import { RenderProfiler } from "@/lib/render-profiler";
import {
  STAVE_OPEN_SETTINGS_EVENT,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  useAppStore,
  type LayoutState,
} from "@/store/app.store";
import { useAgentsUiStore } from "@/store/agents-ui-store";
import { createDefaultLayoutState } from "@/store/layout.utils";
import { EditorMonacoWarmup } from "@/components/layout/editor-monaco-warmup";
import { PanelResizeHandle } from "@/components/layout/PanelResizeHandle";
import { RightRail } from "@/components/layout/RightRail";
import { StatusBar } from "@/components/layout/StatusBar";
import { dispatchExplorerSearchRequest } from "@/components/layout/explorer-search-events";
import {
  MIN_CHAT_PANEL_WIDTH,
  MIN_EXPLORER_PANEL_WIDTH,
  PANEL_SEPARATOR_WIDTH,
} from "@/components/layout/app-shell-layout";
import { useAppKeybindings } from "@/components/layout/useAppKeybindings";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import type { RightRailPanelId } from "@/lib/right-rail-panels";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import { buildPanePanelId } from "@/lib/panes/types";
import {
  UTILITY_INFERENCE_NOTICE_EVENT,
  type UtilityInferenceNoticeDetail,
} from "@/lib/providers/utility-inference-notice";
import { getProviderLabel } from "@/lib/providers/model-catalog";

const EditorPanel = lazy(() =>
  import("@/components/layout/EditorPanel").then((module) => ({
    default: module.EditorPanel,
  })),
);
const loadSettingsDialog = () =>
  import("@/components/layout/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  }));
const SettingsDialog = lazy(() => loadSettingsDialog());
const loadKeyboardShortcutsDrawer = () =>
  import("@/components/layout/KeyboardShortcutsDrawer").then((module) => ({
    default: module.KeyboardShortcutsDrawer,
  }));
const KeyboardShortcutsDrawer = lazy(() => loadKeyboardShortcutsDrawer());
const KickoffDialog = lazy(() =>
  import("@/components/layout/KickoffDialog").then((module) => ({
    default: module.KickoffDialog,
  })),
);
// Lazy on purpose: the tracker list, its filters, and the kickoff form are dead
// weight for the majority of sessions that never open the surface.
const IssuesView = lazy(() =>
  import("./issues/IssuesView").then((module) => ({
    default: module.IssuesView,
  })),
);

type ResizableLayoutKey = "workspaceSidebarWidth" | "explorerPanelWidth";

const WORKSPACE_SIDEBAR_MAX_WIDTH = 340;
/** Panel widths a double-click on a resize handle returns to. */
const DEFAULT_LAYOUT = createDefaultLayoutState();

export function AppShell() {
  useTranslation();
  const notifications = useAppStore((state) => state.notifications);
  const [
    repositoryPath,
    repositoryName,
    tasks,
    activeTaskId,
    activeAppSurface,
    activeTurnIdsByTask,
    workspaces,
    activeWorkspaceId,
    workspaceBranchById,
    workspaceDefaultById,
    workspacePathById,
    workspacePrInfoById,
    recentRepositories,
    workspaceSidebarWidth,
    workspaceSidebarCollapsed,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    explorerPanelWidth,
    activeEditorTabId,
    appShortcutKeys,
    commandPaletteHiddenCommandIds,
    commandPalettePinnedCommandIds,
    commandPaletteRecentCommandIds,
    commandPaletteShowRecent,
    createTask,
    selectTask,
    clearTaskSelection,
    setTaskProvider,
    saveActiveEditorTab,
    refreshRepositoryFiles,
    refreshWorkspaces,
    openFleetView,
    openAutomationCenter,
    openIssues,
    closeIssues,
    openAgents,
    openAgentPerformance,
    openUsage,
    openRepository,
    switchWorkspace,
    abortTaskTurn,
    setLayout,
    applyExternalWorkspaceInformationUpdate,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.repositoryPath,
          state.repositoryName,
          state.tasks,
          state.activeTaskId,
          state.activeAppSurface,
          state.activeTurnIdsByTask,
          state.workspaces,
          state.activeWorkspaceId,
          state.workspaceBranchById,
          state.workspaceDefaultById,
          state.workspacePathById,
          state.workspacePrInfoById,
          state.recentRepositories,
          state.layout.workspaceSidebarWidth,
          state.layout.workspaceSidebarCollapsed,
          state.layout.sidebarOverlayVisible,
          state.layout.sidebarOverlayTab,
          state.layout.explorerPanelWidth,
          state.activeEditorTabId,
          state.settings.appShortcutKeys,
          state.settings.commandPaletteHiddenCommandIds,
          state.settings.commandPalettePinnedCommandIds,
          state.settings.commandPaletteRecentCommandIds,
          state.settings.commandPaletteShowRecent,
          state.createTask,
          state.selectTask,
          state.clearTaskSelection,
          state.setTaskProvider,
          state.saveActiveEditorTab,
          state.refreshRepositoryFiles,
          state.refreshWorkspaces,
          state.openFleetView,
          state.openAutomationCenter,
          state.openIssues,
          state.closeIssues,
          state.openAgents,
          state.openAgentPerformance,
          state.openUsage,
          state.openRepository,
          state.switchWorkspace,
          state.abortTaskTurn,
          state.setLayout,
          state.applyExternalWorkspaceInformationUpdate,
        ] as const,
    ),
  );
  const showPresetBar = useAppStore((state) => state.settings.showPresetBar);
  // Editor open actions only set activeEditorTabId; reveal the pane for them.
  useEditorPaneFocus();
  // Reading a finished turn in the task window acknowledges its Fleet row.
  useFleetResultAutoReview();
  const hasRepository = Boolean(repositoryPath);
  const panelRowRef = useRef<HTMLDivElement>(null);
  const contentRowRef = useRef<HTMLDivElement>(null);
  const pendingLayoutPatchRef = useRef<Partial<LayoutState> | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [zoomHudPercent, setZoomHudPercent] = useState<number | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SectionId>("general");
  const [settingsInitialRepositoryPath, setSettingsInitialRepositoryPath] = useState<
    string | null
  >(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [kickoffOpen, setKickoffOpen] = useState(false);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [contentRowWidth, setContentRowWidth] = useState(0);
  const [isLargeViewport, setIsLargeViewport] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 1024px)").matches,
  );
  const zoomHudTimerRef = useRef<number | null>(null);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [quittingApp, setQuittingApp] = useState(false);
  const handleFocusFileSearch = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>(
      "[data-file-search-input]",
    );
    input?.focus();
    input?.select();
  }, []);
  const handlePreloadSettings = useCallback(() => {
    void loadSettingsDialog();
  }, []);
  const handleOpenSettings = useCallback(
    (options?: { repositoryPath?: string | null; section?: SectionId }) => {
      handlePreloadSettings();
      setSettingsInitialSection(options?.section ?? "general");
      setSettingsInitialRepositoryPath(options?.repositoryPath ?? null);
      setSettingsOpen(true);
    },
    [handlePreloadSettings],
  );
  const handleSettingsOpenChange = useCallback((options: { open: boolean }) => {
    setSettingsOpen(options.open);
    if (!options.open) {
      setSettingsInitialSection("general");
      setSettingsInitialRepositoryPath(null);
    }
  }, []);
  const handlePreloadKeyboardShortcuts = useCallback(() => {
    void loadKeyboardShortcutsDrawer();
  }, []);
  const handleOpenKeyboardShortcuts = useCallback(() => {
    handlePreloadKeyboardShortcuts();
    setShortcutsOpen(true);
  }, [handlePreloadKeyboardShortcuts]);
  const handleKeyboardShortcutsRequested = useCallback(() => {
    handleSettingsOpenChange({ open: false });
    handleOpenKeyboardShortcuts();
  }, [handleOpenKeyboardShortcuts, handleSettingsOpenChange]);
  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);
  const handleOpenKickoff = useCallback(
    async (targetRepositoryPath?: string) => {
      const normalizedTargetPath = targetRepositoryPath?.trim();
      if (normalizedTargetPath && normalizedTargetPath !== repositoryPath) {
        await openRepository({ repositoryPath: normalizedTargetPath });
      }
      setCommandPaletteOpen(false);
      setKickoffOpen(true);
    },
    [openRepository, repositoryPath],
  );
  // Issues, the composer's `!assign`, and an agent's "Assign…" open Kickoff
  // through the agents UI store; the dialog itself reads and clears the preset.
  const kickoffRequestNonce = useAgentsUiStore(
    (state) => state.kickoffRequest?.nonce ?? null,
  );
  useEffect(() => {
    if (kickoffRequestNonce === null) {
      return;
    }
    setCommandPaletteOpen(false);
    setKickoffOpen(true);
  }, [kickoffRequestNonce]);
  const handleOpenExplorerSearch = useCallback(() => {
    const store = useAppStore.getState();
    const searchRootPath =
      store.workspacePathById[store.activeWorkspaceId] ?? store.repositoryPath;
    if (!searchRootPath?.trim()) {
      return;
    }
    store.setLayout({
      patch: {
        sidebarOverlayVisible: true,
        sidebarOverlayTab: "explorer",
      },
    });
    window.requestAnimationFrame(() => {
      dispatchExplorerSearchRequest();
    });
  }, []);
  const handleCreatePullRequest = useCallback(() => {
    dispatchTopBarPrAction("create-pr");
  }, []);
  const handleContinueWorkspace = useCallback(() => {
    dispatchTopBarPrAction("continue");
  }, []);
  const handleStartCompareRun = useCallback(() => {
    const state = useAppStore.getState();
    const taskId = state.activeTaskId.trim();
    const taskExists = state.tasks.some(
      (task) => task.id === taskId && !isTaskArchived(task),
    );
    if (!taskId || !taskExists) {
      toast.error(i18n.t("shell:appShell.openATaskBeforeComparingRuns"));
      return;
    }
    setCommandPaletteOpen(false);
    state.selectTask({ taskId });
    requestComparePreparation(taskId);
  }, []);
  const handleOpenLatestCompletedTurnTask = useCallback(async () => {
    const stateBefore = useAppStore.getState();
    if (stateBefore.workspaces.length === 0) {
      toast.message(i18n.t("shell:appShell.noWorkspacesAvailable"));
      return;
    }

    try {
      const turnsByWorkspaceId = Object.fromEntries(
        await Promise.all(
          stateBefore.workspaces.map(
            async (workspace) =>
              [
                workspace.id,
                await listLatestWorkspaceTurns({ workspaceId: workspace.id }),
              ] as const,
          ),
        ),
      );
      const latestTarget = resolveLatestCompletedTurnTarget({
        turnsByWorkspaceId,
      });

      if (!latestTarget) {
        toast.message(i18n.t("shell:appShell.noCompletedTurnsYet"));
        return;
      }

      if (stateBefore.activeWorkspaceId !== latestTarget.workspaceId) {
        await stateBefore.switchWorkspace({
          workspaceId: latestTarget.workspaceId,
        });
      }

      const stateAfter = useAppStore.getState();
      const targetTask = stateAfter.tasks.find(
        (task) => task.id === latestTarget.taskId,
      );
      if (!targetTask) {
        toast.error(i18n.t("shell:appShell.unableToOpenTheLatestCompletedTask"), {
          description:
            i18n.t("shell:appShell.theTaskForTheNewestCompletedTurn"),
        });
        return;
      }

      if (isTaskArchived(targetTask)) {
        stateAfter.restoreTask({ taskId: latestTarget.taskId });
        stateAfter.requestTaskScrollToLatest({
          taskId: latestTarget.taskId,
        });
        return;
      }

      stateAfter.selectTask({ taskId: latestTarget.taskId });
      stateAfter.requestTaskScrollToLatest({ taskId: latestTarget.taskId });
    } catch (error) {
      toast.error(i18n.t("shell:appShell.unableToFindTheLatestCompletedTurn"), {
        description:
          error instanceof Error
            ? error.message
            : i18n.t("shell:appShell.turnHistoryCouldNotBeLoaded"),
      });
    }
  }, []);

  function flushPendingLayoutPatch() {
    if (!pendingLayoutPatchRef.current) {
      return;
    }
    setLayout({ patch: pendingLayoutPatchRef.current });
    pendingLayoutPatchRef.current = null;
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
  }

  function scheduleLayoutPatch(patch: Partial<LayoutState>) {
    pendingLayoutPatchRef.current = {
      ...(pendingLayoutPatchRef.current ?? {}),
      ...patch,
    };
    if (resizeFrameRef.current !== null) {
      return;
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      if (!pendingLayoutPatchRef.current) {
        return;
      }
      const patch = pendingLayoutPatchRef.current;
      pendingLayoutPatchRef.current = null;
      setLayout({ patch });
    });
  }

  function scheduleLayoutResizePatch(key: ResizableLayoutKey, value: number) {
    scheduleLayoutPatch({ [key]: value } as Partial<LayoutState>);
  }

  function OverlayLoadingFallback(args: { title: string }) {
  useTranslation();
    return (
      <div className={sx(layers.dialog, appShellStyles.overlayFallback)}>
        <Card className={sx(appShellStyles.overlayCard)}>
          <div className={sx(appShellStyles.overlayText)}>{i18n.t("shell:appShell.loadingSurface", { title: args.title })}</div>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    const unsubscribe = window.api?.notifications?.subscribeNativeClick?.(
      ({ notificationId }) => {
        void useAppStore.getState().openNotificationContext({
          notificationId,
          targetSurface: "task",
        });
      },
    );
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    void window.api?.notifications?.setBadge?.({
      count: notifications.filter((notification) => !notification.readAt)
        .length,
    });
  }, [notifications]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void useAppStore.getState().checkOpenTabConflicts();
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const featureLabels: Record<
      UtilityInferenceNoticeDetail["feature"],
      string
    > = {
      "task-name": i18n.t("shell:appShell.taskNaming"),
      "route-classification": i18n.t("shell:appShell.routeClassification"),
      "commit-message": i18n.t("shell:appShell.commitMessageGeneration"),
      "prompt-enhancement": i18n.t("shell:appShell.promptEnhancement"),
    };
    const onUtilityInferenceNotice = (event: Event) => {
      const { feature, ok, utility } = (
        event as CustomEvent<UtilityInferenceNoticeDetail>
      ).detail;
      const title = featureLabels[feature];
      if (ok && utility.providerId) {
        toast.info(i18n.t("shell:appShell.usedAFallbackProvider", { value1: title }), {
          id: `utility-inference:${feature}`,
          description: `${getProviderLabel({ providerId: utility.providerId })} · ${utility.model ?? i18n.t("shell:appShell.defaultModel")}`,
        });
        return;
      }
      toast.warning(i18n.t("shell:appShell.isUnavailable", { value1: title }), {
        id: `utility-inference:${feature}`,
        description:
          utility.detail ||
          i18n.t("shell:appShell.noUtilityRunnerCompletedTheReadOnlyUtility"),
      });
    };
    window.addEventListener(
      UTILITY_INFERENCE_NOTICE_EVENT,
      onUtilityInferenceNotice,
    );
    return () => {
      window.removeEventListener(
        UTILITY_INFERENCE_NOTICE_EVENT,
        onUtilityInferenceNotice,
      );
    };
  }, []);

  useEffect(() => {
    const unsubscribe =
      window.api?.localMcp?.subscribeWorkspaceInformationUpdates?.(
        (payload) => {
          applyExternalWorkspaceInformationUpdate(payload);
        },
      );
    return () => {
      unsubscribe?.();
    };
  }, [applyExternalWorkspaceInformationUpdate]);

  useEffect(() => {
    const unsubscribe = window.api?.window?.subscribeZoomChanges?.(
      ({ percent }) => {
        setZoomHudPercent(percent);
        if (zoomHudTimerRef.current !== null) {
          window.clearTimeout(zoomHudTimerRef.current);
        }
        zoomHudTimerRef.current = window.setTimeout(() => {
          setZoomHudPercent(null);
          zoomHudTimerRef.current = null;
        }, 1200);
      },
    );
    return () => {
      if (zoomHudTimerRef.current !== null) {
        window.clearTimeout(zoomHudTimerRef.current);
      }
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.api?.window?.subscribeCloseShortcut?.(() => {
      const store = useAppStore.getState();
      const { activeSurface, settings } = store;

      // Close the active pane tab with kind semantics (task close ≠ archive).
      const panelId = buildPanePanelId(activeSurface);
      if (store.paneTabMeta[panelId]?.pinned) {
        return;
      }
      if (!(activeSurface.kind === "task" && !activeSurface.taskId)) {
        closePaneSurface(activeSurface);
        return;
      }

      if (settings.confirmBeforeClose) {
        setShowCloseConfirm(true);
      } else {
        void window.api?.window?.close?.();
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.api?.window?.subscribeAppQuitRequested?.(() => {
      setQuittingApp(false);
      setShowQuitConfirm(true);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useAppKeybindings({
    onFocusFileSearch: handleFocusFileSearch,
    onOpenCommandPalette: handleOpenCommandPalette,
    onOpenExplorerSearch: handleOpenExplorerSearch,
    onOpenKeyboardShortcuts: handleOpenKeyboardShortcuts,
    onOpenSettings: handleOpenSettings,
    onKeyboardShortcutsRequested: handleKeyboardShortcutsRequested,
  });

  useEffect(
    () => () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const node = contentRowRef.current;
    if (!node) {
      return undefined;
    }

    const syncWidth = () => {
      const nextWidth = node.offsetWidth;
      setContentRowWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    };

    syncWidth();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => syncWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleOpenSettingsEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        repositoryPath?: string | null;
        section?: SectionId;
      }>;
      handleOpenSettings({
        repositoryPath: customEvent.detail?.repositoryPath ?? null,
        section: customEvent.detail?.section ?? "general",
      });
    };

    window.addEventListener(
      STAVE_OPEN_SETTINGS_EVENT,
      handleOpenSettingsEvent as EventListener,
    );
    return () => {
      window.removeEventListener(
        STAVE_OPEN_SETTINGS_EVENT,
        handleOpenSettingsEvent as EventListener,
      );
    };
  }, [handleOpenSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsLargeViewport(event.matches);
    };

    setIsLargeViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Prewarm Monaco off-screen at idle time so the first real editor open does
  // not block the main thread.
  const [monacoWarmupActive, setMonacoWarmupActive] = useState(false);
  const monacoWarmedRef = useRef(false);

  useEffect(() => {
    if (monacoWarmedRef.current) return;
    const win = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const schedule = win.requestIdleCallback
      ? (cb: () => void) => win.requestIdleCallback!(cb, { timeout: 3000 })
      : (cb: () => void) => window.setTimeout(cb, 600);
    const cancel = win.cancelIdleCallback
      ? (handle: number) => win.cancelIdleCallback!(handle)
      : (handle: number) => window.clearTimeout(handle);
    const handle = schedule(() => {
      if (monacoWarmedRef.current) return;
      setMonacoWarmupActive(true);
    });
    return () => cancel(handle);
  }, []);

  const handleMonacoWarmed = useCallback(() => {
    monacoWarmedRef.current = true;
    window.setTimeout(() => setMonacoWarmupActive(false), 200);
  }, []);

  const hasMeasuredContentRowWidth = contentRowWidth > 0;
  const canShowDesktopSidebar =
    !hasMeasuredContentRowWidth ||
    contentRowWidth >=
      MIN_CHAT_PANEL_WIDTH + MIN_EXPLORER_PANEL_WIDTH + PANEL_SEPARATOR_WIDTH;

  // On compact laptop widths, keep the center panel readable by moving the
  // right-side panel into the overlay instead of overflowing inline. The
  // editor-main / lens branches are gone: those surfaces are pane tabs now.
  let showDesktopSidebar = false;
  let showOverlayRightPanel = false;
  if (sidebarOverlayVisible) {
    if (isLargeViewport && canShowDesktopSidebar) {
      showDesktopSidebar = true;
    } else {
      showOverlayRightPanel = true;
    }
  }

  let desktopSidebarWidth = explorerPanelWidth;
  if (hasMeasuredContentRowWidth) {
    const maxSidebarWidth = Math.max(
      MIN_EXPLORER_PANEL_WIDTH,
      contentRowWidth - MIN_CHAT_PANEL_WIDTH - PANEL_SEPARATOR_WIDTH,
    );
    desktopSidebarWidth = Math.min(
      Math.max(explorerPanelWidth, MIN_EXPLORER_PANEL_WIDTH),
      maxSidebarWidth,
    );
  }
  const modifierLabel = useMemo<"Cmd" | "Ctrl">(
    () =>
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "Cmd"
        : "Ctrl",
    [],
  );
  const activeWorkspacePath =
    workspacePathById[activeWorkspaceId] ?? repositoryPath;
  const hasRepositoryContext = Boolean(repositoryPath?.trim());
  const activeWorkspaceName = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceId)
        ?.name ??
      workspaceBranchById[activeWorkspaceId] ??
      "workspace",
    [activeWorkspaceId, workspaceBranchById, workspaces],
  );
  const scriptsRevision = useScriptsCommandPaletteContributor(
    activeWorkspaceId && repositoryPath && activeWorkspacePath
      ? {
          workspaceId: activeWorkspaceId,
          repositoryPath,
          workspacePath: activeWorkspacePath,
          workspaceName: activeWorkspaceName,
          branch: workspaceBranchById[activeWorkspaceId] || activeWorkspaceName,
        }
      : null,
  );
  const activeWorkspaceIsDefault = Boolean(
    workspaceDefaultById[activeWorkspaceId],
  );
  const activeWorkspacePrStatus: WorkspacePrStatus =
    workspacePrInfoById[activeWorkspaceId]?.derived ?? "no_pr";
  const commandPaletteContext = useMemo(
    () => ({
      activeEditorTabId,
      activeTaskId,
      activeWorkspaceBranch: workspaceBranchById[activeWorkspaceId],
      activeWorkspaceIsDefault,
      activeWorkspacePrStatus,
      hasActiveTurn: Boolean(activeTaskId && activeTurnIdsByTask[activeTaskId]),
      layout: {
        sidebarOverlayTab,
        sidebarOverlayVisible,
        workspaceSidebarCollapsed,
      },
      modifierLabel,
      appShortcutKeys,
      preferences: {
        hiddenIds: commandPaletteHiddenCommandIds,
        pinnedIds: commandPalettePinnedCommandIds,
        recentIds: commandPaletteRecentCommandIds,
        showRecent: commandPaletteShowRecent,
      },
      repositoryPath,
      scriptsRevision,
      repositories: (() => {
        const remembered = recentRepositories.map((repository) => ({
          isCurrent: repository.repositoryPath === repositoryPath,
          repositoryName: repository.repositoryName,
          repositoryPath: repository.repositoryPath,
        }));
        if (
          !repositoryPath ||
          remembered.some((repository) => repository.repositoryPath === repositoryPath)
        ) {
          return remembered;
        }
        return [
          {
            isCurrent: true,
            repositoryName: repositoryName ?? i18n.t("shell:appShell.currentRepository"),
            repositoryPath,
          },
          ...remembered,
        ];
      })(),
      tasks: tasks.map((task) => ({
        id: task.id,
        isActive: task.id === activeTaskId,
        isResponding: Boolean(activeTurnIdsByTask[task.id]),
        provider: task.provider,
        title: task.title,
      })),
      workspacePath: activeWorkspacePath ?? null,
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        isActive: workspace.id === activeWorkspaceId,
        isDefault: Boolean(workspaceDefaultById[workspace.id]),
        name: workspace.name,
        branch: workspaceBranchById[workspace.id],
        path: workspacePathById[workspace.id],
      })),
      commands: {
        clearTaskSelection: () => clearTaskSelection(),
        createPullRequest: handleCreatePullRequest,
        createTask: () => createTask({ title: "" }),
        continueWorkspace: handleContinueWorkspace,
        focusFileSearch: handleFocusFileSearch,
        openExplorerSearch: handleOpenExplorerSearch,
        openLatestCompletedTurnTask: handleOpenLatestCompletedTurnTask,
        openLens: focusOrCreateLensSurface,
        openKickoff: () => void handleOpenKickoff(),
        openInTerminal: async (path: string) => {
          await window.api?.shell?.openInTerminal?.({ path });
        },
        openInGhostty: async (path: string) => {
          await window.api?.shell?.openInGhostty?.({ path });
        },
        openInVSCode: async (path: string) => {
          await window.api?.shell?.openInVSCode?.({ path });
        },
        openFleetView: () => openFleetView(),
        openGitGraph: focusOrCreateGitGraphSurface,
        openAutomationCenter: () => openAutomationCenter(),
        openIssues: () => openIssues(),
        openAgents: () => openAgents(),
        openAgentPerformance: () => openAgentPerformance(),
        openUsage: () => openUsage(),
        newAgent: () => {
          openAgents();
          useAgentsUiStore.getState().requestNewAgent();
        },
        startWorkWithAgent: () => {
          // With a task open, its composer's selector opens on Agents; otherwise Kickoff.
          const app = useAppStore.getState();
          if (app.activeTaskId && app.activeAppSurface.kind === "workspace") {
            useAgentsUiStore.getState().requestAgentSelector();
          } else {
            useAgentsUiStore.getState().openKickoffWithAgent();
          }
        },
        refreshTrackerIssues: () => refreshTrackerIssues().then(() => undefined),
        openKeyboardShortcuts: handleOpenKeyboardShortcuts,
        openRepository: (nextRepositoryPath: string) =>
          openRepository({ repositoryPath: nextRepositoryPath }),
        openSettings: handleOpenSettings,
        refreshRepositoryFiles: () => refreshRepositoryFiles(),
        refreshWorkspaces: () => refreshWorkspaces(),
        revealInFileManager: async (path: string) => {
          await window.api?.shell?.showInFinder?.({ path });
        },
        saveActiveEditor: () => saveActiveEditorTab().then(() => undefined),
        selectTask: (taskId: string) => selectTask({ taskId }),
        setTaskProvider: (taskId: string, provider: ProviderId) =>
          setTaskProvider({ taskId, provider }),
        startCompareRun: handleStartCompareRun,
        splitActivePanel: (direction: "right" | "below") =>
          paneHost.splitActivePanel(direction),
        showOverlayTab: (tab: RightRailPanelId) =>
          setLayout({
            patch: { sidebarOverlayVisible: true, sidebarOverlayTab: tab },
          }),
        stopActiveTurn: () => abortTaskTurn({ taskId: activeTaskId }),
        switchWorkspace: (workspaceId: string) =>
          switchWorkspace({ workspaceId }),
        toggleChangesPanel: () => {
          const currentLayout = useAppStore.getState().layout;
          const nextVisible = !(
            currentLayout.sidebarOverlayVisible &&
            currentLayout.sidebarOverlayTab === "changes"
          );
          setLayout({
            patch: {
              sidebarOverlayVisible: nextVisible,
              sidebarOverlayTab: "changes",
            },
          });
        },
        toggleEditor: () => {
          const editorTabId = useAppStore.getState().activeEditorTabId;
          if (editorTabId) {
            paneHost.openSurface({ kind: "editor", editorTabId });
          } else {
            handleFocusFileSearch();
          }
        },
        toggleInformationPanel: () => {
          const currentLayout = useAppStore.getState().layout;
          const nextVisible = !(
            currentLayout.sidebarOverlayVisible &&
            currentLayout.sidebarOverlayTab === "information"
          );
          setLayout({
            patch: {
              sidebarOverlayVisible: nextVisible,
              sidebarOverlayTab: "information",
            },
          });
        },
        toggleTerminal: () => paneHost.toggleTerminalGroup(),
        toggleWorkspaceSidebar: () =>
          setLayout({
            patch: {
              workspaceSidebarCollapsed:
                !useAppStore.getState().layout.workspaceSidebarCollapsed,
            },
          }),
      },
    }),
    [
      abortTaskTurn,
      activeEditorTabId,
      activeTaskId,
      activeWorkspaceId,
      activeWorkspaceIsDefault,
      activeWorkspacePrStatus,
      activeTurnIdsByTask,
      activeWorkspacePath,
      appShortcutKeys,
      clearTaskSelection,
      handleContinueWorkspace,
      handleCreatePullRequest,
      createTask,
      handleFocusFileSearch,
      handleOpenExplorerSearch,
      handleOpenKickoff,
      handleOpenLatestCompletedTurnTask,
      handleOpenKeyboardShortcuts,
      handleOpenSettings,
      modifierLabel,
      openFleetView,
      openAutomationCenter,
      openIssues,
      openAgents,
      openAgentPerformance,
      openUsage,
      handleStartCompareRun,
      openRepository,
      repositoryPath,
      repositoryName,
      recentRepositories,
      refreshRepositoryFiles,
      refreshWorkspaces,
      saveActiveEditorTab,
      scriptsRevision,
      selectTask,
      setLayout,
      setTaskProvider,
      commandPaletteHiddenCommandIds,
      commandPalettePinnedCommandIds,
      commandPaletteRecentCommandIds,
      commandPaletteShowRecent,
      sidebarOverlayVisible,
      sidebarOverlayTab,
      tasks,
      workspaceBranchById,
      workspaceDefaultById,
      workspacePathById,
      workspacePrInfoById,
      workspaceSidebarCollapsed,
      workspaces,
      switchWorkspace,
      i18n.language,
    ],
  );
  const showFleetView = activeAppSurface.kind === "fleet-view";
  const showAutomationCenter = activeAppSurface.kind === "automation-center";
  const showIssues = activeAppSurface.kind === "issues";
  const showAgents = activeAppSurface.kind === "agents";
  const showUsage = activeAppSurface.kind === "usage";
  const showWorkspaceSurface =
    !showFleetView && !showAutomationCenter && !showIssues && !showAgents && !showUsage;

  return (
    <div className={sx(appShellStyles.root)}>
      {zoomHudPercent !== null ? (
        <div className={sx(appShellStyles.zoomHud, layers.floatingChrome)}>
          <div className={sx(appShellStyles.zoomHudPill)}>{i18n.t("shell:appShell.zoomPercent", { percent: zoomHudPercent })}</div>
        </div>
      ) : null}
      <Toaster />
      <ConfirmDialog
        open={showCloseConfirm}
        title={i18n.t("shell:appShell.closeStave")}
        description={i18n.t("shell:appShell.areYouSureYouWantToClose")}
        confirmLabel={i18n.t("shell:appShell.close")}
        cancelLabel={i18n.t("shell:appShell.cancel")}
        onCancel={() => setShowCloseConfirm(false)}
        onConfirm={() => {
          setShowCloseConfirm(false);
          void window.api?.window?.close?.();
        }}
      />
      <QuitConfirmationDialog
        open={showQuitConfirm}
        quitting={quittingApp}
        shortcutLabel={window.api?.platform === "darwin" ? "Cmd+Q" : null}
        onCancel={() => {
          setQuittingApp(false);
          setShowQuitConfirm(false);
          void window.api?.window?.cancelAppQuit?.();
        }}
        onConfirm={() => {
          setQuittingApp(true);
          void window.api?.window
            ?.confirmAppQuit?.()
            .then((result) => {
              if (result?.ok) {
                return;
              }
              setQuittingApp(false);
              setShowQuitConfirm(false);
              toast.error(i18n.t("shell:appShell.unableToQuitStave"), {
                description: i18n.t("shell:appShell.theQuitRequestIsNoLongerPending"),
              });
            })
            .catch((error) => {
              setQuittingApp(false);
              toast.error(i18n.t("shell:appShell.unableToQuitStave"), {
                description:
                  error instanceof Error
                    ? error.message
                    : i18n.t("shell:appShell.theAppCouldNotConfirmTheQuit"),
              });
            });
        }}
      />
      <GlobalCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        runtimeContext={commandPaletteContext}
      />
      {shortcutsOpen ? (
        <Suspense
          fallback={<OverlayLoadingFallback title={i18n.t("shell:appShell.keyboardShortcuts")} />}
        >
          <KeyboardShortcutsDrawer
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />
        </Suspense>
      ) : null}
      {settingsOpen ? (
        <Suspense fallback={<OverlayLoadingFallback title={i18n.t("shell:appShell.settings")} />}>
          <SettingsDialog
            open={settingsOpen}
            initialSection={settingsInitialSection}
            initialRepositoryPath={settingsInitialRepositoryPath}
            onOpenChange={handleSettingsOpenChange}
          />
        </Suspense>
      ) : null}
      {kickoffOpen ? (
        <Suspense fallback={<OverlayLoadingFallback title={i18n.t("shell:appShell.kickoff")} />}>
          <KickoffDialog open={kickoffOpen} onOpenChange={setKickoffOpen} />
        </Suspense>
      ) : null}
      <div className={sx(appShellStyles.shellRow)}>
        <RenderProfiler id="RepositoryWorkspaceSidebar">
          <RepositoryWorkspaceSidebar
            width={Math.max(workspaceSidebarWidth, WORKSPACE_SIDEBAR_MIN_WIDTH)}
            collapsed={workspaceSidebarCollapsed}
            animate={!sidebarResizing}
            onOpenCommandPalette={handleOpenCommandPalette}
            onOpenKeyboardShortcuts={handleOpenKeyboardShortcuts}
            onOpenSettings={handleOpenSettings}
            onPreloadSettings={handlePreloadSettings}
            onKickoffWorkspace={(targetRepositoryPath) =>
              handleOpenKickoff(targetRepositoryPath)
            }
          />
        </RenderProfiler>
        {!workspaceSidebarCollapsed ? (
          <PanelResizeHandle
            width={Math.max(workspaceSidebarWidth, WORKSPACE_SIDEBAR_MIN_WIDTH)}
            clamp={(next) =>
              Math.max(
                WORKSPACE_SIDEBAR_MIN_WIDTH,
                Math.min(WORKSPACE_SIDEBAR_MAX_WIDTH, next),
              )
            }
            onResizeStart={() => setSidebarResizing(true)}
            onResize={(next) =>
              scheduleLayoutResizePatch("workspaceSidebarWidth", next)
            }
            onResizeEnd={() => {
              setSidebarResizing(false);
              flushPendingLayoutPatch();
            }}
            onReset={() =>
              setLayout({ patch: { workspaceSidebarWidth: DEFAULT_LAYOUT.workspaceSidebarWidth } })
            }
          />
        ) : null}
        <div
          className={sx(appShellStyles.appSurface)}
          data-stave-app-surface=""
        >
          {/*
            Keep Lens inside this stacking context. The app surface itself is
            z-10 at the document root; a body-level Lens root at the same layer
            paints behind its opaque background. Nested here, the guest stays
            above ordinary pane content while Lens chrome and shared overlays
            can still use the higher UI layer bands.
          */}
          <div
            id={LENS_SURFACE_ROOT_ID}
            className={sx(appShellStyles.lensSurfaceRoot, layers.lensSurface)}
          />
          <TopBar />
          <div
            ref={panelRowRef}
            className={sx(appShellStyles.panelRow)}
          >
            <div
              ref={contentRowRef}
              data-stave-content-row=""
              className={sx(appShellStyles.panelRow)}
            >
              <div className={sx(appShellStyles.mainColumn)}>
                {hasRepository && showWorkspaceSurface && showPresetBar ? (
                  <PresetBar />
                ) : null}
                <div className={sx(appShellStyles.mainSurface)}>
                  {showFleetView ? (
                    <FleetView />
                  ) : showAutomationCenter ? (
                    <AutomationCenterView />
                  ) : showAgents ? (
                    <AgentsView />
                  ) : activeAppSurface.kind === "usage" ? (
                    <UsageView key={`${activeAppSurface.providerId ?? "all"}:${activeAppSurface.accountProfileId ?? "all"}`}
                      initialProvider={activeAppSurface.providerId} initialAccount={activeAppSurface.accountProfileId} />
                  ) : showIssues ? (
                    <Suspense
                      fallback={
                        <div className={sx(appShellStyles.suspenseCenter)}>
                          {i18n.t("shell:appShell.loadingTasks")}
                        </div>
                      }
                    >
                      <IssuesView onClose={closeIssues} />
                    </Suspense>
                  ) : (
                    <div className={sx(appShellStyles.paneHostFrame)}>
                      <div
                        className={sx(appShellStyles.paneHostInert)}
                        inert={!hasRepositoryContext}
                        aria-hidden={!hasRepositoryContext || undefined}
                      >
                        <RenderProfiler id="WorkspacePaneHost" thresholdMs={10}>
                          <WorkspacePaneHost />
                        </RenderProfiler>
                      </div>
                      {!hasRepositoryContext ? <WorkspaceWelcome /> : null}
                    </div>
                  )}
                </div>
              </div>
              {showDesktopSidebar ? (
                <>
                  <PanelResizeHandle
                    width={desktopSidebarWidth}
                    grow="start"
                    clamp={(next) => {
                      const containerWidth =
                        contentRowRef.current?.offsetWidth ?? 9999;
                      const maxExplorer = Math.max(
                        MIN_EXPLORER_PANEL_WIDTH,
                        containerWidth - MIN_CHAT_PANEL_WIDTH - 1,
                      );
                      return Math.max(
                        MIN_EXPLORER_PANEL_WIDTH,
                        Math.min(maxExplorer, next),
                      );
                    }}
                    onResize={(next) =>
                      scheduleLayoutResizePatch("explorerPanelWidth", next)
                    }
                    onResizeEnd={flushPendingLayoutPatch}
                    onReset={() =>
                      setLayout({ patch: { explorerPanelWidth: DEFAULT_LAYOUT.explorerPanelWidth } })
                    }
                  />
                  <Suspense
                    fallback={
                      <aside
                        className={sx(appShellStyles.panelFallback)}
                        style={{ width: `${desktopSidebarWidth}px` }}
                      >
                        {i18n.t("shell:appShell.loadingPanel")}
                      </aside>
                    }
                  >
                    <div
                      className={sx(appShellStyles.desktopPanel)}
                      style={{ width: `${desktopSidebarWidth}px` }}
                    >
                      <RenderProfiler id="EditorPanel" thresholdMs={8}>
                        <EditorPanel onOpenSettings={handleOpenSettings} />
                      </RenderProfiler>
                    </div>
                  </Suspense>
                </>
              ) : null}
              {showOverlayRightPanel ? (
                <div className={sx(appShellStyles.overlayPanel)}>
                  <Suspense
                    fallback={
                      <aside className={sx(appShellStyles.panelFallbackFull)}>
                        {i18n.t("shell:appShell.loadingPanel")}
                      </aside>
                    }
                  >
                    <RenderProfiler id="EditorPanelMobile" thresholdMs={8}>
                      <EditorPanel onOpenSettings={handleOpenSettings} />
                    </RenderProfiler>
                  </Suspense>
                </div>
              ) : null}
            </div>
            <RightRail />
          </div>
        </div>
        {monacoWarmupActive && !activeEditorTabId ? (
          <EditorMonacoWarmup onReady={handleMonacoWarmed} />
        ) : null}
      </div>
      <StatusBar />
    </div>
  );
}
