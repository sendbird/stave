import { useEffect, useRef } from "react";
import {
  dispatchAppKeybinding,
  type AppKeybindingHandlers,
} from "@/components/layout/app-keybinding-dispatch";
import {
  APP_SHORTCUT_CHORD_TIMEOUT_MS,
  passesTerminalTypingGuard,
  resolveShortcutChord,
  shouldAbortTaskOnEscape,
  type PendingShortcutChord,
} from "@/components/layout/app-shell.shortcuts";
import { reopenLastClosedPaneTab } from "@/components/panes/closed-tab-history";
import {
  focusOrCreateLensSurface,
  paneHost,
} from "@/components/panes/pane-host-controller";
import { closePaneSurface } from "@/components/panes/pane-surface-actions";
import {
  canNavigateSurfaceHistory,
  navigateSurfaceHistory,
  startSurfaceHistoryTracking,
} from "@/components/panes/surface-history-runtime";
import type { AppShortcutCommandId } from "@/lib/app-shortcuts";
import { runPendingUndo } from "@/lib/notifications/pending-undo";
import { buildPanePanelId } from "@/lib/panes/types";
import { resolveTaskPresetShortcutSlot } from "@/lib/task-presets";
import { useAppStore } from "@/store/app.store";

/** Settings (and anything else outside the shell) asks for the shortcut list. */
export const OPEN_KEYBOARD_SHORTCUTS_EVENT = "stave:open-keyboard-shortcuts";

export function requestOpenKeyboardShortcuts() {
  window.dispatchEvent(new CustomEvent(OPEN_KEYBOARD_SHORTCUTS_EVENT));
}

export interface AppKeybindingCallbacks {
  onFocusFileSearch: () => void;
  onOpenCommandPalette: () => void;
  onOpenExplorerSearch: () => void;
  onOpenKeyboardShortcuts: () => void;
  onOpenSettings: () => void;
  /** Settings asked for the list; the caller closes Settings first. */
  onKeyboardShortcutsRequested: () => void;
}

function toggleSidebarOverlay(
  tab: "changes" | "explorer" | "information" | "scripts",
) {
  const store = useAppStore.getState();
  const nextVisible = !(
    store.layout.sidebarOverlayVisible && store.layout.sidebarOverlayTab === tab
  );
  store.setLayout({
    patch: { sidebarOverlayVisible: nextVisible, sidebarOverlayTab: tab },
  });
}

function runAppChordAction(
  action: AppShortcutCommandId,
  callbacks: AppKeybindingCallbacks,
) {
  const store = useAppStore.getState();
  switch (action) {
    case "navigation.home":
      store.clearTaskSelection();
      return;
    case "navigation.fleet-view":
      store.toggleFleetView();
      return;
    case "navigation.automation-center":
      store.toggleAutomationCenter();
      return;
    case "navigation.issues":
      store.toggleIssues();
      return;
    case "navigation.agents":
      store.toggleAgents();
      return;
    case "view.toggle-workspace-sidebar":
      store.setLayout({
        patch: {
          workspaceSidebarCollapsed: !store.layout.workspaceSidebarCollapsed,
        },
      });
      return;
    case "view.toggle-changes-panel":
      toggleSidebarOverlay("changes");
      return;
    case "view.show-explorer":
      toggleSidebarOverlay("explorer");
      return;
    case "view.show-information":
      toggleSidebarOverlay("information");
      return;
    case "view.show-scripts":
      toggleSidebarOverlay("scripts");
      return;
    case "view.show-lens":
      focusOrCreateLensSurface();
      return;
    case "view.toggle-editor": {
      const editorTabId = store.activeEditorTabId;
      if (editorTabId) {
        paneHost.openSurface({ kind: "editor", editorTabId });
      } else {
        callbacks.onFocusFileSearch();
      }
      return;
    }
    case "view.toggle-terminal":
      paneHost.toggleTerminalGroup();
      return;
  }
}

function selectAdjacentTask(delta: 1 | -1) {
  const store = useAppStore.getState();
  const currentIndex = store.tasks.findIndex(
    (task) => task.id === store.activeTaskId,
  );
  const nextIndex =
    currentIndex >= 0
      ? Math.min(store.tasks.length - 1, Math.max(0, currentIndex + delta))
      : 0;
  const nextTaskId = store.tasks[nextIndex]?.id;
  if (nextTaskId) {
    store.selectTask({ taskId: nextTaskId });
  }
}

function createAppKeybindingHandlers(
  callbacks: AppKeybindingCallbacks,
): AppKeybindingHandlers {
  const store = () => useAppStore.getState();
  return {
    "presets.run-slot": (event) => {
      const slot = resolveTaskPresetShortcutSlot(event);
      const preset = slot === null ? null : (store().settings.taskPresets[slot] ?? null);
      if (!preset) {
        return false;
      }
      store().applyTaskPreset({ presetId: preset.id });
      return true;
    },
    "file.quick-open": () => {
      if (!store().repositoryPath?.trim()) {
        return false;
      }
      callbacks.onFocusFileSearch();
      return true;
    },
    "explorer.search-in-files": () => {
      callbacks.onOpenExplorerSearch();
      return true;
    },
    "command-palette.open": () => {
      callbacks.onOpenCommandPalette();
      return true;
    },
    "settings.open": () => {
      callbacks.onOpenSettings();
      return true;
    },
    "tabs.reopen-closed": () => {
      void reopenLastClosedPaneTab();
      return true;
    },
    "pane.split-right": () => {
      paneHost.splitActivePanel("right");
      return true;
    },
    "pane.split-down": () => {
      paneHost.splitActivePanel("below");
      return true;
    },
    // The desktop app closes tabs from the main process (`window.ts`) before
    // the page sees the key; this path serves the browser build and keeps its
    // old typing guard.
    "pane.close-tab": (event) => {
      if (!passesTerminalTypingGuard(event)) {
        return false;
      }
      const { activeSurface, paneTabMeta } = store();
      if (paneTabMeta[buildPanePanelId(activeSurface)]?.pinned) {
        return false;
      }
      closePaneSurface(activeSurface);
      return true;
    },
    "task.abort-turn": (event) => {
      const shouldAbort = shouldAbortTaskOnEscape({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: event.target,
        activeElement:
          typeof document === "undefined" ? null : document.activeElement,
      });
      if (!shouldAbort) {
        return false;
      }
      store().abortTaskTurn({ taskId: store().activeTaskId });
      return true;
    },
    "work-queue.undo": () => runPendingUndo(),
    "navigation.back": () => {
      if (!canNavigateSurfaceHistory("back")) {
        return false;
      }
      void navigateSurfaceHistory("back");
      return true;
    },
    "navigation.forward": () => {
      if (!canNavigateSurfaceHistory("forward")) {
        return false;
      }
      void navigateSurfaceHistory("forward");
      return true;
    },
    "help.keyboard-shortcuts": () => {
      callbacks.onOpenKeyboardShortcuts();
      return true;
    },
    "task.new": () => {
      store().createTask({ title: "" });
      return true;
    },
    "editor.save": () => {
      void store().saveActiveEditorTab();
      return true;
    },
    "task.next": () => {
      selectAdjacentTask(1);
      return true;
    },
    "task.previous": () => {
      selectAdjacentTask(-1);
      return true;
    },
  };
}

/**
 * The app's one window-level keyboard listener. It resolves the
 * `Cmd/Ctrl+K` chords, then dispatches every other app-shell row of the
 * keybinding registry, and records surfaces for back/forward.
 */
export function useAppKeybindings(callbacks: AppKeybindingCallbacks) {
  const pendingChordRef = useRef<PendingShortcutChord | null>(null);
  const pendingChordTimerRef = useRef<number | null>(null);
  const {
    onFocusFileSearch,
    onOpenCommandPalette,
    onOpenExplorerSearch,
    onOpenKeyboardShortcuts,
    onOpenSettings,
    onKeyboardShortcutsRequested,
  } = callbacks;

  useEffect(() => startSurfaceHistoryTracking(), []);

  useEffect(() => {
    window.addEventListener(
      OPEN_KEYBOARD_SHORTCUTS_EVENT,
      onKeyboardShortcutsRequested,
    );
    return () =>
      window.removeEventListener(
        OPEN_KEYBOARD_SHORTCUTS_EVENT,
        onKeyboardShortcutsRequested,
      );
  }, [onKeyboardShortcutsRequested]);

  useEffect(() => {
    const currentCallbacks: AppKeybindingCallbacks = {
      onFocusFileSearch,
      onOpenCommandPalette,
      onOpenExplorerSearch,
      onOpenKeyboardShortcuts,
      onOpenSettings,
      onKeyboardShortcutsRequested,
    };
    const handlers = createAppKeybindingHandlers(currentCallbacks);
    const clearPendingChord = () => {
      pendingChordRef.current = null;
      if (pendingChordTimerRef.current !== null) {
        window.clearTimeout(pendingChordTimerRef.current);
        pendingChordTimerRef.current = null;
      }
    };
    const setPendingChord = (next: PendingShortcutChord | null) => {
      clearPendingChord();
      pendingChordRef.current = next;
      if (!next) {
        return;
      }
      pendingChordTimerRef.current = window.setTimeout(() => {
        pendingChordRef.current = null;
        pendingChordTimerRef.current = null;
      }, APP_SHORTCUT_CHORD_TIMEOUT_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const store = useAppStore.getState();
      const chord = resolveShortcutChord({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        pendingChord: pendingChordRef.current,
        shortcutKeys: store.settings.appShortcutKeys,
      });
      if (chord.nextPendingChord !== pendingChordRef.current) {
        setPendingChord(chord.nextPendingChord);
      }
      if (chord.preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (chord.action) {
        runAppChordAction(chord.action, currentCallbacks);
        return;
      }
      if (chord.stopAppHandling) {
        return;
      }
      dispatchAppKeybinding({
        event,
        context: { appSurfaceKind: store.activeAppSurface.kind },
        handlers,
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPendingChord();
    };
  }, [
    onFocusFileSearch,
    onOpenCommandPalette,
    onOpenExplorerSearch,
    onOpenKeyboardShortcuts,
    onOpenSettings,
    onKeyboardShortcutsRequested,
  ]);
}
