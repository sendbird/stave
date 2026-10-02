import { useAccountRuntimeOptions } from "@/lib/providers/use-provider-accounts";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { standaloneCliStyles as styles } from "@/components/layout/standalone-cli/standalone-cli.styles";
import { StandaloneCliAccountSelect } from "@/components/layout/standalone-cli/StandaloneCliAccountSelect";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader } from "@/components/ui/loader";
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
  buildStandaloneCliTab,
  buildStandaloneCliTabs,
  getStandaloneCliTabKey,
  resolveStandaloneCliActiveTabId,
  resolveStandaloneCliTabAccountProfileId,
  STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
  STANDALONE_CLI_WORKSPACE_ID,
  type StandaloneCliTab,
  type StandaloneCliTabId,
} from "@/lib/terminal/standalone-cli";
import { useAppStore } from "@/store/app.store";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

/** Pure so the payload contract can be asserted without a DOM. */
export function buildStandaloneCliCreateSessionArgs(args: {
  tab: StandaloneCliTab;
  folderPath: string;
  cols: number;
  rows: number;
  deliveryMode: "poll" | "push";
  claudeBinaryPath: string;
  codexBinaryPath: string;
  cursorBinaryPath: string;
  kiroBinaryPath: string;
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
      accountProfileId: args.tab.accountProfileId ?? "system-default",
      claudeBinaryPath: args.claudeBinaryPath,
      codexBinaryPath: args.codexBinaryPath,
      cursorBinaryPath: args.cursorBinaryPath,
      kiroBinaryPath: args.kiroBinaryPath,
    }),
  };
}

/**
 * Cursor keeps conversations server-side, so unlike Codex and Kiro there is
 * nothing to discover after spawn. `agent create-chat` is the only way to get
 * an id and it has to be known before launch, so it runs here — an async step
 * ahead of the synchronous host `createCliSession`.
 *
 * A failure (offline, signed out, CLI missing) is not fatal: the tab starts
 * without an id and simply cannot be resumed after an app restart. Pure so the
 * fallback can be asserted without a DOM.
 */
export async function resolveStandaloneCliLaunchTab(args: {
  tab: StandaloneCliTab;
  folderPath: string;
  cursorBinaryPath: string;
  createCursorChatId?: (input: {
    cwd: string;
    cursorBinaryPath?: string;
  }) => Promise<{ ok: boolean; chatId?: string; stderr?: string }>;
}): Promise<StandaloneCliTab> {
  if (args.tab.id !== "cursor" || args.tab.nativeSessionId) {
    return args.tab;
  }
  if (!args.createCursorChatId) {
    return args.tab;
  }
  const result = await args.createCursorChatId({
    cwd: args.folderPath,
    ...(args.cursorBinaryPath.trim()
      ? { cursorBinaryPath: args.cursorBinaryPath.trim() }
      : {}),
  });
  return result.ok && result.chatId
    ? { ...args.tab, nativeSessionId: result.chatId }
    : args.tab;
}

/**
 * The popover keeps this subtree mounted through a close, so hiding must not be
 * confused with tearing down. Pure so the three-way split can be asserted
 * without a DOM:
 *
 * - `enabled` — xterm itself. Always on: disposing it is what forces a snapshot
 *   replay on return, and a snapshot arrives at the width the PTY had before
 *   the close, which is where stray re-wrapping comes from.
 * - `visible` — renderer-local work only (WebGL, cursor blink, refit on
 *   return). This is the one that follows the popover.
 * - `isVisible` — the host attachment. Always on, so output written while the
 *   panel is closed lands in the live buffer instead of a snapshot.
 */
export function resolveStandaloneCliTerminalLifecycle(args: {
  visible: boolean;
}) {
  return {
    enabled: true,
    visible: args.visible,
    isVisible: true,
  } as const;
}

export function StandaloneCliTerminal(props: {
  folderPath: string;
  installedTabIds: readonly StandaloneCliTabId[];
  visible: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputHandlerRef = useRef<(input: string) => void>(() => {});
  const resizeHandlerRef = useRef<
    (cols: number, rows: number) => Promise<void> | void
  >(() => {});
  const [rendererRestartToken, setRendererRestartToken] = useState(0);

  const defaults = useAccountRuntimeOptions();
  const accountProfileIdByTab = useStandaloneCliStore(s => s.accountProfileIdByTab);
  const [storedActiveTabId, nativeSessionIdByTab] = useStandaloneCliStore(
    useShallow(
      (state) => [state.activeTabId, state.nativeSessionIdByTab] as const,
    ),
  );
  const activeTabId = resolveStandaloneCliActiveTabId({
    activeTabId: storedActiveTabId,
    installedTabIds: props.installedTabIds,
  });
  const setTabNativeSession = useStandaloneCliStore(
    (state) => state.setTabNativeSession,
  );

  const [
    claudeBinaryPath,
    codexBinaryPath,
    cursorBinaryPath,
    kiroBinaryPath,
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
          state.settings.cursorBinaryPath,
          state.settings.kiroBinaryPath,
          state.settings.terminalFontFamily,
          state.settings.terminalFontSize,
          state.settings.terminalLineHeight,
          state.settings.terminalCursorStyle,
          state.isDarkMode,
        ] as const,
    ),
  );

  // Derived outside the selector: selectors must never return fresh arrays.
  // Every tab stays here, installed or not, so a CLI that drops out of the tab
  // bar keeps its running session instead of being closed as a removed tab.
  const tabs = useMemo(
    () =>
      buildStandaloneCliTabs({
        folderPath: props.folderPath,
        nativeSessionIdByTab,
        accountProfileIdByTab, defaults,
      }),
    [props.folderPath, nativeSessionIdByTab, accountProfileIdByTab, defaults],
  );
  // The session bootstrap effect restarts whenever `activeTab` changes
  // identity. Keep the active tab keyed on its own fields only: launching pins
  // the tab's account, and that pin must not count as a change.
  const activeNativeSessionId = nativeSessionIdByTab[activeTabId];
  const activeAccountProfileId = resolveStandaloneCliTabAccountProfileId({
    tabId: activeTabId,
    nativeSessionId: activeNativeSessionId,
    pinnedAccountProfileId: accountProfileIdByTab[activeTabId],
    defaults,
  });
  const activeTab = useMemo(
    () =>
      buildStandaloneCliTab({
        tabId: activeTabId,
        folderPath: props.folderPath,
        nativeSessionId: activeNativeSessionId,
        accountProfileId: activeAccountProfileId,
      }),
    [
      activeAccountProfileId,
      activeNativeSessionId,
      activeTabId,
      props.folderPath,
    ],
  );
  const activeTabKey = getStandaloneCliTabKey(activeTabId);

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
      useStandaloneCliStore.getState().pinTabAccount(args.tab.id, args.tab.accountProfileId ?? "system-default");
      const launchTab = await resolveStandaloneCliLaunchTab({
        tab: args.tab,
        folderPath: props.folderPath,
        cursorBinaryPath,
        createCursorChatId: window.api?.terminal?.createCursorChatId,
      });
      return createCliSession(
        buildStandaloneCliCreateSessionArgs({
          tab: launchTab,
          folderPath: props.folderPath,
          cols: args.cols,
          rows: args.rows,
          deliveryMode: args.deliveryMode,
          claudeBinaryPath,
          codexBinaryPath,
          cursorBinaryPath,
          kiroBinaryPath,
        }),
      );
    },
    [
      claudeBinaryPath,
      codexBinaryPath,
      cursorBinaryPath,
      kiroBinaryPath,
      props.folderPath,
    ],
  );

  const lifecycle = resolveStandaloneCliTerminalLifecycle({
    visible: props.visible,
  });

  const terminalInstance = useCliTerminalInstance({
    containerRef,
    instanceKey: activeTabKey,
    enabled: lifecycle.enabled,
    visible: lifecycle.visible,
    // `useCliTerminalInstance` folds `instanceKey` into the token it hands the
    // renderer, so a tab switch rebuilds xterm into the freshly keyed mount
    // node instead of painting into the detached one.
    restartToken: rendererRestartToken,
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
    isVisible: lifecycle.isVisible,
    getTabKey,
    createSession,
    slotKeyForTab,
    setTabNativeSession,
    terminalController: terminalInstance.controller,
    terminalReady: terminalInstance.ready,
    terminalRevision: terminalInstance.revision,
  });

  // A running CLI cannot change accounts, so the switch is a restart under the
  // new account after confirmation. Restart invalidates pending launches and
  // queues their shutdown before the replacement bootstrap can adopt a slot.
  const switchActiveTabAccount = useCallback(
    (accountProfileId: string) => {
      if (accountProfileId === activeTab.accountProfileId) {
        return;
      }
      useStandaloneCliStore
        .getState()
        .setTabAccount(activeTab.id, accountProfileId);
      restartActiveSession();
    },
    [activeTab.accountProfileId, activeTab.id, restartActiveSession],
  );

  useLayoutEffect(() => {
    inputHandlerRef.current = handleTerminalInput;
    resizeHandlerRef.current = handleTerminalResize;
  }, [handleTerminalInput, handleTerminalResize]);

  // Opening the popover leaves focus on the popup, so claim it for the terminal
  // instead of making the user click into it before typing. This re-runs on
  // every open because the panel is never unmounted in between.
  useEffect(() => {
    if (!props.visible || !terminalInstance.ready) {
      return;
    }
    let cancelFocus = terminalInstance.controller.focus();
    let settleTimer: number | null = null;
    const settleFrame = window.requestAnimationFrame(() => {
      settleTimer = window.setTimeout(() => {
        // The popover's own open transition can steal focus back. Re-assert it
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
  }, [
    activeTabKey,
    props.visible,
    terminalInstance.controller,
    terminalInstance.ready,
  ]);

  const status = bridgeError || terminalInstance.error || null;

  return (
    <div className={sx(styles.terminalColumn)}>
      {/* Header stays at child index 0 and the terminal frame at index 1, so
          React never remounts the viewport when header content changes. The
          restart control lives here rather than floating over the terminal,
          where it would occlude a full-screen TUI's top-right corner and
          swallow every click in that region. */}
      <div className={sx(styles.terminalHeader)}>
        <StandaloneCliAccountSelect
          tabId={activeTab.id}
          value={activeAccountProfileId}
          onValueChange={switchActiveTabAccount}
        />
        <AdsButton
          layout="host"
          type="button"
          aria-label="Restart CLI session"
          xstyle={styles.restartButton}
          onClick={restartActiveSession}
        >
          Restart
        </AdsButton>
      </div>
      <div className={TERMINAL_SURFACE_PANEL_CLASS_NAME}>
        <div className={TERMINAL_SURFACE_VIEWPORT_CLASS_NAME}>
          {status ? (
            <div role="alert" className={sx(styles.statusBanner)}>
              <span className={sx(styles.statusText)}>{status}</span>
              <AdsButton
                layout="host"
                type="button"
                xstyle={styles.statusAction}
                onClick={() => setRendererRestartToken((value) => value + 1)}
              >
                Restart renderer
              </AdsButton>
            </div>
          ) : null}
          {sessionExited ? (
            <div role="status" className={sx(styles.exitedBanner)}>
              Session exited. Use Restart to start a new one.
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
