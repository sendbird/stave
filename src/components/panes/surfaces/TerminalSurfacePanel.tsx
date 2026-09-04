import type { DockviewPanelApi, IDockviewPanelProps } from "dockview-react";
import { Eraser, SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { TerminalTabSurface } from "@/components/layout/TerminalTabSurface";
import {
  TERMINAL_SURFACE_PANEL_CLASS_NAME,
  TERMINAL_SURFACE_VIEWPORT_CLASS_NAME,
} from "@/components/layout/terminal-surface-styles";
import { TERMINAL_WRITE_ERROR_THRESHOLD } from "@/components/layout/useTerminalInstance";
import { useTerminalSessionManager } from "@/components/layout/useTerminalSessionManager";
import { useTerminalTabManager } from "@/components/layout/useTerminalTabManager";
import { Button, Loader } from "@/components/ui";
import { parsePanePanelId } from "@/lib/panes/types";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
} from "@/lib/terminal/defaults";
import {
  buildTerminalSessionSlotKey,
  getWorkspaceTerminalTabKey,
  type TerminalCreateSessionArgs,
  type WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

/**
 * Shared with the former TerminalDock ("v2") so existing transcripts hydrate.
 * Multiple pane instances share this key; the session manager merges flushes
 * per dirty tab key so panels never clobber each other's transcripts.
 */
const TERMINAL_TRANSCRIPT_STORAGE_KEY = "stave:terminal-tab-transcript:v2";

/**
 * Dockview panel hosting one workspace terminal tab.
 *
 * Lifecycle guardrails: the panel is registered with `renderer: "always"`, so
 * hiding it keeps this component mounted and the PTY attached; unmounting
 * (workspace switch, panel removal) detaches the session; closing the tab
 * disposes it via the session manager's removed-tab sweep.
 */
export function TerminalSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  if (surface?.kind !== "terminal") {
    return null;
  }
  return (
    <TerminalSurfacePanelContent
      terminalTabId={surface.terminalTabId}
      panelApi={props.api}
    />
  );
}

function TerminalSurfacePanelContent(props: {
  terminalTabId: string;
  panelApi: DockviewPanelApi;
}) {
  // Dockview visibility drives renderer mounting + PTY creation; the active
  // state gates keyboard-focus stealing to the focused panel only.
  const [isPanelVisible, setIsPanelVisible] = useState(
    props.panelApi.isVisible,
  );
  const [isPanelActive, setIsPanelActive] = useState(props.panelApi.isActive);

  useEffect(() => {
    setIsPanelVisible(props.panelApi.isVisible);
    setIsPanelActive(props.panelApi.isActive);
    const visibilityDisposable = props.panelApi.onDidVisibilityChange(
      (event) => {
        setIsPanelVisible(event.isVisible);
      },
    );
    const activeDisposable = props.panelApi.onDidActiveChange((event) => {
      setIsPanelActive(event.isActive);
    });
    return () => {
      visibilityDisposable.dispose();
      activeDisposable.dispose();
    };
  }, [props.panelApi]);

  const [
    activeWorkspaceId,
    workspacePath,
    terminalTabs,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    terminalCursorStyle,
    isDarkMode,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            "",
          state.terminalTabs,
          state.settings.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY,
          state.settings.terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE,
          state.settings.terminalLineHeight,
          state.settings.terminalCursorStyle,
          state.isDarkMode,
        ] as const,
    ),
  );

  const tab = useMemo(
    () => terminalTabs.find((item) => item.id === props.terminalTabId) ?? null,
    [props.terminalTabId, terminalTabs],
  );

  const getTabKey = useCallback(
    (item: WorkspaceTerminalTab) =>
      getWorkspaceTerminalTabKey({
        workspaceId: activeWorkspaceId,
        terminalTabId: item.id,
      }),
    [activeWorkspaceId],
  );
  const tabKey = tab ? getTabKey(tab) : null;

  const createSession = useCallback(
    async (createArgs: {
      tab: WorkspaceTerminalTab;
      cols: number;
      rows: number;
      deliveryMode: "poll" | "push";
    }) => {
      if (!workspacePath) {
        return { ok: false, stderr: "Workspace path unavailable." };
      }

      const createSessionApi = window.api?.terminal?.createSession;
      if (!createSessionApi) {
        return {
          ok: false,
          stderr: "Terminal bridge unavailable. Use bun run dev:desktop.",
        };
      }

      const tasks = useAppStore.getState().tasks;
      const linkedTask = createArgs.tab.linkedTaskId
        ? (tasks.find((task) => task.id === createArgs.tab.linkedTaskId) ??
          null)
        : null;
      const request: TerminalCreateSessionArgs = {
        workspaceId: activeWorkspaceId,
        workspacePath,
        taskId: linkedTask?.id ?? null,
        taskTitle: linkedTask?.title ?? null,
        terminalTabId: createArgs.tab.id,
        cwd: createArgs.tab.cwd,
        cols: createArgs.cols,
        rows: createArgs.rows,
        deliveryMode: createArgs.deliveryMode,
      };

      return createSessionApi(request);
    },
    [activeWorkspaceId, workspacePath],
  );

  const slotKeyForTab = useCallback(
    (item: WorkspaceTerminalTab) =>
      buildTerminalSessionSlotKey({
        surface: "terminal",
        workspaceId: activeWorkspaceId,
        tabId: item.id,
      }),
    [activeWorkspaceId],
  );

  const tabManager = useTerminalTabManager({
    tabs: terminalTabs,
    activeTabId: tab ? props.terminalTabId : null,
    isVisible: isPanelVisible,
    isFocused: isPanelVisible && isPanelActive,
    getTabKey,
  });

  const {
    activeSessionId,
    activeWriteErrorCount,
    bridgeError,
    clearActiveTranscript,
    getSessionIdForTabKey,
    handleTerminalInput,
    handleTerminalResize,
    restartActiveTerminalRenderer,
    sessionExited,
    shellStatus,
    terminalReady,
  } = useTerminalSessionManager({
    activeTab: tab,
    activeTabId: tab ? props.terminalTabId : null,
    tabs: terminalTabs,
    workspaceId: activeWorkspaceId,
    transcriptStorageKey: TERMINAL_TRANSCRIPT_STORAGE_KEY,
    isVisible: isPanelVisible,
    getTabKey,
    createSession,
    slotKeyForTab,
    tabManager,
  });

  // Moving the panel between groups repositions/reparents the surface DOM
  // without a visibility flip, so re-fit + repaint (and re-enable WebGL if it
  // was lost) once Dockview finishes the move.
  const refreshTerminalViewport = tabManager.refreshViewport;
  useEffect(() => {
    if (!tabKey) {
      return;
    }
    const groupChangeDisposable = props.panelApi.onDidGroupChange(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          refreshTerminalViewport(tabKey);
        });
      });
    });
    return () => {
      groupChangeDisposable.dispose();
    };
  }, [props.panelApi, refreshTerminalViewport, tabKey]);

  return (
    <section
      data-testid={`terminal-surface-${props.terminalTabId}`}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-xs text-muted-foreground">
        <SquareTerminal className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {tab?.cwd ?? workspacePath ?? "Terminal"}
        </span>
        {sessionExited ? (
          <span
            className={cn(
              "truncate text-[11px] font-medium",
              sessionExited.exitCode === 0
                ? "text-muted-foreground/80"
                : "text-destructive",
            )}
          >
            exited ({sessionExited.exitCode})
          </span>
        ) : shellStatus ? (
          <span className="truncate text-[11px] text-sky-600 dark:text-sky-400">
            {shellStatus.status.replaceAll("-", " ")}
            {shellStatus.exitCode === undefined
              ? ""
              : ` (${shellStatus.exitCode})`}
          </span>
        ) : activeSessionId ? (
          <span className="truncate text-[11px] text-emerald-600 dark:text-emerald-400">
            live
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 rounded-md p-0 text-muted-foreground"
          onClick={clearActiveTranscript}
          aria-label={`clear-terminal-${props.terminalTabId}`}
          disabled={!tab}
        >
          <Eraser className="size-3" />
        </Button>
      </div>
      <div className={TERMINAL_SURFACE_PANEL_CLASS_NAME}>
        <div className={TERMINAL_SURFACE_VIEWPORT_CLASS_NAME}>
          {bridgeError ? (
            <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {bridgeError}
            </div>
          ) : null}
          {activeWriteErrorCount > TERMINAL_WRITE_ERROR_THRESHOLD ? (
            <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <span>Terminal rendering may be degraded.</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                onClick={restartActiveTerminalRenderer}
                disabled={!tab}
              >
                Restart renderer
              </Button>
            </div>
          ) : null}
          {!terminalReady ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-terminal">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader aria-hidden size="xs" variant="spinner" />
                <span>Initializing terminal…</span>
              </div>
            </div>
          ) : null}
          {tab && tabKey ? (
            <TerminalTabSurface
              key={tabKey}
              tabKey={tabKey}
              sessionId={getSessionIdForTabKey(tabKey)}
              surface="terminal-pane"
              isActive={true}
              isVisible={isPanelVisible}
              fontFamily={terminalFontFamily}
              fontSize={terminalFontSize}
              lineHeight={terminalLineHeight}
              cursorStyle={terminalCursorStyle}
              isDarkMode={isDarkMode}
              tabManager={tabManager}
              onData={handleTerminalInput}
              onResize={handleTerminalResize}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
