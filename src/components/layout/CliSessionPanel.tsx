import {
  Copy,
  Loader2,
  RefreshCw,
  SquareTerminal,
  ClipboardPaste,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import { TERMINAL_WRITE_ERROR_THRESHOLD } from "@/components/layout/useTerminalInstance";
import { useCliSessionManager } from "@/components/layout/useCliSessionManager";
import { useCliTerminalInstance } from "@/components/layout/useCliTerminalInstance";
import {
  Badge,
  Button,
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
} from "@/components/layout/terminal-surface-styles";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

const CLI_SESSION_TRANSCRIPT_STORAGE_KEY = "stave:cli-session-transcript:v1";

export const CliSessionPanel = memo(CliSessionPanelImpl);

function CliSessionPanelImpl() {
  const [
    activeWorkspaceId,
    workspacePath,
    cliSessionTabs,
    activeCliSessionTabId,
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
          state.activeCliSessionTabId,
          state.activeSurface,
          state.settings,
          state.isDarkMode,
          state.setCliSessionTabNativeSession,
        ] as const,
    ),
  );

  const activeTab = useMemo(
    () =>
      cliSessionTabs.find((tab) => tab.id === activeCliSessionTabId) ?? null,
    [activeCliSessionTabId, cliSessionTabs],
  );
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
    enabled: Boolean(activeTab) && activeSurface.kind === "cli-session",
    visible: activeSurface.kind === "cli-session",
    restartToken: rendererRestartToken,
    fontFamily: settings.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY,
    fontSize: settings.terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE,
    isDarkMode,
    onData: (input) => terminalInputHandlerRef.current(input),
    onResize: (cols, rows) => terminalResizeHandlerRef.current(cols, rows),
  });

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
    activeTabId: activeCliSessionTabId,
    tabs: cliSessionTabs,
    workspaceId: activeWorkspaceId,
    transcriptStorageKey: CLI_SESSION_TRANSCRIPT_STORAGE_KEY,
    isVisible: activeSurface.kind === "cli-session",
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

  const hasTabs = cliSessionTabs.length > 0;
  const isVisible = hasTabs && activeSurface.kind === "cli-session";
  const surfaceError = bridgeError || terminalInstance.error || "";
  const terminalViewport = (
    <div className={TERMINAL_SURFACE_PANEL_CLASS_NAME}>
      <div className={TERMINAL_SURFACE_VIEWPORT_CLASS_NAME}>
        {surfaceError ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {surfaceError}
          </div>
        ) : null}
        {terminalInstance.writeErrorCount > TERMINAL_WRITE_ERROR_THRESHOLD ? (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
            <span>Terminal rendering may be degraded.</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
              onClick={() => setRendererRestartToken((value) => value + 1)}
              disabled={!activeTab}
            >
              Restart renderer
            </Button>
          </div>
        ) : null}
        {!terminalInstance.ready ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-terminal">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Initializing terminal…</span>
            </div>
          </div>
        ) : null}
        <div
          key={`${activeTabKey ?? "no-cli-session"}:${rendererRestartToken}`}
          ref={terminalContainerRef}
          data-terminal-surface
          data-cli-terminal-surface
          className={cn(
            "h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border/70",
            !activeTab && "opacity-60",
          )}
        />
      </div>
    </div>
  );

  if (!hasTabs) {
    return (
      <section
        data-testid="cli-session-panel"
        className="hidden h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      />
    );
  }

  return (
    <section
      data-testid="cli-session-panel"
      className={cn(
        "h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
        isVisible ? "flex" : "hidden",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header container always at child position 0 so {terminalViewport}
            stays at position 1 and React never unmounts the terminal surface. */}
        <div className="shrink-0 border-b border-border/70 bg-card/95 px-4 py-3 backdrop-blur-sm">
          {isVisible ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {activeTab ? (
                    <>
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <ModelIcon
                          providerId={activeTab.provider}
                          className="size-4 text-muted-foreground"
                        />
                        <span className="truncate">{activeTab.title}</span>
                      </span>
                      <Badge
                        variant="secondary"
                        className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
                      >
                        {getCliSessionProviderLabel(activeTab.provider)}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
                      >
                        {getCliSessionContextLabel(activeTab.contextMode)}
                      </Badge>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                      <SquareTerminal className="size-4 text-muted-foreground" />
                      CLI Session
                    </span>
                  )}
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="truncate">
                    {activeTab?.cwd ?? workspacePath ?? "Workspace"}
                  </span>
                  {handoffSummary ? <span>Task handoff ready</span> : null}
                  {sessionExited ? (
                    <span
                      className={cn(
                        "font-medium",
                        sessionExited.exitCode === 0
                          ? "text-muted-foreground"
                          : "text-destructive",
                      )}
                    >
                      exited ({sessionExited.exitCode})
                    </span>
                  ) : activeSessionId ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      live
                    </span>
                  ) : null}
                </div>
              </div>
              <TooltipProvider>
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={handleCopyHandoff}
                        disabled={!handoffSummary}
                      >
                        <Copy className="size-3.5" />
                        Copy Handoff
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Copy the task handoff summary
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={handlePasteHandoff}
                        disabled={!handoffSummary || !activeSessionId}
                      >
                        <ClipboardPaste className="size-3.5" />
                        Paste Handoff
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Paste the handoff into the live CLI session
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                        onClick={() => {
                          restartActiveSession();
                          toast.message("CLI session restarted");
                        }}
                        disabled={!activeTab}
                        aria-label="restart-cli-session"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Restart Session
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground"
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
                      >
                        <X className="size-3.5" />
                      </Button>
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
