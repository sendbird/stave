import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createLatestAsyncDispatcher } from "@/components/layout/pty-session-surface.utils";
import type { CliTerminalInstanceController } from "@/components/layout/useCliTerminalInstance";

const TERMINAL_POLL_INTERVAL_MS = 120;
const TERMINAL_INPUT_BUFFER_CHAR_LIMIT = 200_000;
const CLI_TRANSCRIPT_CHAR_LIMIT = 2_000_000;
const CLI_TRANSCRIPT_FLUSH_TIMEOUT_MS = 500;

type CreateSessionResult = {
  ok: boolean;
  sessionId?: string;
  nativeSessionId?: string;
  stderr?: string;
};

type TerminalResizeRequest = {
  sessionId: string;
  cols: number;
  rows: number;
};

type SessionExitInfo = {
  exitCode: number;
  signal?: number;
};

type SetBridgeError = Dispatch<SetStateAction<Record<string, string>>>;

function appendTerminalText(
  existing: string,
  nextChunk: string,
  limit: number,
) {
  if (!nextChunk) {
    return existing;
  }
  const combined = `${existing}${nextChunk}`;
  if (combined.length <= limit) {
    return combined;
  }
  const overflowStart = combined.length - limit;
  const nextLineBreak = combined.indexOf("\n", overflowStart);
  return nextLineBreak >= 0
    ? combined.slice(nextLineBreak + 1)
    : combined.slice(-limit);
}

function appendTerminalInput(existing: string, nextChunk: string, limit: number) {
  if (!nextChunk) {
    return existing;
  }
  const combined = `${existing}${nextChunk}`;
  return combined.length <= limit ? combined : combined.slice(-limit);
}

function setBridgeErrorForTabKey(
  update: SetBridgeError,
  tabKey: string,
  message: string,
) {
  update((previous) => {
    if (!message) {
      if (!(tabKey in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[tabKey];
      return next;
    }

    if (previous[tabKey] === message) {
      return previous;
    }

    return {
      ...previous,
      [tabKey]: message,
    };
  });
}

export interface UseCliSessionManagerArgs<
  TTab extends { id: string; nativeSessionId?: string },
> {
  activeTab: TTab | null;
  activeTabId: string | null;
  tabs: readonly TTab[];
  workspaceId: string;
  transcriptStorageKey: string;
  isVisible: boolean;
  getTabKey: (tab: TTab) => string;
  createSession: (args: {
    tab: TTab;
    cols: number;
    rows: number;
    deliveryMode: "poll" | "push";
  }) => Promise<CreateSessionResult>;
  setTabNativeSession: (args: {
    tabId: string;
    nativeSessionId?: string;
  }) => void;
  slotKeyForTab?: (tab: TTab) => string | null;
  terminalController: CliTerminalInstanceController;
  terminalReady: boolean;
  terminalRevision: number;
}

export interface UseCliSessionManagerReturn {
  activeSessionId: string | null;
  bridgeError: string;
  handleTerminalInput: (input: string) => void;
  handleTerminalResize: (cols: number, rows: number) => Promise<void>;
  restartActiveSession: () => void;
  sessionExited: SessionExitInfo | null;
  writeToActiveSession: (input: string) => boolean;
}

export function useCliSessionManager<
  TTab extends { id: string; nativeSessionId?: string },
>(
  args: UseCliSessionManagerArgs<TTab>,
): UseCliSessionManagerReturn {
  const terminalControllerRef = useRef(args.terminalController);

  useEffect(() => {
    terminalControllerRef.current = args.terminalController;
  }, [args.terminalController]);

  const sessionIdByTabKeyRef = useRef<Record<string, string>>({});
  const tabKeyBySessionIdRef = useRef<Record<string, string>>({});
  const pendingInputBySessionRef = useRef<Record<string, string>>({});
  const writeInFlightBySessionRef = useRef<Record<string, boolean>>({});
  const flushScheduledBySessionRef = useRef<Record<string, boolean>>({});
  const exitedByTabKeyRef = useRef<Record<string, SessionExitInfo>>({});
  const lastResizeBySessionRef = useRef<Record<string, { cols: number; rows: number }>>({});
  const attachmentIdByTabKeyRef = useRef<Record<string, string>>({});
  const transcriptByTabKeyRef = useRef<Record<string, string>>({});
  const transcriptFlushTimerRef = useRef<number | null>(null);
  const transcriptLoadedRef = useRef(false);
  const activeTabKeyRef = useRef<string | null>(null);
  const attachedSessionIdRef = useRef<string | null>(null);
  const attachedAttachmentIdRef = useRef<string | null>(null);
  const terminalRevisionRef = useRef(args.terminalRevision);
  const streamReadyRef = useRef(false);

  const [bridgeErrorByTabKey, setBridgeErrorByTabKey] = useState<Record<string, string>>({});
  const [sessionVersion, setSessionVersion] = useState(0);
  const [sessionExited, setSessionExited] = useState<SessionExitInfo | null>(null);
  const [restartVersion, setRestartVersion] = useState(0);

  const supportsPushTerminalOutput =
    typeof window !== "undefined" &&
    Boolean(window.api?.terminal?.subscribeSessionOutput);

  // ---------------------------------------------------------------------------
  // Transcript persistence helpers
  // ---------------------------------------------------------------------------

  function cancelTranscriptFlush() {
    if (transcriptFlushTimerRef.current === null) {
      return;
    }
    if (typeof cancelIdleCallback === "function") {
      cancelIdleCallback(transcriptFlushTimerRef.current);
    }
    window.clearTimeout(transcriptFlushTimerRef.current);
    transcriptFlushTimerRef.current = null;
  }

  function scheduleTranscriptFlush() {
    if (transcriptFlushTimerRef.current !== null) {
      return;
    }
    const doFlush = () => {
      transcriptFlushTimerRef.current = null;
      try {
        window.localStorage.setItem(
          args.transcriptStorageKey,
          JSON.stringify(transcriptByTabKeyRef.current),
        );
      } catch {
        // Ignore localStorage quota errors.
      }
    };
    transcriptFlushTimerRef.current =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(doFlush, { timeout: CLI_TRANSCRIPT_FLUSH_TIMEOUT_MS })
        : window.setTimeout(doFlush, CLI_TRANSCRIPT_FLUSH_TIMEOUT_MS);
  }

  function recordTranscriptOutput(tabKey: string, output: string) {
    if (!output) {
      return;
    }
    transcriptByTabKeyRef.current[tabKey] = appendTerminalText(
      transcriptByTabKeyRef.current[tabKey] ?? "",
      output,
      CLI_TRANSCRIPT_CHAR_LIMIT,
    );
    scheduleTranscriptFlush();
  }

  // ---------------------------------------------------------------------------
  // Session state
  // ---------------------------------------------------------------------------

  const activeTabKey = args.activeTab ? args.getTabKey(args.activeTab) : null;
  const activeSessionId = activeTabKey
    ? (sessionIdByTabKeyRef.current[activeTabKey] ?? null)
    : null;
  const bridgeError = activeTabKey
    ? (bridgeErrorByTabKey[activeTabKey] ?? "")
    : "";

  const rememberNativeSessionId = useCallback((payload: {
    tabId: string;
    nativeSessionId?: string;
  }) => {
    const nativeSessionId = payload.nativeSessionId?.trim();
    if (!nativeSessionId) {
      return;
    }
    args.setTabNativeSession({
      tabId: payload.tabId,
      nativeSessionId,
    });
  }, [args.setTabNativeSession]);

  useEffect(() => {
    activeTabKeyRef.current = activeTabKey;
  }, [activeTabKey]);

  useEffect(() => {
    terminalRevisionRef.current = args.terminalRevision;
  }, [args.terminalRevision]);

  const resizeSessionDispatcherRef = useRef(
    createLatestAsyncDispatcher<TerminalResizeRequest>({
      run: async ({ sessionId, cols, rows }) => {
        const resizeSession = window.api?.terminal?.resizeSession;
        if (!resizeSession) {
          return;
        }
        const result = await resizeSession({ sessionId, cols, rows });
        if (!result?.ok) {
          throw new Error(result?.stderr || "Failed to resize backend session.");
        }
      },
      onError: (error, request) => {
        const lastResize = lastResizeBySessionRef.current[request.sessionId];
        if (
          lastResize &&
          lastResize.cols === request.cols &&
          lastResize.rows === request.rows
        ) {
          delete lastResizeBySessionRef.current[request.sessionId];
        }
        console.warn("[cli-session] failed to resize backend session", error);
      },
    }),
  );

  const notifySessionChange = useCallback(() => {
    setSessionVersion((value) => value + 1);
  }, []);

  const registerSession = useCallback((
    tabKey: string,
    sessionId: string,
    attachmentId?: string,
  ) => {
    sessionIdByTabKeyRef.current[tabKey] = sessionId;
    tabKeyBySessionIdRef.current[sessionId] = tabKey;
    pendingInputBySessionRef.current[sessionId] = "";
    writeInFlightBySessionRef.current[sessionId] = false;
    flushScheduledBySessionRef.current[sessionId] = false;
    delete exitedByTabKeyRef.current[tabKey];
    delete lastResizeBySessionRef.current[sessionId];
    if (attachmentId) {
      attachmentIdByTabKeyRef.current[tabKey] = attachmentId;
    } else {
      delete attachmentIdByTabKeyRef.current[tabKey];
    }
    notifySessionChange();
  }, [notifySessionChange]);

  const clearSessionRegistration = useCallback((tabKey: string, sessionId: string) => {
    if (sessionIdByTabKeyRef.current[tabKey] === sessionId) {
      delete sessionIdByTabKeyRef.current[tabKey];
    }
    if (tabKeyBySessionIdRef.current[sessionId] === tabKey) {
      delete tabKeyBySessionIdRef.current[sessionId];
    }
    delete pendingInputBySessionRef.current[sessionId];
    delete writeInFlightBySessionRef.current[sessionId];
    delete flushScheduledBySessionRef.current[sessionId];
    delete lastResizeBySessionRef.current[sessionId];
    delete attachmentIdByTabKeyRef.current[tabKey];
    notifySessionChange();
  }, [notifySessionChange]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    const sessionId = attachedSessionIdRef.current;
    if (!sessionId || cols < 1 || rows < 1) {
      return Promise.resolve();
    }

    const lastResize = lastResizeBySessionRef.current[sessionId];
    if (lastResize && lastResize.cols === cols && lastResize.rows === rows) {
      return Promise.resolve();
    }

    lastResizeBySessionRef.current[sessionId] = { cols, rows };
    return resizeSessionDispatcherRef.current.schedule({ sessionId, cols, rows });
  }, []);

  const enqueueTerminalInput = useCallback((sessionId: string, input: string) => {
    pendingInputBySessionRef.current[sessionId] = appendTerminalInput(
      pendingInputBySessionRef.current[sessionId] ?? "",
      input,
      TERMINAL_INPUT_BUFFER_CHAR_LIMIT,
    );

    if (flushScheduledBySessionRef.current[sessionId]) {
      return;
    }

    flushScheduledBySessionRef.current[sessionId] = true;
    queueMicrotask(() => {
      flushScheduledBySessionRef.current[sessionId] = false;
      flushTerminalInput(sessionId);
    });
  }, []);

  const flushTerminalInput = useCallback((sessionId: string) => {
    if (writeInFlightBySessionRef.current[sessionId]) {
      return;
    }

    const input = pendingInputBySessionRef.current[sessionId];
    if (!input) {
      return;
    }

    const writeSession = window.api?.terminal?.writeSession;
    const tabKey = tabKeyBySessionIdRef.current[sessionId];
    if (!writeSession) {
      if (tabKey) {
        terminalControllerRef.current.writeln(
          "\r\n[error] CLI session bridge unavailable.",
        );
        setBridgeErrorForTabKey(
          setBridgeErrorByTabKey,
          tabKey,
          "CLI session bridge unavailable. Use bun run dev:desktop.",
        );
      }
      delete pendingInputBySessionRef.current[sessionId];
      return;
    }

    pendingInputBySessionRef.current[sessionId] = "";
    writeInFlightBySessionRef.current[sessionId] = true;

    void writeSession({ sessionId, input })
      .catch(() => {
        pendingInputBySessionRef.current[sessionId] = appendTerminalInput(
          input,
          pendingInputBySessionRef.current[sessionId] ?? "",
          TERMINAL_INPUT_BUFFER_CHAR_LIMIT,
        );
        if (tabKey) {
          terminalControllerRef.current.writeln(
            "\r\n[error] failed to write CLI session input.",
          );
        }
      })
      .finally(() => {
        writeInFlightBySessionRef.current[sessionId] = false;
        if (pendingInputBySessionRef.current[sessionId]) {
          flushTerminalInput(sessionId);
        }
      });
  }, []);

  const handleTerminalInput = useCallback((input: string) => {
    const sessionId = attachedSessionIdRef.current;
    if (!sessionId || !input) {
      return;
    }
    enqueueTerminalInput(sessionId, input);
  }, [enqueueTerminalInput]);

  const writeToActiveSession = useCallback((input: string) => {
    const sessionId = attachedSessionIdRef.current;
    if (!sessionId || !input) {
      return false;
    }
    enqueueTerminalInput(sessionId, input);
    return true;
  }, [enqueueTerminalInput]);

  // ---------------------------------------------------------------------------
  // IPC event subscriptions
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const subscribeSessionExit = window.api?.terminal?.subscribeSessionExit;
    if (!subscribeSessionExit) {
      return;
    }

    return subscribeSessionExit(({ sessionId, exitCode, signal }) => {
      const tabKey = tabKeyBySessionIdRef.current[sessionId];
      if (!tabKey) {
        return;
      }

      if (attachedSessionIdRef.current === sessionId) {
        attachedSessionIdRef.current = null;
        attachedAttachmentIdRef.current = null;
      }
      exitedByTabKeyRef.current[tabKey] = { exitCode, signal };
      clearSessionRegistration(tabKey, sessionId);

      const signalHint = signal ? ` (signal ${signal})` : "";
      const exitMessage =
        exitCode === 0
          ? `\r\n\x1b[2m[process exited with code 0${signalHint}]\x1b[0m\r\n`
          : `\r\n\x1b[33m[process exited with code ${exitCode}${signalHint}]\x1b[0m\r\n`;

      recordTranscriptOutput(tabKey, exitMessage);

      if (activeTabKeyRef.current === tabKey) {
        terminalControllerRef.current.write(exitMessage);
        setSessionExited({ exitCode, signal });
      }
    });
  }, [clearSessionRegistration]);

  useEffect(() => {
    if (!supportsPushTerminalOutput) {
      return;
    }

    const subscribeSessionOutput = window.api?.terminal?.subscribeSessionOutput;
    if (!subscribeSessionOutput) {
      return;
    }

    return subscribeSessionOutput(({ sessionId, output }) => {
      if (!output || sessionId !== attachedSessionIdRef.current) {
        return;
      }
      if (!streamReadyRef.current) {
        return;
      }
      const tabKey = tabKeyBySessionIdRef.current[sessionId];
      if (tabKey) {
        recordTranscriptOutput(tabKey, output);
      }
      terminalControllerRef.current.write(output);
    });
  }, [supportsPushTerminalOutput]);

  useEffect(() => {
    if (supportsPushTerminalOutput) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      const sessionId = attachedSessionIdRef.current;
      const readSession = window.api?.terminal?.readSession;
      if (sessionId && readSession) {
        const result = await readSession({ sessionId });
        if (!cancelled && result.ok && result.output) {
          const tabKey = tabKeyBySessionIdRef.current[sessionId];
          if (tabKey) {
            recordTranscriptOutput(tabKey, result.output);
          }
          terminalControllerRef.current.write(result.output);
        }
      }

      if (!cancelled) {
        window.setTimeout(() => {
          void poll();
        }, TERMINAL_POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [supportsPushTerminalOutput]);

  // ---------------------------------------------------------------------------
  // Transcript load / save lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (transcriptLoadedRef.current) {
      return;
    }
    transcriptLoadedRef.current = true;
    const raw = window.localStorage.getItem(args.transcriptStorageKey);
    try {
      transcriptByTabKeyRef.current = raw
        ? (JSON.parse(raw) as Record<string, string>)
        : {};
    } catch {
      transcriptByTabKeyRef.current = {};
    }

    return () => {
      cancelTranscriptFlush();
      try {
        window.localStorage.setItem(
          args.transcriptStorageKey,
          JSON.stringify(transcriptByTabKeyRef.current),
        );
      } catch {
        // Ignore localStorage quota errors on unmount.
      }
    };
  }, [args.transcriptStorageKey]);

  // ---------------------------------------------------------------------------
  // Workspace-switch: detach sessions belonging to the previous workspace
  // ---------------------------------------------------------------------------

  const previousWorkspaceIdRef = useRef(args.workspaceId);
  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    previousWorkspaceIdRef.current = args.workspaceId;
    if (previousWorkspaceId === args.workspaceId) {
      return;
    }

    const detachSession = window.api?.terminal?.detachSession;
    if (!detachSession) {
      return;
    }

    const previousPrefix = `${previousWorkspaceId}:`;
    for (const [tabKey, sessionId] of Object.entries(sessionIdByTabKeyRef.current)) {
      if (!tabKey.startsWith(previousPrefix)) {
        continue;
      }
      if (attachedSessionIdRef.current === sessionId) {
        attachedSessionIdRef.current = null;
        attachedAttachmentIdRef.current = null;
      }
      const attachmentId = attachmentIdByTabKeyRef.current[tabKey];
      void detachSession({ sessionId, attachmentId }).catch(() => {
        // Best-effort detach while preserving the session mapping.
      });
    }
  }, [args.workspaceId]);

  // ---------------------------------------------------------------------------
  // Close sessions for removed tabs
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const closeSession = window.api?.terminal?.closeSession;
    if (!closeSession) {
      return;
    }

    const liveTabKeys = new Set(args.tabs.map((tab) => args.getTabKey(tab)));
    const currentPrefix = `${args.workspaceId}:`;
    const removedEntries = Object.entries(sessionIdByTabKeyRef.current).filter(
      ([tabKey]) => tabKey.startsWith(currentPrefix) && !liveTabKeys.has(tabKey),
    );

    if (removedEntries.length === 0) {
      return;
    }

    void Promise.allSettled(
      removedEntries.map(([, sessionId]) => closeSession({ sessionId })),
    ).finally(() => {
      for (const [tabKey, sessionId] of removedEntries) {
        clearSessionRegistration(tabKey, sessionId);
        delete exitedByTabKeyRef.current[tabKey];
        delete transcriptByTabKeyRef.current[tabKey];
        setBridgeErrorForTabKey(setBridgeErrorByTabKey, tabKey, "");
      }
      scheduleTranscriptFlush();
    });
  }, [args.getTabKey, args.tabs, args.workspaceId, clearSessionRegistration]);

  // ---------------------------------------------------------------------------
  // Sync sessionExited state
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!activeTabKey) {
      setSessionExited(null);
      return;
    }
    setSessionExited(exitedByTabKeyRef.current[activeTabKey] ?? null);
  }, [activeTabKey, sessionVersion]);

  // ---------------------------------------------------------------------------
  // Bootstrap effect: create / reattach CLI session
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const activeTab = args.activeTab;
    const knownNativeSessionId = activeTab?.nativeSessionId?.trim();
    const getSessionResumeInfo = window.api?.terminal?.getSessionResumeInfo;
    if (!activeTab || !activeSessionId || knownNativeSessionId || !getSessionResumeInfo) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    let attempts = 0;

    const poll = async () => {
      let result:
        | { ok: boolean; nativeSessionId?: string; stderr?: string }
        | null = null;
      try {
        result = await getSessionResumeInfo({ sessionId: activeSessionId });
      } catch {
        return;
      }
      if (cancelled) {
        return;
      }

      const nativeSessionId =
        result?.ok ? result.nativeSessionId?.trim() : "";
      if (nativeSessionId) {
        rememberNativeSessionId({
          tabId: activeTab.id,
          nativeSessionId,
        });
        return;
      }

      attempts += 1;
      if (attempts >= 60) {
        return;
      }

      timer = window.setTimeout(() => {
        void poll();
      }, 500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [
    activeSessionId,
    args.activeTab,
    rememberNativeSessionId,
  ]);

  useEffect(() => {
    if (!args.activeTab || !activeTabKey || !args.isVisible || !args.terminalReady) {
      return;
    }

    const tabKey = activeTabKey;
    const attachSession = window.api?.terminal?.attachSession;
    const getSlotState = window.api?.terminal?.getSlotState;
    const detachSession = window.api?.terminal?.detachSession;
    const resumeSessionStream = window.api?.terminal?.resumeSessionStream;
    const deliveryMode: "poll" | "push" = supportsPushTerminalOutput ? "push" : "poll";

    if (!attachSession || !detachSession || !resumeSessionStream) {
      setBridgeErrorForTabKey(
        setBridgeErrorByTabKey,
        tabKey,
        "CLI session bridge unavailable. Use bun run dev:desktop.",
      );
      return;
    }

    let cancelled = false;
    let activeAttachment:
      | { sessionId: string; attachmentId: string }
      | null = null;
    const activeTab = args.activeTab;
    const rendererRevision = args.terminalRevision;

    const ensureActiveSession = async () => {
      const measured = terminalControllerRef.current.getSize();
      const cols = measured.cols || 80;
      const rows = measured.rows || 24;

      const hydrateAttachedSession = async (sessionId: string) => {
        streamReadyRef.current = false;
        const attached = await attachSession({
          sessionId,
          deliveryMode,
        });
        if (!attached.ok || !attached.attachmentId) {
          return false;
        }

        if (cancelled || rendererRevision !== terminalRevisionRef.current) {
          await detachSession({
            sessionId,
            attachmentId: attached.attachmentId,
          });
          return true;
        }

        registerSession(tabKey, sessionId, attached.attachmentId);
        activeAttachment = {
          sessionId,
          attachmentId: attached.attachmentId,
        };
        attachedSessionIdRef.current = sessionId;
        attachedAttachmentIdRef.current = attached.attachmentId;
        setBridgeErrorForTabKey(setBridgeErrorByTabKey, tabKey, "");
        terminalControllerRef.current.clear();

        // Restore scrollback from saved transcript (all output accumulated
        // before this detach/reattach cycle).
        const savedTranscript = transcriptByTabKeyRef.current[tabKey] ?? "";
        if (savedTranscript) {
          terminalControllerRef.current.write(savedTranscript);
        }

        // Append any output that accumulated while the session was detached.
        // This extends the scrollback with the detach-period content.
        if (attached.backlog) {
          recordTranscriptOutput(tabKey, attached.backlog);
          terminalControllerRef.current.write(attached.backlog);
        }

        // Always overlay the host's serialized screen state on the viewport.
        // This corrects cursor position, colors, and layout after raw
        // transcript replay — critical for TUI tools like Claude Code.
        if (typeof attached.screenState === "string" && attached.screenState) {
          // CSI H = cursor home, CSI 2 J = erase display (keeps scrollback).
          terminalControllerRef.current.write("\x1b[H\x1b[2J");
          terminalControllerRef.current.write(attached.screenState);
        }

        await handleTerminalResize(cols, rows);
        if (cancelled || rendererRevision !== terminalRevisionRef.current) {
          clearSessionRegistration(tabKey, sessionId);
          if (attachedSessionIdRef.current === sessionId) {
            attachedSessionIdRef.current = null;
            attachedAttachmentIdRef.current = null;
          }
          activeAttachment = null;
          await detachSession({
            sessionId,
            attachmentId: attached.attachmentId,
          });
          return true;
        }
        const resumed = await resumeSessionStream({
          sessionId,
          attachmentId: attached.attachmentId,
        });
        if (resumed.ok) {
          streamReadyRef.current = true;
        } else {
          setBridgeErrorForTabKey(
            setBridgeErrorByTabKey,
            tabKey,
            resumed.stderr?.trim() || "Failed to resume CLI session stream.",
          );
        }
        return true;
      };

      const rememberedSessionId = sessionIdByTabKeyRef.current[tabKey];
      if (rememberedSessionId) {
        const restored = await hydrateAttachedSession(rememberedSessionId);
        if (restored) {
          return;
        }
      }

      const slotKey = args.slotKeyForTab?.(activeTab) ?? null;
      if (slotKey && getSlotState) {
        const slotState = await getSlotState({ slotKey });
        if (cancelled) {
          return;
        }
        if (
          slotState.sessionId &&
          (slotState.state === "running" || slotState.state === "background")
        ) {
          const restored = await hydrateAttachedSession(slotState.sessionId);
          if (restored) {
            return;
          }
        } else if (slotState.state === "exited") {
          exitedByTabKeyRef.current[tabKey] = {
            exitCode: slotState.exitCode ?? -1,
            signal: slotState.signal,
          };
          setSessionExited({
            exitCode: slotState.exitCode ?? -1,
            signal: slotState.signal,
          });
        }
      }

      if (cancelled) {
        return;
      }

      const created = await args.createSession({
        tab: activeTab,
        cols,
        rows,
        deliveryMode,
      });
      if (!created.ok || !created.sessionId) {
        setBridgeErrorForTabKey(
          setBridgeErrorByTabKey,
          tabKey,
          created.stderr?.trim() || "Failed to create CLI session.",
        );
        terminalControllerRef.current.writeln(
          `\r\n[error] ${created.stderr?.trim() || "failed to create CLI session."}`,
        );
        return;
      }

      rememberNativeSessionId({
        tabId: activeTab.id,
        nativeSessionId: created.nativeSessionId,
      });

      if (cancelled) {
        void window.api?.terminal?.closeSession?.({
          sessionId: created.sessionId,
        });
        return;
      }
      const restored = await hydrateAttachedSession(created.sessionId);
      if (restored) {
        setSessionExited(null);
      }
    };

    void ensureActiveSession();

    return () => {
      cancelled = true;
      if (!activeAttachment) {
        return;
      }
      if (attachedSessionIdRef.current === activeAttachment.sessionId) {
        attachedSessionIdRef.current = null;
        attachedAttachmentIdRef.current = null;
      }
      void detachSession(activeAttachment).catch(() => {
        // Best-effort detach; slot state owns background continuity.
      });
    };
  }, [
    args.activeTab,
    args.createSession,
    activeTabKey,
    args.isVisible,
    args.slotKeyForTab,
    args.terminalReady,
    args.terminalRevision,
    clearSessionRegistration,
    handleTerminalResize,
    registerSession,
    rememberNativeSessionId,
    restartVersion,
    supportsPushTerminalOutput,
  ]);

  // ---------------------------------------------------------------------------
  // Restart
  // ---------------------------------------------------------------------------

  const restartActiveSession = useCallback(() => {
    const activeTab = args.activeTab;
    const tabKey = activeTabKeyRef.current;
    const sessionId = tabKey
      ? (sessionIdByTabKeyRef.current[tabKey] ?? null)
      : null;
    if (tabKey) {
      delete exitedByTabKeyRef.current[tabKey];
      delete transcriptByTabKeyRef.current[tabKey];
      setBridgeErrorForTabKey(setBridgeErrorByTabKey, tabKey, "");
      scheduleTranscriptFlush();
    }
    setSessionExited(null);

    if (tabKey && sessionId) {
      if (attachedSessionIdRef.current === sessionId) {
        attachedSessionIdRef.current = null;
        attachedAttachmentIdRef.current = null;
      }
      void window.api?.terminal?.closeSession?.({ sessionId });
      clearSessionRegistration(tabKey, sessionId);
    }

    if (activeTab) {
      args.setTabNativeSession({
        tabId: activeTab.id,
        nativeSessionId: undefined,
      });
    }

    setRestartVersion((value) => value + 1);
  }, [args.activeTab, args.setTabNativeSession, clearSessionRegistration]);

  return {
    activeSessionId,
    bridgeError,
    handleTerminalInput,
    handleTerminalResize,
    restartActiveSession,
    sessionExited,
    writeToActiveSession,
  };
}
