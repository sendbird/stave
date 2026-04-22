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
import { GlobalCommandPalette } from "@/components/layout/GlobalCommandPalette";
import { StaveMuseWidget } from "@/components/layout/StaveMuseWidget";
import { resolveStaveMuseRightInset } from "@/components/layout/stave-muse-widget.utils";
import { TopBar } from "@/components/layout/TopBar";
import { ZenAppShellLayout } from "@/components/layout/ZenAppShellLayout";
import {
  COLLAPSED_PROJECT_SIDEBAR_WIDTH,
  ProjectWorkspaceSidebar,
} from "@/components/layout/ProjectWorkspaceSidebar";
import { PresetBar } from "@/components/layout/PresetBar";
import { WorkspaceTaskTabs } from "@/components/layout/WorkspaceTaskTabs";
import { CliSessionPanel } from "@/components/layout/CliSessionPanel";
import { resolveLatestCompletedTurnTarget } from "@/components/layout/command-palette-navigation";
import { dispatchTopBarPrAction } from "@/components/layout/top-bar-pr-events";
import { ChatArea } from "@/components/session/ChatArea";
import { TerminalDock } from "@/components/layout/TerminalDock";
import { Card, Toaster, toast } from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { QuitConfirmationDialog } from "@/components/layout/QuitConfirmationDialog";
import { listLatestWorkspaceTurns } from "@/lib/db/turns.db";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { isColiseumBranch, isTaskArchived } from "@/lib/tasks";
import { resolveTaskPresetShortcutSlot } from "@/lib/task-presets";
import { RenderProfiler } from "@/lib/render-profiler";
import {
  MIN_EDITOR_PANEL_WIDTH,
  STAVE_OPEN_SETTINGS_EVENT,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  useAppStore,
} from "@/store/app.store";
import { EditorMainPanel } from "@/components/layout/EditorMainPanel";
import { EditorMonacoWarmup } from "@/components/layout/editor-monaco-warmup";
import { RightRail } from "@/components/layout/RightRail";
import { dispatchExplorerSearchRequest } from "@/components/layout/explorer-search-events";
import {
  MIN_CHAT_PANEL_WIDTH,
  MIN_EXPLORER_PANEL_WIDTH,
  PANEL_SEPARATOR_WIDTH,
  clampPanelWidth,
  resolveDesktopRightPanelWidths,
} from "@/components/layout/app-shell-layout";
import {
  APP_SHORTCUT_CHORD_TIMEOUT_MS,
  isEditableShortcutTarget,
  isTerminalSurfaceTarget,
  resolveShortcutChord,
  shouldAbortTaskOnEscape,
  type PendingShortcutChord,
} from "@/components/layout/app-shell.shortcuts";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import type { RightRailPanelId } from "@/lib/right-rail-panels";
import type { WorkspacePrStatus } from "@/lib/pr-status";

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

type ResizableLayoutKey =
  | "workspaceSidebarWidth"
  | "editorPanelWidth"
  | "explorerPanelWidth"
  | "terminalDockHeight";

const WORKSPACE_SIDEBAR_MAX_WIDTH = 340;

export function AppShell() {
  const [
    projectPath,
    projectName,
    tasks,
    activeTaskId,
    activeSurface,
    cliSessionTabs,
    activeTurnIdsByTask,
    workspaces,
    activeWorkspaceId,
    workspaceBranchById,
    workspaceDefaultById,
    workspacePathById,
    workspacePrInfoById,
    recentProjects,
    workspaceSidebarWidth,
    workspaceSidebarCollapsed,
    editorVisible,
    editorPanelWidth,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    explorerPanelWidth,
    terminalDocked,
    terminalDockHeight,
    activeEditorTabId,
    appShellMode,
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
    refreshProjectFiles,
    refreshWorkspaces,
    openProject,
    switchWorkspace,
    abortTaskTurn,
    focusStaveMuse,
    setLayout,
    applyExternalWorkspaceInformationUpdate,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.projectName,
          state.tasks,
          state.activeTaskId,
          state.activeSurface,
          state.cliSessionTabs,
          state.activeTurnIdsByTask,
          state.workspaces,
          state.activeWorkspaceId,
          state.workspaceBranchById,
          state.workspaceDefaultById,
          state.workspacePathById,
          state.workspacePrInfoById,
          state.recentProjects,
          state.layout.workspaceSidebarWidth,
          state.layout.workspaceSidebarCollapsed,
          state.layout.editorVisible,
          state.layout.editorPanelWidth,
          state.layout.sidebarOverlayVisible,
          state.layout.sidebarOverlayTab,
          state.layout.explorerPanelWidth,
          state.layout.terminalDocked,
          state.layout.terminalDockHeight ?? 210,
          state.activeEditorTabId,
          state.settings.appShellMode,
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
          state.refreshProjectFiles,
          state.refreshWorkspaces,
          state.openProject,
          state.switchWorkspace,
          state.abortTaskTurn,
          state.focusStaveMuse,
          state.setLayout,
          state.applyExternalWorkspaceInformationUpdate,
        ] as const,
    ),
  );
  const showPresetBar = useAppStore((state) => state.settings.showPresetBar);
  const zenMode = appShellMode === "zen";
  const hasProject = Boolean(projectPath);
  const panelRowRef = useRef<HTMLDivElement>(null);
  const contentRowRef = useRef<HTMLDivElement>(null);
  const pendingLayoutPatchRef = useRef<Partial<
    Record<ResizableLayoutKey, number>
  > | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [zoomHudPercent, setZoomHudPercent] = useState<number | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SectionId>("general");
  const [settingsInitialProjectPath, setSettingsInitialProjectPath] = useState<
    string | null
  >(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [contentRowWidth, setContentRowWidth] = useState(0);
  const [isLargeViewport, setIsLargeViewport] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 1024px)").matches,
  );
  const zoomHudTimerRef = useRef<number | null>(null);
  const pendingShortcutChordRef = useRef<PendingShortcutChord | null>(null);
  const pendingShortcutChordTimerRef = useRef<number | null>(null);
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
    (options?: { projectPath?: string | null; section?: SectionId }) => {
      handlePreloadSettings();
      setSettingsInitialSection(options?.section ?? "general");
      setSettingsInitialProjectPath(options?.projectPath ?? null);
      setSettingsOpen(true);
    },
    [handlePreloadSettings],
  );
  const handleSettingsOpenChange = useCallback((options: { open: boolean }) => {
    setSettingsOpen(options.open);
    if (!options.open) {
      setSettingsInitialSection("general");
      setSettingsInitialProjectPath(null);
    }
  }, []);
  const handlePreloadKeyboardShortcuts = useCallback(() => {
    void loadKeyboardShortcutsDrawer();
  }, []);
  const handleOpenKeyboardShortcuts = useCallback(() => {
    handlePreloadKeyboardShortcuts();
    setShortcutsOpen(true);
  }, [handlePreloadKeyboardShortcuts]);
  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);
  const handleOpenExplorerSearch = useCallback(() => {
    const store = useAppStore.getState();
    const searchRootPath =
      store.workspacePathById[store.activeWorkspaceId] ?? store.projectPath;
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
  const handleOpenStaveMuse = useCallback(() => {
    focusStaveMuse();
  }, [focusStaveMuse]);
  const handleCreatePullRequest = useCallback(() => {
    dispatchTopBarPrAction("create-pr");
  }, []);
  const handleContinueWorkspace = useCallback(() => {
    dispatchTopBarPrAction("continue");
  }, []);
  const handleToggleZenMode = useCallback(() => {
    const store = useAppStore.getState();
    store.updateSettings({
      patch: {
        appShellMode: store.settings.appShellMode === "zen" ? "stave" : "zen",
      },
    });
  }, []);
  const handleOpenLatestCompletedTurnTask = useCallback(async () => {
    const stateBefore = useAppStore.getState();
    if (stateBefore.workspaces.length === 0) {
      toast.message("No workspaces available");
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
        toast.message("No completed turns yet");
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
        toast.error("Unable to open the latest completed task", {
          description:
            "The task for the newest completed turn is no longer available.",
        });
        return;
      }

      if (isTaskArchived(targetTask)) {
        stateAfter.restoreTask({ taskId: latestTarget.taskId });
        return;
      }

      stateAfter.selectTask({ taskId: latestTarget.taskId });
    } catch (error) {
      toast.error("Unable to find the latest completed turn", {
        description:
          error instanceof Error
            ? error.message
            : "Turn history could not be loaded.",
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

  function scheduleLayoutResizePatch(key: ResizableLayoutKey, value: number) {
    pendingLayoutPatchRef.current = {
      ...(pendingLayoutPatchRef.current ?? {}),
      [key]: value,
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

  function OverlayLoadingFallback(args: { title: string }) {
    return (
      <div
        className={`${UI_LAYER_CLASS.dialog} fixed inset-0 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]`}
      >
        <Card className="w-full max-w-md border-border/80 bg-background/95 p-6 shadow-2xl">
          <div className="text-sm text-muted-foreground">
            Loading {args.title.toLowerCase()}
            ...
          </div>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void useAppStore.getState().checkOpenTabConflicts();
    }, 5000);

    return () => window.clearInterval(timer);
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
      const {
        editorTabs,
        activeEditorTabId,
        activeTaskId,
        activeSurface,
        activeCliSessionTabId,
        settings,
      } = store;

      if (activeEditorTabId && editorTabs.length > 0) {
        store.requestCloseActiveEditorTab();
        return;
      }

      if (activeSurface.kind === "cli-session" && activeCliSessionTabId) {
        const tab = store.cliSessionTabs.find(
          (t) => t.id === activeCliSessionTabId,
        );
        if (tab) {
          window.dispatchEvent(
            new CustomEvent("stave:request-close-cli-session", {
              detail: { id: tab.id, title: tab.title },
            }),
          );
        }
        return;
      }

      if (activeTaskId) {
        store.archiveTask({ taskId: activeTaskId });
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

  useEffect(() => {
    const clearPendingShortcutChord = () => {
      pendingShortcutChordRef.current = null;
      if (pendingShortcutChordTimerRef.current !== null) {
        window.clearTimeout(pendingShortcutChordTimerRef.current);
        pendingShortcutChordTimerRef.current = null;
      }
    };

    const setPendingShortcutChord = (
      nextPendingChord: PendingShortcutChord | null,
    ) => {
      clearPendingShortcutChord();
      pendingShortcutChordRef.current = nextPendingChord;
      if (!nextPendingChord) {
        return;
      }
      pendingShortcutChordTimerRef.current = window.setTimeout(() => {
        pendingShortcutChordRef.current = null;
        pendingShortcutChordTimerRef.current = null;
      }, APP_SHORTCUT_CHORD_TIMEOUT_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const store = useAppStore.getState();
      const hasMod = event.ctrlKey || event.metaKey;
      const shortcutChord = resolveShortcutChord({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        pendingChord: pendingShortcutChordRef.current,
        shortcutKeys: store.settings.appShortcutKeys,
      });

      if (shortcutChord.nextPendingChord !== pendingShortcutChordRef.current) {
        setPendingShortcutChord(shortcutChord.nextPendingChord);
      }

      if (shortcutChord.preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }

      switch (shortcutChord.action) {
        case "view.toggle-zen-mode":
          handleToggleZenMode();
          return;
        case "navigation.home":
          store.clearTaskSelection();
          return;
        case "navigation.open-stave-muse":
          handleOpenStaveMuse();
          return;
        case "view.toggle-workspace-sidebar":
          store.setLayout({
            patch: {
              workspaceSidebarCollapsed:
                !store.layout.workspaceSidebarCollapsed,
            },
          });
          return;
        case "view.toggle-changes-panel": {
          const nextVisible = !(
            store.layout.sidebarOverlayVisible &&
            store.layout.sidebarOverlayTab === "changes"
          );
          store.setLayout({
            patch: {
              sidebarOverlayVisible: nextVisible,
              sidebarOverlayTab: "changes",
            },
          });
          return;
        }
        case "view.show-explorer": {
          const nextVisible = !(
            store.layout.sidebarOverlayVisible &&
            store.layout.sidebarOverlayTab === "explorer"
          );
          store.setLayout({
            patch: {
              sidebarOverlayVisible: nextVisible,
              sidebarOverlayTab: "explorer",
            },
          });
          return;
        }
        case "view.show-information": {
          const nextVisible = !(
            store.layout.sidebarOverlayVisible &&
            store.layout.sidebarOverlayTab === "information"
          );
          store.setLayout({
            patch: {
              sidebarOverlayVisible: nextVisible,
              sidebarOverlayTab: "information",
            },
          });
          return;
        }
        case "view.show-scripts": {
          const nextVisible = !(
            store.layout.sidebarOverlayVisible &&
            store.layout.sidebarOverlayTab === "scripts"
          );
          store.setLayout({
            patch: {
              sidebarOverlayVisible: nextVisible,
              sidebarOverlayTab: "scripts",
            },
          });
          return;
        }
        case "view.show-lens": {
          const nextVisible = !(
            store.layout.sidebarOverlayVisible &&
            store.layout.sidebarOverlayTab === "lens"
          );
          store.setLayout({
            patch: {
              sidebarOverlayVisible: nextVisible,
              sidebarOverlayTab: "lens",
            },
          });
          return;
        }
        case "view.toggle-editor":
          store.setLayout({
            patch: { editorVisible: !store.layout.editorVisible },
          });
          return;
        case "view.toggle-terminal":
          store.setLayout({
            patch: { terminalDocked: !store.layout.terminalDocked },
          });
          return;
        default:
          break;
      }

      if (shortcutChord.stopAppHandling) {
        return;
      }

      const presetShortcutSlot = resolveTaskPresetShortcutSlot({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
      if (presetShortcutSlot !== null) {
        const preset = store.settings.taskPresets[presetShortcutSlot] ?? null;
        if (preset) {
          event.preventDefault();
          event.stopPropagation();
          store.applyTaskPreset({ presetId: preset.id });
          return;
        }
      }

      if (
        hasMod &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        if (!store.projectPath?.trim()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        handleFocusFileSearch();
        return;
      }

      if (
        hasMod &&
        !event.altKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        event.stopPropagation();
        handleOpenExplorerSearch();
        return;
      }

      if (
        hasMod &&
        !event.altKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        event.stopPropagation();
        handleOpenCommandPalette();
        return;
      }

      if (hasMod && !event.altKey && !event.shiftKey && event.key === ",") {
        event.preventDefault();
        event.stopPropagation();
        handleOpenSettings();
        return;
      }

      // When focus is inside a terminal surface (xterm creates an internal
      // <textarea> that matches the editable selector), skip the editable-
      // target guard so Cmd-based app shortcuts still work. Only block
      // Ctrl+<key> combos that belong to the shell (Ctrl+C, Ctrl+A, etc.).
      const inTerminalSurface = isTerminalSurfaceTarget(event.target);

      if (isEditableShortcutTarget(event.target) && !inTerminalSurface) {
        return;
      }

      if (inTerminalSurface && event.ctrlKey && !event.metaKey) {
        return;
      }

      if (!hasMod) {
        const activeElement =
          typeof document === "undefined" ? null : document.activeElement;
        if (
          shouldAbortTaskOnEscape({
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            target: event.target,
            activeElement,
          })
        ) {
          store.abortTaskTurn({ taskId: store.activeTaskId });
        }
        return;
      }

      if (event.code === "Slash" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        handleOpenKeyboardShortcuts();
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        event.stopPropagation();
        store.createTask({ title: "" });
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void store.saveActiveEditorTab();
        return;
      }

      if (
        event.shiftKey &&
        (event.key.toLowerCase() === "j" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        const currentIndex = store.tasks.findIndex(
          (task) => task.id === store.activeTaskId,
        );
        const nextIndex =
          currentIndex >= 0
            ? Math.min(store.tasks.length - 1, currentIndex + 1)
            : 0;
        const nextTaskId = store.tasks[nextIndex]?.id;
        if (nextTaskId) {
          store.selectTask({ taskId: nextTaskId });
        }
        return;
      }

      if (
        event.shiftKey &&
        (event.key.toLowerCase() === "k" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        const currentIndex = store.tasks.findIndex(
          (task) => task.id === store.activeTaskId,
        );
        const prevIndex = currentIndex >= 0 ? Math.max(0, currentIndex - 1) : 0;
        const prevTaskId = store.tasks[prevIndex]?.id;
        if (prevTaskId) {
          store.selectTask({ taskId: prevTaskId });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPendingShortcutChord();
    };
  }, [
    handleFocusFileSearch,
    handleOpenCommandPalette,
    handleOpenExplorerSearch,
    handleOpenKeyboardShortcuts,
    handleToggleZenMode,
  ]);

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
        projectPath?: string | null;
        section?: SectionId;
      }>;
      handleOpenSettings({
        projectPath: customEvent.detail?.projectPath ?? null,
        section: customEvent.detail?.section ?? "muse",
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

  useEffect(() => {
    if (!isLargeViewport && editorVisible && sidebarOverlayVisible) {
      setLayout({ patch: { sidebarOverlayVisible: false } });
    }
  }, [editorVisible, isLargeViewport, setLayout, sidebarOverlayVisible]);

  // Prewarm Monaco off-screen at idle time so the first real editor open does
  // not block the main thread. If the editor panel is already visible, Monaco
  // is mounting anyway and no separate warmup is needed.
  const [monacoWarmupActive, setMonacoWarmupActive] = useState(false);
  const monacoWarmedRef = useRef(false);

  useEffect(() => {
    if (monacoWarmedRef.current) return;
    if (editorVisible) {
      monacoWarmedRef.current = true;
      return;
    }
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
  }, [editorVisible]);

  const handleMonacoWarmed = useCallback(() => {
    monacoWarmedRef.current = true;
    window.setTimeout(() => setMonacoWarmupActive(false), 200);
  }, []);

  const hasMeasuredContentRowWidth = contentRowWidth > 0;
  const canShowDesktopEditor =
    !hasMeasuredContentRowWidth ||
    contentRowWidth >=
      MIN_CHAT_PANEL_WIDTH + MIN_EDITOR_PANEL_WIDTH + PANEL_SEPARATOR_WIDTH;
  const canShowDesktopSidebar =
    !hasMeasuredContentRowWidth ||
    contentRowWidth >=
      MIN_CHAT_PANEL_WIDTH + MIN_EXPLORER_PANEL_WIDTH + PANEL_SEPARATOR_WIDTH;
  const canShowDesktopEditorAndSidebar =
    !hasMeasuredContentRowWidth ||
    contentRowWidth >=
      MIN_CHAT_PANEL_WIDTH +
        MIN_EDITOR_PANEL_WIDTH +
        MIN_EXPLORER_PANEL_WIDTH +
        PANEL_SEPARATOR_WIDTH * 2;

  let showDesktopEditor = false;
  let showDesktopSidebar = false;
  let overlayRightPanelMode: "editor" | "sidebar" | null = null;

  // On compact laptop widths, keep the center panel readable by moving the
  // secondary right-side panel into the overlay instead of overflowing inline.
  if (!isLargeViewport) {
    overlayRightPanelMode = editorVisible
      ? "editor"
      : sidebarOverlayVisible
        ? "sidebar"
        : null;
  } else if (editorVisible && sidebarOverlayVisible) {
    if (canShowDesktopEditorAndSidebar) {
      showDesktopEditor = true;
      showDesktopSidebar = true;
    } else if (canShowDesktopEditor) {
      showDesktopEditor = true;
      overlayRightPanelMode = "sidebar";
    } else if (canShowDesktopSidebar) {
      showDesktopSidebar = true;
      overlayRightPanelMode = "editor";
    } else {
      overlayRightPanelMode = "editor";
    }
  } else if (editorVisible) {
    if (canShowDesktopEditor) {
      showDesktopEditor = true;
    } else {
      overlayRightPanelMode = "editor";
    }
  } else if (sidebarOverlayVisible) {
    if (canShowDesktopSidebar) {
      showDesktopSidebar = true;
    } else {
      overlayRightPanelMode = "sidebar";
    }
  }

  let desktopEditorWidth = editorPanelWidth;
  let desktopSidebarWidth = explorerPanelWidth;

  if (hasMeasuredContentRowWidth) {
    ({ desktopEditorWidth, desktopSidebarWidth } =
      resolveDesktopRightPanelWidths({
        contentRowWidth,
        preferredEditorWidth: editorPanelWidth,
        preferredSidebarWidth: explorerPanelWidth,
        showDesktopEditor,
        showDesktopSidebar,
      }));
  }

  if (zenMode) {
    showDesktopEditor = false;
    showDesktopSidebar = false;
    overlayRightPanelMode = null;
  }

  const showOverlayRightPanel = overlayRightPanelMode !== null;
  const modifierLabel = useMemo<"Cmd" | "Ctrl">(
    () =>
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "Cmd"
        : "Ctrl",
    [],
  );
  const activeWorkspacePath =
    workspacePathById[activeWorkspaceId] ?? projectPath;
  const hasProjectContext = Boolean(projectPath?.trim());
  const museLeftInset = isLargeViewport
    ? (workspaceSidebarCollapsed
        ? COLLAPSED_PROJECT_SIDEBAR_WIDTH
        : Math.max(workspaceSidebarWidth, WORKSPACE_SIDEBAR_MIN_WIDTH)) + 12
    : undefined;
  const museRightInset = resolveStaveMuseRightInset({
    hasProjectContext,
    isLargeViewport,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    showDesktopSidebar,
    desktopSidebarWidth,
    overlayRightPanelMode,
    viewportWidth: typeof window === "undefined" ? 1440 : window.innerWidth,
  });
  const activeWorkspaceIsDefault = Boolean(
    workspaceDefaultById[activeWorkspaceId],
  );
  const activeWorkspacePrStatus: WorkspacePrStatus =
    workspacePrInfoById[activeWorkspaceId]?.derived ?? "no_pr";
  const hasBlockingOverlayOpen =
    showCloseConfirm ||
    showQuitConfirm ||
    commandPaletteOpen ||
    settingsOpen ||
    shortcutsOpen;
  const commandPaletteContext = useMemo(
    () => ({
      activeEditorTabId,
      activeTaskId,
      activeWorkspaceBranch: workspaceBranchById[activeWorkspaceId],
      activeWorkspaceIsDefault,
      activeWorkspacePrStatus,
      hasActiveTurn: Boolean(activeTaskId && activeTurnIdsByTask[activeTaskId]),
      layout: {
        editorVisible,
        sidebarOverlayTab,
        sidebarOverlayVisible,
        terminalDocked,
        workspaceSidebarCollapsed,
        zenMode,
      },
      modifierLabel,
      appShortcutKeys,
      preferences: {
        hiddenIds: commandPaletteHiddenCommandIds,
        pinnedIds: commandPalettePinnedCommandIds,
        recentIds: commandPaletteRecentCommandIds,
        showRecent: commandPaletteShowRecent,
      },
      projectPath,
      projects: (() => {
        const remembered = recentProjects.map((project) => ({
          isCurrent: project.projectPath === projectPath,
          projectName: project.projectName,
          projectPath: project.projectPath,
        }));
        if (
          !projectPath ||
          remembered.some((project) => project.projectPath === projectPath)
        ) {
          return remembered;
        }
        return [
          {
            isCurrent: true,
            projectName: projectName ?? "Current project",
            projectPath,
          },
          ...remembered,
        ];
      })(),
      tasks: tasks
        // Coliseum branches are ephemeral fan-out children — never expose
        // them as individually switchable tasks in the command palette.
        .filter((task) => !isColiseumBranch(task))
        .map((task) => ({
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
        openStaveMuse: handleOpenStaveMuse,
        openLatestCompletedTurnTask: handleOpenLatestCompletedTurnTask,
        openInTerminal: async (path: string) => {
          await window.api?.shell?.openInTerminal?.({ path });
        },
        openInGhostty: async (path: string) => {
          await window.api?.shell?.openInGhostty?.({ path });
        },
        openInVSCode: async (path: string) => {
          await window.api?.shell?.openInVSCode?.({ path });
        },
        openKeyboardShortcuts: handleOpenKeyboardShortcuts,
        openProject: (nextProjectPath: string) =>
          openProject({ projectPath: nextProjectPath }),
        openSettings: handleOpenSettings,
        refreshProjectFiles: () => refreshProjectFiles(),
        refreshWorkspaces: () => refreshWorkspaces(),
        revealInFileManager: async (path: string) => {
          await window.api?.shell?.showInFinder?.({ path });
        },
        saveActiveEditor: () => saveActiveEditorTab().then(() => undefined),
        selectTask: (taskId: string) => selectTask({ taskId }),
        setTaskProvider: (
          taskId: string,
          provider: "claude-code" | "codex" | "stave",
        ) => setTaskProvider({ taskId, provider }),
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
        toggleEditor: () =>
          setLayout({
            patch: {
              editorVisible: !useAppStore.getState().layout.editorVisible,
            },
          }),
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
        toggleTerminal: () =>
          setLayout({
            patch: {
              terminalDocked: !useAppStore.getState().layout.terminalDocked,
            },
          }),
        toggleZenMode: handleToggleZenMode,
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
      editorVisible,
      handleFocusFileSearch,
      handleOpenExplorerSearch,
      handleOpenStaveMuse,
      handleOpenLatestCompletedTurnTask,
      handleOpenKeyboardShortcuts,
      handleOpenSettings,
      modifierLabel,
      openProject,
      projectPath,
      projectName,
      recentProjects,
      refreshProjectFiles,
      refreshWorkspaces,
      saveActiveEditorTab,
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
      terminalDocked,
      zenMode,
      workspaceBranchById,
      workspaceDefaultById,
      workspacePathById,
      workspacePrInfoById,
      workspaceSidebarCollapsed,
      workspaces,
      switchWorkspace,
      handleToggleZenMode,
    ],
  );
  const showCliSurface =
    activeSurface.kind === "cli-session" &&
    cliSessionTabs.some((tab) => tab.id === activeSurface.cliSessionTabId);

  return (
    <div className="relative flex h-full w-full bg-background text-foreground">
      {zoomHudPercent !== null ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-16 ${UI_LAYER_CLASS.floatingChrome} -translate-x-1/2`}
        >
          <div className="rounded-full border border-border/80 bg-card/95 px-3 py-1 text-sm font-medium text-foreground shadow-lg backdrop-blur-sm">
            Zoom {zoomHudPercent}%
          </div>
        </div>
      ) : null}
      <Toaster />
      <ConfirmDialog
        open={showCloseConfirm}
        title="Close Stave?"
        description="Are you sure you want to close the application window?"
        confirmLabel="Close"
        cancelLabel="Cancel"
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
              toast.error("Unable to quit Stave", {
                description: "The quit request is no longer pending.",
              });
            })
            .catch((error) => {
              setQuittingApp(false);
              toast.error("Unable to quit Stave", {
                description:
                  error instanceof Error
                    ? error.message
                    : "The app could not confirm the quit request.",
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
          fallback={<OverlayLoadingFallback title="Keyboard Shortcuts" />}
        >
          <KeyboardShortcutsDrawer
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />
        </Suspense>
      ) : null}
      {settingsOpen ? (
        <Suspense fallback={<OverlayLoadingFallback title="Settings" />}>
          <SettingsDialog
            open={settingsOpen}
            initialSection={settingsInitialSection}
            initialProjectPath={settingsInitialProjectPath}
            onOpenChange={handleSettingsOpenChange}
          />
        </Suspense>
      ) : null}
      {zenMode ? (
        <ZenAppShellLayout />
      ) : (
        <>
          <RenderProfiler id="ProjectWorkspaceSidebar">
            <ProjectWorkspaceSidebar
              width={Math.max(
                workspaceSidebarWidth,
                WORKSPACE_SIDEBAR_MIN_WIDTH,
              )}
              collapsed={workspaceSidebarCollapsed}
              animate={!sidebarResizing}
              onOpenCommandPalette={handleOpenCommandPalette}
              onOpenKeyboardShortcuts={handleOpenKeyboardShortcuts}
              onOpenSettings={handleOpenSettings}
              onPreloadSettings={handlePreloadSettings}
            />
          </RenderProfiler>
          {!workspaceSidebarCollapsed ? (
            <div
              className={`group relative hidden w-[9px] -mx-[4px] ${UI_LAYER_CLASS.resizer} shrink-0 cursor-col-resize lg:block`}
              onMouseDown={(event) => {
                event.preventDefault();
                setSidebarResizing(true);
                const startX = event.clientX;
                const startWidth = Math.max(
                  workspaceSidebarWidth,
                  WORKSPACE_SIDEBAR_MIN_WIDTH,
                );
                const onMove = (moveEvent: MouseEvent) => {
                  const next = Math.max(
                    WORKSPACE_SIDEBAR_MIN_WIDTH,
                    Math.min(
                      WORKSPACE_SIDEBAR_MAX_WIDTH,
                      startWidth + (moveEvent.clientX - startX),
                    ),
                  );
                  scheduleLayoutResizePatch("workspaceSidebarWidth", next);
                };
                const onUp = () => {
                  setSidebarResizing(false);
                  flushPendingLayoutPatch();
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/40 transition-colors group-hover:bg-primary/50 group-active:bg-primary/70" />
            </div>
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar />
            <div
              ref={panelRowRef}
              className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
            >
              <div
                ref={contentRowRef}
                className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
              >
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  {hasProject ? <WorkspaceTaskTabs /> : null}
                  {hasProject && showPresetBar ? <PresetBar /> : null}
                  <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                        <div className="min-h-0 min-w-0 flex-1 sm:min-w-[420px]">
                          <div
                            className={
                              showCliSurface ? "hidden h-full" : "h-full"
                            }
                          >
                            <ChatArea />
                          </div>
                          <CliSessionPanel />
                        </div>
                      </div>
                      <div className={terminalDocked ? undefined : "hidden"}>
                        <div
                          className={`group relative ${UI_LAYER_CLASS.resizer} h-[9px] -my-[4px] shrink-0 cursor-row-resize`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            const startY = event.clientY;
                            const startHeight = terminalDockHeight;
                            const onMove = (moveEvent: MouseEvent) => {
                              const delta = startY - moveEvent.clientY;
                              const next = Math.max(
                                120,
                                Math.min(420, startHeight + delta),
                              );
                              scheduleLayoutResizePatch(
                                "terminalDockHeight",
                                next,
                              );
                            };
                            const onUp = () => {
                              flushPendingLayoutPatch();
                              window.removeEventListener("mousemove", onMove);
                              window.removeEventListener("mouseup", onUp);
                            };
                            window.addEventListener("mousemove", onMove);
                            window.addEventListener("mouseup", onUp);
                          }}
                        >
                          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/40 transition-colors group-hover:bg-primary/50 group-active:bg-primary/70" />
                        </div>
                        <TerminalDock />
                      </div>
                    </div>
                  </div>
                </div>
                {showDesktopEditor ? (
                  <>
                    <div
                      className={`group relative hidden w-[9px] -mx-[4px] ${UI_LAYER_CLASS.resizer} shrink-0 cursor-col-resize lg:block`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const startX = event.clientX;
                        const startWidth = desktopEditorWidth;
                        const onMove = (moveEvent: MouseEvent) => {
                          const containerWidth =
                            contentRowRef.current?.offsetWidth ?? 9999;
                          const explorerWidth = showDesktopSidebar
                            ? desktopSidebarWidth
                            : 0;
                          const separators = showDesktopSidebar ? 2 : 1;
                          const maxEditor = Math.max(
                            MIN_EDITOR_PANEL_WIDTH,
                            containerWidth -
                              MIN_CHAT_PANEL_WIDTH -
                              explorerWidth -
                              separators,
                          );
                          const minEditor = Math.min(
                            MIN_EDITOR_PANEL_WIDTH,
                            maxEditor,
                          );
                          const delta = startX - moveEvent.clientX;
                          const next = Math.max(
                            minEditor,
                            Math.min(maxEditor, startWidth + delta),
                          );
                          scheduleLayoutResizePatch("editorPanelWidth", next);
                        };
                        const onUp = () => {
                          flushPendingLayoutPatch();
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    >
                      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/40 transition-colors group-hover:bg-primary/50 group-active:bg-primary/70" />
                    </div>
                    <div
                      className="hidden min-h-0 min-w-0 lg:block"
                      style={{ width: `${desktopEditorWidth}px` }}
                    >
                      <RenderProfiler id="EditorMainPanel" thresholdMs={10}>
                        <EditorMainPanel />
                      </RenderProfiler>
                    </div>
                  </>
                ) : null}
                {showDesktopSidebar ? (
                  <>
                    <div
                      className={`group relative hidden w-[9px] -mx-[4px] ${UI_LAYER_CLASS.resizer} shrink-0 cursor-col-resize lg:block`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const startX = event.clientX;
                        const startWidth = desktopSidebarWidth;
                        const onMove = (moveEvent: MouseEvent) => {
                          const containerWidth =
                            contentRowRef.current?.offsetWidth ?? 9999;
                          const editorWidth = showDesktopEditor
                            ? desktopEditorWidth
                            : 0;
                          const separators = showDesktopEditor ? 2 : 1;
                          const maxExplorer = Math.max(
                            MIN_EXPLORER_PANEL_WIDTH,
                            containerWidth -
                              MIN_CHAT_PANEL_WIDTH -
                              editorWidth -
                              separators,
                          );
                          const delta = startX - moveEvent.clientX;
                          const next = Math.max(
                            MIN_EXPLORER_PANEL_WIDTH,
                            Math.min(maxExplorer, startWidth + delta),
                          );
                          scheduleLayoutResizePatch("explorerPanelWidth", next);
                        };
                        const onUp = () => {
                          flushPendingLayoutPatch();
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    >
                      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/40 transition-colors group-hover:bg-primary/50 group-active:bg-primary/70" />
                    </div>
                    <Suspense
                      fallback={
                        <aside
                          className="bg-card p-3 text-sm text-muted-foreground"
                          style={{ width: `${desktopSidebarWidth}px` }}
                        >
                          Loading panel...
                        </aside>
                      }
                    >
                      <div
                        className="hidden min-h-0 min-w-0 lg:block"
                        style={{ width: `${desktopSidebarWidth}px` }}
                      >
                        <RenderProfiler id="EditorPanel" thresholdMs={8}>
                          <EditorPanel
                            onOpenSettings={handleOpenSettings}
                            lensOccluded={hasBlockingOverlayOpen}
                          />
                        </RenderProfiler>
                      </div>
                    </Suspense>
                  </>
                ) : null}
                {showOverlayRightPanel ? (
                  <div className="min-h-0 min-w-0 w-[min(22rem,56vw)] max-w-[22rem] border-l border-border/40">
                    {overlayRightPanelMode === "editor" ? (
                      <RenderProfiler
                        id="EditorMainPanelMobile"
                        thresholdMs={10}
                      >
                        <EditorMainPanel />
                      </RenderProfiler>
                    ) : (
                      <Suspense
                        fallback={
                          <aside className="h-full bg-card p-3 text-sm text-muted-foreground">
                            Loading panel...
                          </aside>
                        }
                      >
                        <RenderProfiler id="EditorPanelMobile" thresholdMs={8}>
                          <EditorPanel
                            onOpenSettings={handleOpenSettings}
                            lensOccluded={hasBlockingOverlayOpen}
                          />
                        </RenderProfiler>
                      </Suspense>
                    )}
                  </div>
                ) : null}
              </div>
              <RightRail />
            </div>
          </div>
          <StaveMuseWidget
            leftInset={museLeftInset}
            rightInset={museRightInset}
            showFloatingTrigger={!isLargeViewport}
          />
          {monacoWarmupActive && !editorVisible ? (
            <EditorMonacoWarmup onReady={handleMonacoWarmed} />
          ) : null}
        </>
      )}
    </div>
  );
}
