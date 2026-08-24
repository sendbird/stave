import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useCliSessionManager } from "@/components/layout/useCliSessionManager";
import { useCliTerminalInstance } from "@/components/layout/useCliTerminalInstance";
import { focusTerminalInstanceSurface } from "@/components/layout/useTerminalInstance";
import {
  TERMINAL_SURFACE_CLASS_NAME,
  TERMINAL_SURFACE_PANEL_CLASS_NAME,
  TERMINAL_SURFACE_VIEWPORT_CLASS_NAME,
} from "@/components/layout/terminal-surface-styles";
import { buildCliSessionRuntimeOptions } from "@/lib/terminal/cli-session-runtime-options";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
} from "@/lib/terminal/defaults";
import {
  buildStandaloneCliSlotKey,
  buildStandaloneCliTabs,
  getStandaloneCliTabKey,
  STANDALONE_CLI_TAB_IDS,
  STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
  STANDALONE_CLI_WORKSPACE_ID,
  type StandaloneCliTab,
  type StandaloneCliTabId,
} from "@/lib/terminal/standalone-cli";
import { useAppStore } from "@/store/app.store";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

/**
 * React discards the mount node whenever its `key` changes, and the renderer
 * hook only rebuilds xterm into the container when `restartToken` changes. Both
 * therefore have to move together: a tab switch changes the mount key, so it
 * must change the restart token too, otherwise xterm keeps rendering into the
 * detached node and the visible viewport stays blank forever.
 *
 * `restartToken` is a number, so the tab is folded in by index. Multiplying the
 * manual counter by the tab count keeps every (counter, tab) pair distinct.
 */
export function buildStandaloneCliRendererKey(args: {
  restartCount: number;
  tabId: StandaloneCliTabId;
}) {
  const tabIndex = Math.max(STANDALONE_CLI_TAB_IDS.indexOf(args.tabId), 0);
  return args.restartCount * STANDALONE_CLI_TAB_IDS.length + tabIndex;
}

/** Pure so the payload contract can be asserted without a DOM. */
export function buildStandaloneCliCreateSessionArgs(args: {
  tab: StandaloneCliTab;
  folderPath: string;
  cols: number;
  rows: number;
  deliveryMode: "poll" | "push";
  claudeBinaryPath: string;
  codexBinaryPath: string;
}) {
  return {
    workspaceId: STANDALONE_CLI_WORKSPACE_ID,
    workspacePath: args.folderPath,
    cliSessionTabId: args.tab.id,
    providerId: args.tab.id,
    contextMode: "workspace" as const,
    nativeSessionId: args.tab.nativeSessionId,
    taskId: null,
    taskTitle: null,
    cwd: args.folderPath,
    cols: args.cols,
    rows: args.rows,
    deliveryMode: args.deliveryMode,
    runtimeOptions: buildCliSessionRuntimeOptions({
      providerId: args.tab.id,
      claudeBinaryPath: args.claudeBinaryPath,
      codexBinaryPath: args.codexBinaryPath,
    }),
  };
}

export function StandaloneCliTerminal(props: { folderPath: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputHandlerRef = useRef<(input: string) => void>(() => {});
  const resizeHandlerRef = useRef<
    (cols: number, rows: number) => Promise<void> | void
  >(() => {});
  const [rendererRestartToken, setRendererRestartToken] = useState(0);

  const [activeTabId, nativeSessionIdByTab] = useStandaloneCliStore(
    useShallow(
      (state) => [state.activeTabId, state.nativeSessionIdByTab] as const,
    ),
  );
  const setTabNativeSession = useStandaloneCliStore(
    (state) => state.setTabNativeSession,
  );

  const [
    claudeBinaryPath,
    codexBinaryPath,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    terminalCursorStyle,
    isDarkMode,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.claudeBinaryPath,
          state.settings.codexBinaryPath,
          state.settings.terminalFontFamily,
          state.settings.terminalFontSize,
          state.settings.terminalLineHeight,
          state.settings.terminalCursorStyle,
          state.isDarkMode,
        ] as const,
    ),
  );

  // Derived outside the selector: selectors must never return fresh arrays.
  const tabs = useMemo(
    () =>
      buildStandaloneCliTabs({
        folderPath: props.folderPath,
        nativeSessionIdByTab,
      }),
    [props.folderPath, nativeSessionIdByTab],
  );
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const activeTabKey = getStandaloneCliTabKey(activeTabId);
  const rendererKey = buildStandaloneCliRendererKey({
    restartCount: rendererRestartToken,
    tabId: activeTabId,
  });

  const getTabKey = useCallback(
    (tab: StandaloneCliTab) => getStandaloneCliTabKey(tab.id),
    [],
  );
  const slotKeyForTab = useCallback(
    (tab: StandaloneCliTab) => buildStandaloneCliSlotKey(tab.id),
    [],
  );

  const createSession = useCallback(
    async (args: {
      tab: StandaloneCliTab;
      cols: number;
      rows: number;
      deliveryMode: "poll" | "push";
    }) => {
      if (!props.folderPath) {
        return {
          ok: false,
          stderr: "Set a Standalone CLI folder in Settings.",
        };
      }
      const createCliSession = window.api?.terminal?.createCliSession;
      if (!createCliSession) {
        return {
          ok: false,
          stderr: "CLI session bridge unavailable. Use bun run dev:desktop.",
        };
      }
      return createCliSession(
        buildStandaloneCliCreateSessionArgs({
          tab: args.tab,
          folderPath: props.folderPath,
          cols: args.cols,
          rows: args.rows,
          deliveryMode: args.deliveryMode,
          claudeBinaryPath,
          codexBinaryPath,
        }),
      );
    },
    [claudeBinaryPath, codexBinaryPath, props.folderPath],
  );

  const terminalInstance = useCliTerminalInstance({
    containerRef,
    instanceKey: activeTabKey,
    // CLI surfaces dispose the renderer when hidden and rehydrate from the host
    // snapshot on return. Closing the overlay unmounts this whole subtree, which
    // is what actually implements that dispose-on-hide guardrail, so `enabled`
    // needs no separate visibility term.
    enabled: true,
    visible: true,
    restartToken: rendererKey,
    fontFamily: terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY,
    fontSize: terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE,
    lineHeight: terminalLineHeight,
    cursorStyle: terminalCursorStyle,
    isDarkMode,
    onData: (input) => inputHandlerRef.current(input),
    onResize: (cols, rows) => resizeHandlerRef.current(cols, rows),
  });

  const {
    bridgeError,
    handleTerminalInput,
    handleTerminalResize,
    restartActiveSession,
    sessionExited,
  } = useCliSessionManager({
    activeTab,
    activeTabId,
    tabs,
    workspaceId: STANDALONE_CLI_WORKSPACE_ID,
    transcriptStorageKey: STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
    isVisible: true,
    getTabKey,
    createSession,
    slotKeyForTab,
    setTabNativeSession,
    terminalController: terminalInstance.controller,
    terminalReady: terminalInstance.ready,
    terminalRevision: terminalInstance.revision,
  });

  useLayoutEffect(() => {
    inputHandlerRef.current = handleTerminalInput;
    resizeHandlerRef.current = handleTerminalResize;
  }, [handleTerminalInput, handleTerminalResize]);

  // Opening the overlay leaves focus on the top-bar button, so claim it for the
  // terminal instead of making the user click into it before typing.
  useEffect(() => {
    if (!terminalInstance.ready) {
      return;
    }
    let cancelFocus = terminalInstance.controller.focus();
    let settleTimer: number | null = null;
    const settleFrame = window.requestAnimationFrame(() => {
      settleTimer = window.setTimeout(() => {
        // The overlay's own mount transition can steal focus back. Re-assert it
        // once that has settled.
        cancelFocus?.();
        cancelFocus = terminalInstance.controller.focus();
        focusTerminalInstanceSurface({ container: containerRef.current });
      }, 50);
    });
    return () => {
      window.cancelAnimationFrame(settleFrame);
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      cancelFocus?.();
    };
  }, [activeTabKey, terminalInstance.controller, terminalInstance.ready]);

  const status = bridgeError || terminalInstance.error || null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header stays at child index 0 and the terminal frame at index 1, so
          React never remounts the viewport when header content changes. The
          restart control lives here rather than floating over the terminal,
          where it would occlude a full-screen TUI's top-right corner and
          swallow every click in that region. */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border/70 bg-card px-3 py-1.5">
        <button
          type="button"
          aria-label="Restart CLI session"
          className="rounded border border-border/70 bg-card px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={restartActiveSession}
        >
          Restart
        </button>
      </div>
      <div className={TERMINAL_SURFACE_PANEL_CLASS_NAME}>
        <div className={TERMINAL_SURFACE_VIEWPORT_CLASS_NAME}>
          {status ? (
            <div
              role="alert"
              className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-border/70 bg-card px-3 py-2 text-xs text-destructive"
            >
              <span className="truncate">{status}</span>
              <button
                type="button"
                className="shrink-0 rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setRendererRestartToken((value) => value + 1)}
              >
                Restart renderer
              </button>
            </div>
          ) : null}
          {sessionExited ? (
            <div
              role="status"
              className="absolute inset-x-0 bottom-0 z-20 border-t border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground"
            >
              Session exited. Use Restart to start a new one.
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
            key={`${activeTabKey}:${rendererRestartToken}`}
            ref={containerRef}
            data-terminal-surface
            data-testid="standalone-cli-terminal-viewport"
            className={TERMINAL_SURFACE_CLASS_NAME}
          />
        </div>
      </div>
    </div>
  );
}
