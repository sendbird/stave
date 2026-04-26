import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLatestAsyncDispatcher,
  shouldCreatePtySession,
} from "@/components/layout/pty-session-surface.utils";
import {
  EMPTY_TERMINAL_TAB_INSTANCE_STATUS,
  type UseTerminalTabManagerReturn,
} from "@/components/layout/useTerminalTabManager";
import { getTerminalSessionRouter } from "@/lib/terminal/terminal-session-router";

const TERMINAL_POLL_INTERVAL_MS = 120;
const TERMINAL_TRANSCRIPT_FLUSH_MS = 280;
const TERMINAL_TRANSCRIPT_CHAR_LIMIT = 2_000_000;
const TERMINAL_INPUT_BUFFER_CHAR_LIMIT = 200_000;

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

function appendTerminalInput(
  existing: string,
  nextChunk: string,
  limit: number,
) {
  if (!nextChunk) {
    return existing;
  }
  const combined = `${existing}${nextChunk}`;
  return combined.length <= limit ? combined : combined.slice(-limit);
}

type CreateSessionResult = {
  ok: boolean;
  sessionId?: string;
  stderr?: string;
};

type TerminalResizeRequest = {
  tabKey: string;
  sessionId: string;
  cols: number;
  rows: number;
};

type TerminalResizeState = {
  sessionId: string | null;
  cols: number;
  rows: number;
};

export interface UseTerminalSessionManagerArgs<TTab extends { id: string }> {
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
  slotKeyForTab?: (tab: TTab) => string | null;
  tabManager: UseTerminalTabManagerReturn;
}

export interface UseTerminalSessionManagerReturn {
  activeSessionId: string | null;
  activeWriteErrorCount: number;
  bridgeError: string;
  clearActiveTranscript: () => void;
  getSessionIdForTabKey: (tabKey: string) => string | null;
  handleTerminalInput: (tabKey: string, input: string) => void;
  handleTerminalResize: (
    tabKey: string,
    cols: number,
    rows: number,
  ) => Promise<void>;
  restartActiveSession: () => void;
  restartActiveTerminalRenderer: () => void;
  sessionExited: {
    exitCode: number;
    signal?: number;
  } | null;
  terminalReady: boolean;
  writeToActiveSession: (input: string) => boolean;
}

export function useTerminalSessionManager<TTab extends { id: string }>(
  args: UseTerminalSessionManagerArgs<TTab>,
): UseTerminalSessionManagerReturn {
  const tabManagerRef = useRef(args.tabManager);
  const tabsRef = useRef(args.tabs);
  useEffect(() => {
    tabManagerRef.current = args.tabManager;
    tabsRef.current = args.tabs;
  }, [args.tabManager, args.tabs]);

  const activeSessionIdRef = useRef<string | null>(null);
  const activeTabKeyRef = useRef<string | null>(null);
  const sessionIdByTabKeyRef = useRef<Record<string, string>>({});
  const tabKeyBySessionIdRef = useRef<Record<string, string>>({});
  const pendingInputBySessionRef = useRef<Record<string, string>>({});
  const writeInFlightBySessionRef = useRef<Record<string, boolean>>({});
  const flushScheduledBySessionRef = useRef<Record<string, boolean>>({});
  const creatingSessionByTabKeyRef = useRef<Record<string, boolean>>({});
  const transcriptRef = useRef<Record<string, string>>({});
  const screenStateByTabKeyRef = useRef<Record<string, string>>({});
  const transcriptFlushTimerRef = useRef<number | null>(null);
  const transcriptLoadedRef = useRef(false);
  const exitedByTabKeyRef = useRef<
    Record<string, { exitCode: number; signal?: number }>
  >({});
  const lastResizeByTabKeyRef = useRef<Record<string, TerminalResizeState>>({});
  const attachmentIdByTabKeyRef = useRef<Record<string, string>>({});
  // Monotonic counter per tabKey — incremented every time a session is
  // registered (attach or create).  Used by the detach callback to detect
  // that a fresh attach happened *after* the detach started, even when the
  // reattached sessionId is the same string value (reattach-same-session).
  const attachGenerationByTabKeyRef = useRef<Record<string, number>>({});
  const hydratedRevisionByTabKeyRef = useRef<Record<string, number>>({});
  const streamReadyByTabKeyRef = useRef<Record<string, boolean>>({});

  const [bridgeErrorByTabKey, setBridgeErrorByTabKey] = useState<
    Record<string, string>
  >({});
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [sessionExited, setSessionExited] = useState<{
    exitCode: number;
    signal?: number;
  } | null>(null);

  const supportsPushTerminalOutput =
    typeof window !== "undefined" &&
    Boolean(window.api?.terminal?.subscribeSessionOutput);
  const terminalSessionRouterRef = useRef(getTerminalSessionRouter());

  const activeTabKey = args.activeTab ? args.getTabKey(args.activeTab) : null;
  const activeSessionId = activeTabKey
    ? (sessionIdByTabKeyRef.current[activeTabKey] ?? null)
    : null;
  const activeTerminalStatus = activeTabKey
    ? (args.tabManager.statusByTabKey[activeTabKey] ??
      EMPTY_TERMINAL_TAB_INSTANCE_STATUS)
    : EMPTY_TERMINAL_TAB_INSTANCE_STATUS;

  const terminalReady = activeTerminalStatus.ready;
  const activeWriteErrorCount = activeTerminalStatus.writeErrorCount;
  const bridgeError = activeTabKey
    ? (bridgeErrorByTabKey[activeTabKey] ?? activeTerminalStatus.error ?? "")
    : (activeTerminalStatus.error ?? "");

  const resizeSessionDispatcherRef = useRef(
    createLatestAsyncDispatcher<TerminalResizeRequest>({
      run: async ({ tabKey, sessionId, cols, rows }) => {
        const resizeSession = window.api?.terminal?.resizeSession;
        if (!resizeSession) {
          return;
        }

        const result = await resizeSession({ sessionId, cols, rows });
        if (!result?.ok) {
          throw new Error(
            result?.stderr || "Failed to resize backend session.",
          );
        }

        if (sessionIdByTabKeyRef.current[tabKey] !== sessionId) {
          return;
        }

        tabManagerRef.current.resize(tabKey, cols, rows);
      },
      onError: (error, request) => {
        const lastResize = lastResizeByTabKeyRef.current[request.tabKey];
        if (
          lastResize &&
          lastResize.sessionId === request.sessionId &&
          lastResize.cols === request.cols &&
          lastResize.rows === request.rows
        ) {
          delete lastResizeByTabKeyRef.current[request.tabKey];
        }
        console.warn(
          "[terminal] failed to resize backend session",
          error,
          request,
        );
      },
    }),
  );

  const setBridgeErrorForTabKey = useCallback(
    (tabKey: string, message: string) => {
      setBridgeErrorByTabKey((previous) => {
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
    },
    [],
  );

  function scheduleTranscriptFlush() {
    if (transcriptFlushTimerRef.current !== null) {
      return;
    }

    const doFlush = () => {
      transcriptFlushTimerRef.current = null;
      try {
        window.localStorage.setItem(
          args.transcriptStorageKey,
          JSON.stringify(transcriptRef.current),
        );
      } catch {
        // Ignore localStorage quota errors.
      }
    };

    transcriptFlushTimerRef.current =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(doFlush, { timeout: TERMINAL_TRANSCRIPT_FLUSH_MS })
        : window.setTimeout(doFlush, TERMINAL_TRANSCRIPT_FLUSH_MS);
  }

  function batchSessionOp(
    getApi: () =>
      | ((args: { sessionId: string }) => Promise<unknown>)
      | undefined,
  ) {
    return async (sessionIds: string[]) => {
      if (sessionIds.length === 0) {
        return;
      }
      const api = getApi();
      if (api) {
        await Promise.allSettled(
          sessionIds.map((sessionId) => api({ sessionId })),
        );
      }
    };
  }

  const disposeSessionIds = batchSessionOp(
    () => window.api?.terminal?.closeSession,
  );
  async function detachSessionAttachments(
    entries: Array<{ sessionId: string; attachmentId?: string }>,
  ) {
    if (entries.length === 0) {
      return;
    }
    const detachSession = window.api?.terminal?.detachSession;
    if (!detachSession) {
      return;
    }
    await Promise.allSettled(entries.map((entry) => detachSession(entry)));
  }

  function enqueueTerminalInput(args: { sessionId: string; input: string }) {
    pendingInputBySessionRef.current[args.sessionId] = appendTerminalInput(
      pendingInputBySessionRef.current[args.sessionId] ?? "",
      args.input,
      TERMINAL_INPUT_BUFFER_CHAR_LIMIT,
    );

    if (!flushScheduledBySessionRef.current[args.sessionId]) {
      flushScheduledBySessionRef.current[args.sessionId] = true;
      queueMicrotask(() => {
        flushScheduledBySessionRef.current[args.sessionId] = false;
        flushTerminalInput(args.sessionId);
      });
    }
  }

  function flushTerminalInput(sessionId: string) {
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
        tabManagerRef.current.writeln(
          tabKey,
          "\r\n[error] terminal bridge unavailable.",
        );
        setBridgeErrorForTabKey(
          tabKey,
          "Terminal bridge unavailable. Use bun run dev:desktop.",
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
          tabManagerRef.current.writeln(
            tabKey,
            "\r\n[error] failed to write terminal input.",
          );
        }
      })
      .finally(() => {
        writeInFlightBySessionRef.current[sessionId] = false;
        if (pendingInputBySessionRef.current[sessionId]) {
          flushTerminalInput(sessionId);
        }
      });
  }

  function applyTerminalOutput(payload: { sessionId: string; output: string }) {
    if (!payload.output) {
      return;
    }

    const tabKey = tabKeyBySessionIdRef.current[payload.sessionId];
    if (!tabKey) {
      return;
    }

    delete screenStateByTabKeyRef.current[tabKey];
    transcriptRef.current[tabKey] = appendTerminalText(
      transcriptRef.current[tabKey] ?? "",
      payload.output,
      TERMINAL_TRANSCRIPT_CHAR_LIMIT,
    );
    scheduleTranscriptFlush();
    terminalSessionRouterRef.current.publishOutput(
      payload.sessionId,
      payload.output,
    );
  }

  async function syncTerminalOutput() {
    const readSession = window.api?.terminal?.readSession;
    const sessionIds = Object.values(sessionIdByTabKeyRef.current);
    if (!readSession || sessionIds.length === 0) {
      return;
    }

    const reads = await Promise.all(
      sessionIds.map(
        async (sessionId) =>
          [sessionId, await readSession({ sessionId })] as const,
      ),
    );

    for (const [sessionId, read] of reads) {
      if (!read.ok || !read.output) {
        continue;
      }
      applyTerminalOutput({ sessionId, output: read.output });
    }
  }

  const handleTerminalResize = useCallback(
    (tabKey: string, cols: number, rows: number) => {
      const sessionId = sessionIdByTabKeyRef.current[tabKey];
      if (!sessionId) {
        tabManagerRef.current.resize(tabKey, cols, rows);
        return Promise.resolve();
      }

      const lastResize = lastResizeByTabKeyRef.current[tabKey];
      if (
        lastResize &&
        lastResize.sessionId === sessionId &&
        lastResize.cols === cols &&
        lastResize.rows === rows
      ) {
        return Promise.resolve();
      }

      lastResizeByTabKeyRef.current[tabKey] = { sessionId, cols, rows };
      return resizeSessionDispatcherRef.current.schedule({
        tabKey,
        sessionId,
        cols,
        rows,
      });
    },
    [],
  );

  const handleTerminalInput = useCallback((tabKey: string, input: string) => {
    const sessionId = sessionIdByTabKeyRef.current[tabKey];
    if (!sessionId || !input) {
      return;
    }
    enqueueTerminalInput({ sessionId, input });
  }, []);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    activeTabKeyRef.current = activeTabKey;
  }, [activeSessionId, activeTabKey]);

  useEffect(() => {
    resizeSessionDispatcherRef.current.clear();
  }, [args.activeTabId]);

  useEffect(() => {
    if (transcriptLoadedRef.current) {
      return;
    }
    transcriptLoadedRef.current = true;
    const raw = window.localStorage.getItem(args.transcriptStorageKey);
    try {
      transcriptRef.current = raw
        ? (JSON.parse(raw) as Record<string, string>)
        : {};
    } catch {
      transcriptRef.current = {};
    }

    return () => {
      if (transcriptFlushTimerRef.current !== null) {
        if (typeof cancelIdleCallback === "function") {
          cancelIdleCallback(transcriptFlushTimerRef.current);
        }
        window.clearTimeout(transcriptFlushTimerRef.current);
        transcriptFlushTimerRef.current = null;
      }
      try {
        window.localStorage.setItem(
          args.transcriptStorageKey,
          JSON.stringify(transcriptRef.current),
        );
      } catch {
        // Ignore localStorage quota errors on unmount.
      }
    };
  }, [args.transcriptStorageKey]);

  useEffect(() => {
    if (!supportsPushTerminalOutput) {
      return;
    }

    const subscribeSessionOutput = window.api?.terminal?.subscribeSessionOutput;
    if (!subscribeSessionOutput) {
      return;
    }

    return subscribeSessionOutput(({ sessionId, output }) => {
      const tabKey = tabKeyBySessionIdRef.current[sessionId];
      if (!tabKey || !streamReadyByTabKeyRef.current[tabKey]) {
        return;
      }
      applyTerminalOutput({ sessionId, output });
    });
  }, [supportsPushTerminalOutput]);

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

      delete screenStateByTabKeyRef.current[tabKey];
      delete attachmentIdByTabKeyRef.current[tabKey];
      exitedByTabKeyRef.current[tabKey] = { exitCode, signal };

      const signalHint = signal ? ` (signal ${signal})` : "";
      const exitMessage =
        exitCode === 0
          ? `\r\n\x1b[2m[process exited with code 0${signalHint}]\x1b[0m\r\n`
          : `\r\n\x1b[33m[process exited with code ${exitCode}${signalHint}]\x1b[0m\r\n`;

      transcriptRef.current[tabKey] = appendTerminalText(
        transcriptRef.current[tabKey] ?? "",
        exitMessage,
        TERMINAL_TRANSCRIPT_CHAR_LIMIT,
      );
      scheduleTranscriptFlush();
      terminalSessionRouterRef.current.publishOutput(sessionId, exitMessage);
      terminalSessionRouterRef.current.publishExit(sessionId, {
        exitCode,
        signal,
      });

      if (activeTabKeyRef.current === tabKey) {
        setSessionExited({ exitCode, signal });
      }
    });
  }, []);

  useEffect(() => {
    if (supportsPushTerminalOutput) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      await syncTerminalOutput();

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
  }, [runtimeVersion, supportsPushTerminalOutput]);

  useEffect(() => {
    return () => {
      resizeSessionDispatcherRef.current.clear();
      void detachSessionAttachments(
        Object.entries(sessionIdByTabKeyRef.current).map(
          ([tabKey, sessionId]) => ({
            sessionId,
            attachmentId: attachmentIdByTabKeyRef.current[tabKey],
          }),
        ),
      );
    };
  }, []);

  const previousWorkspaceIdRef = useRef(args.workspaceId);
  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    previousWorkspaceIdRef.current = args.workspaceId;
    if (previousWorkspaceId === args.workspaceId) {
      return;
    }
    const entriesToDetach = Object.entries(sessionIdByTabKeyRef.current).filter(
      ([tabKey]) => tabKey.startsWith(`${previousWorkspaceId}:`),
    );
    if (entriesToDetach.length === 0) {
      return;
    }
    const detachEntries = entriesToDetach.map(([tabKey, sessionId]) => ({
      sessionId,
      attachmentId: attachmentIdByTabKeyRef.current[tabKey],
    }));
    // Capture the attach generation for each tabKey at the moment we START
    // the detach.  If registerSession() runs before the detach settles
    // (reattach-same-session), the generation will have been bumped even
    // though the sessionId string is identical.  Checking generation avoids
    // wiping refs that belong to the freshly re-attached session.
    const generationSnapshot: Record<string, number> = {};
    for (const [tabKey] of entriesToDetach) {
      generationSnapshot[tabKey] =
        attachGenerationByTabKeyRef.current[tabKey] ?? 0;
    }

    // Detach first (host switches to background buffer), THEN clear refs.
    // Refs stay intact during the async gap so push events arriving before
    // the host processes the detach are still captured in transcriptRef.
    // After detach settles, always clear refs and bump runtimeVersion so
    // the bootstrap effect re-runs and calls tryReattachExistingSession
    // (which will re-attach if the user already returned to this workspace).
    void detachSessionAttachments(detachEntries).then(() => {
      for (const [tabKey, sessionId] of entriesToDetach) {
        // Guard: if the user switched back to this workspace before the
        // detach settled, the bootstrap effect may have already re-attached
        // (or created) a new session under the same tabKey. Only wipe refs
        // when BOTH the sessionId AND the attach generation still match
        // what we captured at detach-start.  A generation bump means
        // registerSession() ran after we began detaching — even when the
        // reattached sessionId is the same string value.
        const currentGen = attachGenerationByTabKeyRef.current[tabKey] ?? 0;
        if (
          sessionIdByTabKeyRef.current[tabKey] !== sessionId ||
          currentGen !== generationSnapshot[tabKey]
        ) {
          continue;
        }
        delete sessionIdByTabKeyRef.current[tabKey];
        delete tabKeyBySessionIdRef.current[sessionId];
        delete pendingInputBySessionRef.current[sessionId];
        delete writeInFlightBySessionRef.current[sessionId];
        delete flushScheduledBySessionRef.current[sessionId];
        delete creatingSessionByTabKeyRef.current[tabKey];
        delete lastResizeByTabKeyRef.current[tabKey];
        delete attachmentIdByTabKeyRef.current[tabKey];
        delete hydratedRevisionByTabKeyRef.current[tabKey];
        delete streamReadyByTabKeyRef.current[tabKey];
      }
      setRuntimeVersion((v) => v + 1);
    });
  }, [args.workspaceId]);

  useEffect(() => {
    const liveEntries = Object.entries(sessionIdByTabKeyRef.current).filter(
      ([tabKey]) => tabKey.startsWith(`${args.workspaceId}:`),
    );
    const liveTabKeys = new Set(args.tabs.map((tab) => args.getTabKey(tab)));
    const removedEntries = liveEntries.filter(
      ([tabKey]) => !liveTabKeys.has(tabKey),
    );
    if (removedEntries.length === 0) {
      return;
    }

    void disposeSessionIds(
      removedEntries.map(([, sessionId]) => sessionId),
    ).finally(() => {
      for (const [tabKey, sessionId] of removedEntries) {
        terminalSessionRouterRef.current.clearSession(sessionId);
        delete sessionIdByTabKeyRef.current[tabKey];
        delete tabKeyBySessionIdRef.current[sessionId];
        delete pendingInputBySessionRef.current[sessionId];
        delete writeInFlightBySessionRef.current[sessionId];
        delete flushScheduledBySessionRef.current[sessionId];
        delete creatingSessionByTabKeyRef.current[tabKey];
        delete exitedByTabKeyRef.current[tabKey];
        delete lastResizeByTabKeyRef.current[tabKey];
        delete hydratedRevisionByTabKeyRef.current[tabKey];
        delete screenStateByTabKeyRef.current[tabKey];
        delete attachmentIdByTabKeyRef.current[tabKey];
        setBridgeErrorForTabKey(tabKey, "");
      }
      setRuntimeVersion((value) => value + 1);
    });
  }, [args.getTabKey, args.tabs, args.workspaceId, setBridgeErrorForTabKey]);

  // Hydrate terminal instances with stored transcript when they become ready.
  // Dependencies use stable method handles (clear/write from useCallback) and
  // the statusByTabKey data slice — NOT the whole tabManager object — to avoid
  // re-running this effect every time the tabManager reference changes.
  const tabStatusByTabKey = args.tabManager.statusByTabKey;
  const tabManagerClear = args.tabManager.clear;
  const tabManagerRestoreScreenState = args.tabManager.restoreScreenState;
  const tabManagerWrite = args.tabManager.write;

  useEffect(() => {
    for (const tab of args.tabs) {
      const tabKey = args.getTabKey(tab);
      const status = tabStatusByTabKey[tabKey];
      if (!status?.ready) {
        continue;
      }

      if (hydratedRevisionByTabKeyRef.current[tabKey] === status.revision) {
        continue;
      }

      hydratedRevisionByTabKeyRef.current[tabKey] = status.revision;

      if (sessionIdByTabKeyRef.current[tabKey]) {
        continue;
      }

      const screenState = screenStateByTabKeyRef.current[tabKey];
      if (typeof screenState === "string") {
        tabManagerRestoreScreenState(tabKey, screenState);
        continue;
      }

      tabManagerClear(tabKey);
      const transcript = transcriptRef.current[tabKey] ?? "";
      if (transcript) {
        tabManagerWrite(tabKey, transcript);
      }
    }
  }, [
    args.getTabKey,
    args.tabs,
    tabStatusByTabKey,
    tabManagerClear,
    tabManagerRestoreScreenState,
    tabManagerWrite,
  ]);

  useEffect(() => {
    if (!activeTabKey) {
      setSessionExited(null);
      return;
    }

    setSessionExited(exitedByTabKeyRef.current[activeTabKey] ?? null);
  }, [activeTabKey, runtimeVersion]);

  const tabManagerGetSize = args.tabManager.getSize;
  const tabManagerProposeDimensions = args.tabManager.proposeDimensions;
  const tabManagerWriteln = args.tabManager.writeln;

  useEffect(() => {
    if (
      !args.activeTab ||
      !shouldCreatePtySession({
        isVisible: args.isVisible,
        workspaceId: args.workspaceId,
        hasActiveTab: true,
      })
    ) {
      return;
    }

    const tabKey = args.getTabKey(args.activeTab);
    if (!tabStatusByTabKey[tabKey]?.ready) {
      return;
    }
    if (
      sessionIdByTabKeyRef.current[tabKey] ||
      creatingSessionByTabKeyRef.current[tabKey]
    ) {
      return;
    }

    const measured = tabManagerGetSize(tabKey);
    const proposed = tabManagerProposeDimensions(tabKey);
    const cols = measured.cols || proposed?.cols || 80;
    const rows = measured.rows || proposed?.rows || 24;
    const deliveryMode = supportsPushTerminalOutput ? "push" : "poll";

    function registerSession(sessionId: string, attachmentId?: string) {
      setBridgeErrorForTabKey(tabKey, "");
      sessionIdByTabKeyRef.current[tabKey] = sessionId;
      tabKeyBySessionIdRef.current[sessionId] = tabKey;
      pendingInputBySessionRef.current[sessionId] = "";
      writeInFlightBySessionRef.current[sessionId] = false;
      attachGenerationByTabKeyRef.current[tabKey] =
        (attachGenerationByTabKeyRef.current[tabKey] ?? 0) + 1;
      delete exitedByTabKeyRef.current[tabKey];
      delete lastResizeByTabKeyRef.current[tabKey];
      if (attachmentId) {
        attachmentIdByTabKeyRef.current[tabKey] = attachmentId;
      } else {
        delete attachmentIdByTabKeyRef.current[tabKey];
      }
      setSessionExited(null);
      setRuntimeVersion((value) => value + 1);
    }

    function hydrateBacklog(backlog: string) {
      if (!backlog) {
        return;
      }
      delete screenStateByTabKeyRef.current[tabKey];
      transcriptRef.current[tabKey] = appendTerminalText(
        transcriptRef.current[tabKey] ?? "",
        backlog,
        TERMINAL_TRANSCRIPT_CHAR_LIMIT,
      );
      scheduleTranscriptFlush();
    }

    function hydrateScreenState(screenState: string) {
      screenStateByTabKeyRef.current[tabKey] = screenState;
    }

    async function tryReattachExistingSession(): Promise<boolean> {
      if (!args.slotKeyForTab || !args.activeTab) {
        return false;
      }
      const getSlotState = window.api?.terminal?.getSlotState;
      const attachSession = window.api?.terminal?.attachSession;
      const resumeSessionStream = window.api?.terminal?.resumeSessionStream;
      const detachSession = window.api?.terminal?.detachSession;
      if (
        !getSlotState ||
        !attachSession ||
        !resumeSessionStream ||
        !detachSession
      ) {
        return false;
      }
      const slotKey = args.slotKeyForTab(args.activeTab);
      if (!slotKey) {
        return false;
      }
      const slotState = await getSlotState({ slotKey });
      if (
        slotState.sessionId &&
        (slotState.state === "background" || slotState.state === "running")
      ) {
        if (!tabsRef.current.some((tab) => args.getTabKey(tab) === tabKey)) {
          return true;
        }
        streamReadyByTabKeyRef.current[tabKey] = false;
        const attached = await attachSession({
          sessionId: slotState.sessionId,
          deliveryMode,
        });
        if (!attached.ok || !attached.attachmentId) {
          return false;
        }
        if (!tabsRef.current.some((tab) => args.getTabKey(tab) === tabKey)) {
          await detachSession({
            sessionId: slotState.sessionId,
            attachmentId: attached.attachmentId,
          });
          return true;
        }

        registerSession(slotState.sessionId, attached.attachmentId);
        if (typeof attached.screenState === "string") {
          hydrateScreenState(attached.screenState);
        } else {
          hydrateBacklog(attached.backlog ?? "");
        }
        terminalSessionRouterRef.current.publishSnapshot({
          sessionId: slotState.sessionId,
          screenState: attached.screenState,
          backlog: attached.backlog,
        });

        // Sync PTY geometry after reattach. While the terminal was hidden,
        // layout changes (window resize, dock drag) only updated the local
        // Ghostty renderer. Flush the current measured size so the backend
        // PTY cols/rows match what the user actually sees.
        const reattachSize = tabManagerGetSize(tabKey);
        const reattachCols = reattachSize.cols || cols;
        const reattachRows = reattachSize.rows || rows;
        lastResizeByTabKeyRef.current[tabKey] = {
          sessionId: slotState.sessionId,
          cols: reattachCols,
          rows: reattachRows,
        };
        await resizeSessionDispatcherRef.current.schedule({
          tabKey,
          sessionId: slotState.sessionId,
          cols: reattachCols,
          rows: reattachRows,
        });
        try {
          const resumed = await resumeSessionStream({
            sessionId: slotState.sessionId,
            attachmentId: attached.attachmentId,
          });
          if (resumed.ok) {
            streamReadyByTabKeyRef.current[tabKey] = true;
          } else {
            setBridgeErrorForTabKey(
              tabKey,
              resumed.stderr?.trim() || "Failed to resume terminal session stream.",
            );
          }
        } catch {
          // Session is registered but stream failed — detach and let bootstrap
          // retry on next cycle.
          terminalSessionRouterRef.current.clearSession(slotState.sessionId);
          delete sessionIdByTabKeyRef.current[tabKey];
          if (tabKeyBySessionIdRef.current[slotState.sessionId] === tabKey) {
            delete tabKeyBySessionIdRef.current[slotState.sessionId];
          }
          delete pendingInputBySessionRef.current[slotState.sessionId];
          delete writeInFlightBySessionRef.current[slotState.sessionId];
          delete attachmentIdByTabKeyRef.current[tabKey];
          delete streamReadyByTabKeyRef.current[tabKey];
          setRuntimeVersion((value) => value + 1);
          void detachSession({
            sessionId: slotState.sessionId,
            attachmentId: attached.attachmentId,
          });
          return false;
        }
        return true;
      }
      if (slotState.state === "exited") {
        exitedByTabKeyRef.current[tabKey] = {
          exitCode: slotState.exitCode ?? -1,
          signal: slotState.signal,
        };
        if (activeTabKeyRef.current === tabKey) {
          setSessionExited({
            exitCode: slotState.exitCode ?? -1,
            signal: slotState.signal,
          });
        }
      }
      return false;
    }

    async function createNewSession() {
      const attachSession = window.api?.terminal?.attachSession;
      const detachSession = window.api?.terminal?.detachSession;
      const closeSession = window.api?.terminal?.closeSession;
      const resumeSessionStream = window.api?.terminal?.resumeSessionStream;
      if (!attachSession || !resumeSessionStream) {
        return;
      }
      const abandonCreatedSession = (args: {
        sessionId: string;
        attachmentId?: string;
        registered?: boolean;
      }) => {
        if (
          args.registered &&
          sessionIdByTabKeyRef.current[tabKey] === args.sessionId
        ) {
          terminalSessionRouterRef.current.clearSession(args.sessionId);
          delete sessionIdByTabKeyRef.current[tabKey];
          if (tabKeyBySessionIdRef.current[args.sessionId] === tabKey) {
            delete tabKeyBySessionIdRef.current[args.sessionId];
          }
          delete pendingInputBySessionRef.current[args.sessionId];
          delete writeInFlightBySessionRef.current[args.sessionId];
          delete flushScheduledBySessionRef.current[args.sessionId];
          delete creatingSessionByTabKeyRef.current[tabKey];
          delete lastResizeByTabKeyRef.current[tabKey];
          delete hydratedRevisionByTabKeyRef.current[tabKey];
          delete screenStateByTabKeyRef.current[tabKey];
          delete attachmentIdByTabKeyRef.current[tabKey];
          delete streamReadyByTabKeyRef.current[tabKey];
          delete transcriptRef.current[tabKey];
          setRuntimeVersion((value) => value + 1);
        }

        if (closeSession) {
          void closeSession({ sessionId: args.sessionId });
          return;
        }

        if (args.attachmentId && detachSession) {
          void detachSession({
            sessionId: args.sessionId,
            attachmentId: args.attachmentId,
          });
        }
      };
      const created = await args.createSession({
        tab: args.activeTab!,
        cols,
        rows,
        deliveryMode,
      });
      if (!tabsRef.current.some((tab) => args.getTabKey(tab) === tabKey)) {
        if (created.ok && created.sessionId) {
          abandonCreatedSession({ sessionId: created.sessionId });
        }
        return;
      }
      if (!created.ok || !created.sessionId) {
        const message =
          created.stderr?.trim() || "Failed to create terminal session.";
        setBridgeErrorForTabKey(tabKey, message);
        tabManagerRef.current.writeln(
          tabKey,
          `\r\n[error] ${created.stderr?.trim() || "failed to create terminal session."}`,
        );
        return;
      }
      streamReadyByTabKeyRef.current[tabKey] = false;
      const attached = await attachSession({
        sessionId: created.sessionId,
        deliveryMode,
      });
      if (!attached.ok || !attached.attachmentId) {
        const message =
          attached.stderr?.trim() || "Failed to attach terminal session.";
        setBridgeErrorForTabKey(tabKey, message);
        abandonCreatedSession({
          sessionId: created.sessionId,
        });
        return;
      }
      if (!tabsRef.current.some((tab) => args.getTabKey(tab) === tabKey)) {
        abandonCreatedSession({
          sessionId: created.sessionId,
          attachmentId: attached.attachmentId,
        });
        return;
      }
      registerSession(created.sessionId, attached.attachmentId);
      if (typeof attached.screenState === "string") {
        hydrateScreenState(attached.screenState);
      } else {
        hydrateBacklog(attached.backlog ?? "");
      }
      terminalSessionRouterRef.current.publishSnapshot({
        sessionId: created.sessionId,
        screenState: attached.screenState,
        backlog: attached.backlog,
      });
      await resizeSessionDispatcherRef.current.schedule({
        tabKey,
        sessionId: created.sessionId,
        cols,
        rows,
      });
      if (!tabsRef.current.some((tab) => args.getTabKey(tab) === tabKey)) {
        abandonCreatedSession({
          sessionId: created.sessionId,
          attachmentId: attached.attachmentId,
          registered: true,
        });
        return;
      }
      try {
        const resumed = await resumeSessionStream({
          sessionId: created.sessionId,
          attachmentId: attached.attachmentId,
        });
        if (resumed.ok) {
          streamReadyByTabKeyRef.current[tabKey] = true;
        } else {
          setBridgeErrorForTabKey(
            tabKey,
            resumed.stderr?.trim() || "Failed to resume terminal session stream.",
          );
        }
      } catch {
        abandonCreatedSession({
          sessionId: created.sessionId,
          attachmentId: attached.attachmentId,
          registered: true,
        });
      }
    }

    creatingSessionByTabKeyRef.current[tabKey] = true;

    void (async () => {
      const reattached = await tryReattachExistingSession();
      if (!reattached) {
        await createNewSession();
      }
    })().finally(() => {
      delete creatingSessionByTabKeyRef.current[tabKey];
    });
  }, [
    args.activeTab,
    args.createSession,
    args.getTabKey,
    args.isVisible,
    args.slotKeyForTab,
    args.tabs,
    args.workspaceId,
    runtimeVersion,
    setBridgeErrorForTabKey,
    supportsPushTerminalOutput,
    tabStatusByTabKey,
    tabManagerGetSize,
    tabManagerProposeDimensions,
    tabManagerWriteln,
  ]);

  function clearActiveTranscript() {
    if (!activeTabKey) {
      return;
    }
    transcriptRef.current[activeTabKey] = "";
    delete screenStateByTabKeyRef.current[activeTabKey];
    scheduleTranscriptFlush();
    const sessionId = sessionIdByTabKeyRef.current[activeTabKey];
    if (sessionId) {
      terminalSessionRouterRef.current.publishSnapshot({
        sessionId,
        screenState: "",
      });
    }
    tabManagerRef.current.clear(activeTabKey);
  }

  function writeToActiveSession(input: string) {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || !input) {
      return false;
    }
    enqueueTerminalInput({ sessionId, input });
    return true;
  }

  function restartActiveSession() {
    if (!activeTabKey) {
      return;
    }

    const sessionId = sessionIdByTabKeyRef.current[activeTabKey];
    if (sessionId) {
      void disposeSessionIds([sessionId]);
      terminalSessionRouterRef.current.clearSession(sessionId);
      delete tabKeyBySessionIdRef.current[sessionId];
      delete pendingInputBySessionRef.current[sessionId];
      delete writeInFlightBySessionRef.current[sessionId];
      delete flushScheduledBySessionRef.current[sessionId];
    }

    delete sessionIdByTabKeyRef.current[activeTabKey];
    delete attachmentIdByTabKeyRef.current[activeTabKey];
    delete creatingSessionByTabKeyRef.current[activeTabKey];
    delete exitedByTabKeyRef.current[activeTabKey];
    delete lastResizeByTabKeyRef.current[activeTabKey];
    delete hydratedRevisionByTabKeyRef.current[activeTabKey];
    delete screenStateByTabKeyRef.current[activeTabKey];
    setBridgeErrorForTabKey(activeTabKey, "");
    transcriptRef.current[activeTabKey] = "";
    scheduleTranscriptFlush();
    tabManagerRef.current.clear(activeTabKey);
    // Recreate the Ghostty renderer alongside the PTY restart so a corrupted
    // viewport is not reused against the next session bootstrap.
    tabManagerRef.current.restart(activeTabKey);
    setSessionExited(null);
    setRuntimeVersion((value) => value + 1);
  }

  function restartActiveTerminalRenderer() {
    if (!activeTabKey) {
      return;
    }
    tabManagerRef.current.restart(activeTabKey);
  }

  const getSessionIdForTabKey = useCallback(
    (tabKey: string) => sessionIdByTabKeyRef.current[tabKey] ?? null,
    [],
  );

  return {
    activeSessionId,
    activeWriteErrorCount,
    bridgeError,
    clearActiveTranscript,
    getSessionIdForTabKey,
    handleTerminalInput,
    handleTerminalResize,
    restartActiveSession,
    restartActiveTerminalRenderer,
    sessionExited,
    terminalReady,
    writeToActiveSession,
  };
}
