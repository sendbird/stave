import type { DockviewPanelApi, IDockviewPanelProps } from "dockview-react";
import { Eraser, SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { TerminalTabSurface } from "@/components/layout/TerminalTabSurface";
import { terminalSurfaceStyles } from "@/components/layout/terminal-surface-styles";
import { TERMINAL_WRITE_ERROR_THRESHOLD } from "@/components/layout/useTerminalInstance";
import { useTerminalSessionManager } from "@/components/layout/useTerminalSessionManager";
import { useTerminalTabManager } from "@/components/layout/useTerminalTabManager";
import { sx } from "@/components/ads/utils/stylex";
import { Button, Loader } from "@/components/ui";
import { terminalSurfacePanelStyles } from "./terminal-surface-panel.styles";
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
      className={sx(terminalSurfacePanelStyles.root)}
    >
      <div className={sx(terminalSurfacePanelStyles.header)}>
        <SquareTerminal className={sx(terminalSurfacePanelStyles.headerIcon)} />
        <span className={sx(terminalSurfacePanelStyles.headerPath)}>
          {tab?.cwd ?? workspacePath ?? "Terminal"}
        </span>
        {sessionExited ? (
          <span
            className={sx(
              terminalSurfacePanelStyles.status,
              sessionExited.exitCode === 0
                ? terminalSurfacePanelStyles.statusExited
                : terminalSurfacePanelStyles.statusExitedFailed,
            )}
          >
            exited ({sessionExited.exitCode})
          </span>
        ) : shellStatus ? (
          <span
            className={sx(
              terminalSurfacePanelStyles.status,
              terminalSurfacePanelStyles.statusShell,
            )}
          >
            {shellStatus.status.replaceAll("-", " ")}
            {shellStatus.exitCode === undefined
              ? ""
              : ` (${shellStatus.exitCode})`}
          </span>
        ) : activeSessionId ? (
          <span
            className={sx(
              terminalSurfacePanelStyles.status,
              terminalSurfacePanelStyles.statusLive,
            )}
          >
            live
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          xstyle={terminalSurfacePanelStyles.clearButton}
          onClick={clearActiveTranscript}
          aria-label={`clear-terminal-${props.terminalTabId}`}
          disabled={!tab}
        >
          <Eraser aria-hidden size={12} />
        </Button>
      </div>
      <div className={sx(terminalSurfaceStyles.panel)}>
        <div className={sx(terminalSurfaceStyles.viewport)}>
          {bridgeError ? (
            <div
              className={sx(
                terminalSurfacePanelStyles.notice,
                terminalSurfacePanelStyles.noticeDanger,
              )}
            >
              {bridgeError}
            </div>
          ) : null}
          {activeWriteErrorCount > TERMINAL_WRITE_ERROR_THRESHOLD ? (
            <div
              className={sx(
                terminalSurfacePanelStyles.notice,
                terminalSurfacePanelStyles.noticeWarning,
              )}
            >
              <span>Terminal rendering may be degraded.</span>
              <Button
                variant="ghost"
                size="sm"
                xstyle={terminalSurfacePanelStyles.restartButton}
                onClick={restartActiveTerminalRenderer}
                disabled={!tab}
              >
                Restart renderer
              </Button>
            </div>
          ) : null}
          {!terminalReady ? (
            <div className={sx(terminalSurfacePanelStyles.loadingOverlay)}>
              <div className={sx(terminalSurfacePanelStyles.loadingLabel)}>
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
