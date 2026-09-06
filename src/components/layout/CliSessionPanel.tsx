import {
  Copy,
  RefreshCw,
  SquareTerminal,
  ClipboardPaste,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import {
  focusTerminalInstanceSurface,
  TERMINAL_WRITE_ERROR_THRESHOLD,
} from "@/components/layout/useTerminalInstance";
import { useCliSessionManager } from "@/components/layout/useCliSessionManager";
import { useCliTerminalInstance } from "@/components/layout/useCliTerminalInstance";
import {
  Badge,
  Button,
  Loader,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { buildCliSessionRuntimeOptions } from "@/lib/terminal/cli-session-runtime-options";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
} from "@/lib/terminal/defaults";
import {
  buildTerminalSessionSlotKey,
  getCliSessionContextLabel,
  getCliSessionProviderLabel,
  getWorkspaceCliSessionTabKey,
} from "@/lib/terminal/types";
import {
  TERMINAL_SURFACE_PANEL_CLASS_NAME,
  TERMINAL_SURFACE_VIEWPORT_CLASS_NAME,
  terminalSurfaceStyles,
} from "@/components/layout/terminal-surface-styles";
import { sx } from "@/components/ads/utils/stylex";
import { cliSessionPanelStyles as styles } from "@/components/layout/cli-session-panel.styles";
import { useAppStore } from "@/store/app.store";

const CLI_SESSION_TRANSCRIPT_STORAGE_KEY = "stave:cli-session-transcript:v1";

export interface CliSessionPanelProps {
  /**
   * Explicit CLI session tab to render. When provided the panel is scoped to
   * that tab (pane host usage); otherwise it follows the store's active tab.
   */
  cliSessionTabId?: string;
}

export const CliSessionPanel = memo(CliSessionPanelImpl);

function CliSessionPanelImpl(props: CliSessionPanelProps) {
  const isScoped = props.cliSessionTabId !== undefined;
  const [
    activeWorkspaceId,
    workspacePath,
    cliSessionTabs,
    scopedTabId,
    activeSurface,
    settings,
    isDarkMode,
    setCliSessionTabNativeSession,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            "",
          state.cliSessionTabs,
          props.cliSessionTabId ?? state.activeCliSessionTabId,
          state.activeSurface,
          state.settings,
          state.isDarkMode,
          state.setCliSessionTabNativeSession,
        ] as const,
    ),
  );

  const activeTab = useMemo(
    () => cliSessionTabs.find((tab) => tab.id === scopedTabId) ?? null,
    [scopedTabId, cliSessionTabs],
  );
  const isSurfaceVisible = isScoped
    ? activeSurface.kind === "cli-session" &&
      activeSurface.cliSessionTabId === scopedTabId
    : activeSurface.kind === "cli-session";
  const handoffSummary = activeTab?.handoffSummary?.trim() ?? "";
  const getTabKey = useCallback(
    (tab: NonNullable<typeof activeTab>) =>
      getWorkspaceCliSessionTabKey({
        workspaceId: activeWorkspaceId,
        cliSessionTabId: tab.id,
      }),
    [activeWorkspaceId],
  );
  const activeTabKey = activeTab ? getTabKey(activeTab) : null;
  const hasTabs = isScoped ? Boolean(activeTab) : cliSessionTabs.length > 0;
  const isVisible = hasTabs && isSurfaceVisible;
  const [rendererRestartToken, setRendererRestartToken] = useState(0);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalInputHandlerRef = useRef<(input: string) => void>(() => {});
  const terminalResizeHandlerRef = useRef<
    (cols: number, rows: number) => Promise<void>
  >(() => Promise.resolve());
  const createSession = useCallback(
    async (args: {
      tab: NonNullable<typeof activeTab>;
      cols: number;
      rows: number;
      deliveryMode: "poll" | "push";
    }) => {
      if (!workspacePath) {
        return { ok: false, stderr: "Workspace path unavailable." };
      }

      const createCliSession = window.api?.terminal?.createCliSession;
      if (!createCliSession) {
        return {
          ok: false,
          stderr: "CLI session bridge unavailable. Use bun run dev:desktop.",
        };
      }

      const currentTasks = useAppStore.getState().tasks;
      const currentLinkedTaskTitle = args.tab.linkedTaskId
        ? (currentTasks.find((task) => task.id === args.tab.linkedTaskId)
            ?.title ?? args.tab.linkedTaskTitle)
        : args.tab.linkedTaskTitle;

      return createCliSession({
        workspaceId: activeWorkspaceId,
        workspacePath,
        cliSessionTabId: args.tab.id,
        providerId: args.tab.provider,
        contextMode: args.tab.contextMode,
        nativeSessionId: args.tab.nativeSessionId,
        taskId: args.tab.linkedTaskId,
        taskTitle: currentLinkedTaskTitle,
        cwd: args.tab.cwd,
        cols: args.cols,
        rows: args.rows,
        deliveryMode: args.deliveryMode,
        runtimeOptions: buildCliSessionRuntimeOptions({
          providerId: args.tab.provider,
          claudeBinaryPath: settings.claudeBinaryPath,
          codexBinaryPath: settings.codexBinaryPath,
        }),
      });
    },
    [
      activeWorkspaceId,
      settings.claudeBinaryPath,
      settings.codexBinaryPath,
      workspacePath,
    ],
  );

  const slotKeyForTab = useCallback(
    (tab: NonNullable<typeof activeTab>) =>
      buildTerminalSessionSlotKey({
        surface: "cli",
        workspaceId: activeWorkspaceId,
        tabId: tab.id,
      }),
    [activeWorkspaceId],
  );

  const terminalInstance = useCliTerminalInstance({
    containerRef: terminalContainerRef,
    instanceKey: activeTabKey ?? "no-cli-session",
    // Scoped (pane) usage keeps the terminal attached while the panel is
    // hidden — Dockview keep-alive retains the DOM for background tabs.
    enabled: Boolean(activeTab) && (isScoped || isSurfaceVisible),
    visible: isSurfaceVisible,
    restartToken: rendererRestartToken,
    fontFamily: settings.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY,
    fontSize: settings.terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE,
    lineHeight: settings.terminalLineHeight,
    cursorStyle: settings.terminalCursorStyle,
    isDarkMode,
    onData: (input) => terminalInputHandlerRef.current(input),
    onResize: (cols, rows) => terminalResizeHandlerRef.current(cols, rows),
  });

  useEffect(() => {
    if (!isVisible || !terminalInstance.ready || !activeTabKey) {
      return;
    }
    let cancelFocus = terminalInstance.controller.focus();
    let settleTimer: number | null = null;
    const settleFrame = window.requestAnimationFrame(() => {
      settleTimer = window.setTimeout(() => {
        // Dockview settles header focus after activating a tab. Re-assert the
        // terminal focus once that transition has completed.
        cancelFocus?.();
        cancelFocus = terminalInstance.controller.focus();
        focusTerminalInstanceSurface({
          container: terminalContainerRef.current,
        });
      }, 50);
    });
    return () => {
      window.cancelAnimationFrame(settleFrame);
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      cancelFocus?.();
    };
  }, [
    activeTabKey,
    isVisible,
    terminalInstance.controller,
    terminalInstance.ready,
  ]);

  const {
    activeSessionId,
    bridgeError,
    handleTerminalInput,
    handleTerminalResize,
    restartActiveSession,
    sessionExited,
    writeToActiveSession,
  } = useCliSessionManager({
    activeTab,
    activeTabId: scopedTabId,
    tabs: cliSessionTabs,
    workspaceId: activeWorkspaceId,
    transcriptStorageKey: CLI_SESSION_TRANSCRIPT_STORAGE_KEY,
    isVisible: isSurfaceVisible,
    getTabKey,
    createSession,
    slotKeyForTab,
    setTabNativeSession: setCliSessionTabNativeSession,
    terminalController: terminalInstance.controller,
    terminalReady: terminalInstance.ready,
    terminalRevision: terminalInstance.revision,
  });

  useLayoutEffect(() => {
    terminalInputHandlerRef.current = handleTerminalInput;
    terminalResizeHandlerRef.current = handleTerminalResize;
  }, [handleTerminalInput, handleTerminalResize]);

  async function handleCopyHandoff() {
    if (!handoffSummary) {
      return;
    }
    try {
      await copyTextToClipboard(handoffSummary);
      toast.message("Handoff copied");
    } catch {
      toast.error("Unable to copy handoff");
    }
  }

  function handlePasteHandoff() {
    if (!handoffSummary || !activeSessionId) {
      return;
    }
    const input = handoffSummary.endsWith("\n")
      ? handoffSummary
      : `${handoffSummary}\n`;
    if (!writeToActiveSession(input)) {
      toast.error("CLI session is not ready yet");
      return;
    }
    toast.message("Handoff pasted");
  }

  const surfaceError = bridgeError || terminalInstance.error || "";
  const terminalViewport = (
    <div className={TERMINAL_SURFACE_PANEL_CLASS_NAME}>
      <div className={TERMINAL_SURFACE_VIEWPORT_CLASS_NAME}>
        {surfaceError ? (
          <div className={sx(styles.errorBanner)}>
            {surfaceError}
          </div>
        ) : null}
        {terminalInstance.writeErrorCount > TERMINAL_WRITE_ERROR_THRESHOLD ? (
          <div className={sx(styles.degradedBanner)}>
            <span>Terminal rendering may be degraded.</span>
            <Button
              variant="ghost"
              size="sm"
              xstyle={styles.degradedAction}
              onClick={() => setRendererRestartToken((value) => value + 1)}
              disabled={!activeTab}
            >
              Restart renderer
            </Button>
          </div>
        ) : null}
        {!terminalInstance.ready ? (
          <div className={sx(styles.bootOverlay)}>
            <div className={sx(styles.bootLabel)}>
              <Loader aria-hidden size="xs" variant="spinner" />
              <span>Initializing terminal…</span>
            </div>
          </div>
        ) : null}
        <div
          key={`${activeTabKey ?? "no-cli-session"}:${rendererRestartToken}`}
          ref={terminalContainerRef}
          data-terminal-surface
          className={sx(
            terminalSurfaceStyles.surface,
            !activeTab && terminalSurfaceStyles.dimmed,
          )}
        />
      </div>
    </div>
  );

  if (!hasTabs) {
    return (
      <section
        data-testid="cli-session-panel"
        className={sx(styles.panel, styles.panelHidden)}
      />
    );
  }

  return (
    <section
      data-testid="cli-session-panel"
      className={sx(
        styles.panel,
        isVisible ? styles.panelVisible : styles.panelHidden,
      )}
    >
      <div className={sx(styles.column)}>
        {/* Header container always at child position 0 so {terminalViewport}
            stays at position 1 and React never unmounts the terminal surface. */}
        <div className={sx(styles.header)}>
          {isVisible ? (
            <div className={sx(styles.headerRow)}>
              <div className={sx(styles.headerMain)}>
                <div className={sx(styles.titleRow)}>
                  {activeTab ? (
                    <>
                      <span className={sx(styles.title)}>
                        <ModelIcon
                          providerId={activeTab.provider}
                          className={sx(styles.providerIcon)}
                        />
                        <span className={sx(styles.truncate)}>
                          {activeTab.title}
                        </span>
                      </span>
                      <Badge
                        variant="secondary"
                        className={sx(styles.badge)}
                      >
                        {getCliSessionProviderLabel(activeTab.provider)}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={sx(styles.badge)}
                      >
                        {getCliSessionContextLabel(activeTab.contextMode)}
                      </Badge>
                    </>
                  ) : (
                    <span className={sx(styles.title)}>
                      <SquareTerminal className={sx(styles.providerIcon)} />
                      CLI Session
                    </span>
                  )}
                </div>
                <div className={sx(styles.metaRow)}>
                  <span className={sx(styles.truncate)}>
                    {activeTab?.cwd ?? workspacePath ?? "Workspace"}
                  </span>
                  {handoffSummary ? <span>Task handoff ready</span> : null}
                  {sessionExited ? (
                    <span
                      className={sx(
                        styles.exitStatus,
                        sessionExited.exitCode === 0
                          ? styles.exitStatusClean
                          : styles.exitStatusFailed,
                      )}
                    >
                      exited ({sessionExited.exitCode})
                    </span>
                  ) : activeSessionId ? (
                    <span className={sx(styles.liveStatus)}>live</span>
                  ) : null}
                </div>
              </div>
              <TooltipProvider>
                <div className={sx(styles.actions)}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          xstyle={styles.handoffButton}
                          onClick={handleCopyHandoff}
                          disabled={!handoffSummary}
                        />
                      }
                    >
                      <Copy />
                      Copy Handoff
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Copy the task handoff summary
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          xstyle={styles.handoffButton}
                          onClick={handlePasteHandoff}
                          disabled={!handoffSummary || !activeSessionId}
                        />
                      }
                    >
                      <ClipboardPaste />
                      Paste Handoff
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Paste the handoff into the live CLI session
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          xstyle={styles.iconButton}
                          onClick={() => {
                            restartActiveSession();
                            toast.message("CLI session restarted");
                          }}
                          disabled={!activeTab}
                          aria-label="restart-cli-session"
                        />
                      }
                    >
                      <RefreshCw />
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Restart Session
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          xstyle={styles.iconButton}
                          onClick={() => {
                            if (activeTab) {
                              window.dispatchEvent(
                                new CustomEvent(
                                  "stave:request-close-cli-session",
                                  {
                                    detail: {
                                      id: activeTab.id,
                                      title: activeTab.title,
                                    },
                                  },
                                ),
                              );
                            }
                          }}
                          disabled={!activeTab}
                          aria-label="close-cli-session"
                        />
                      }
                    >
                      <X />
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Close Session</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          ) : null}
        </div>
        {terminalViewport}
      </div>
    </section>
  );
}
