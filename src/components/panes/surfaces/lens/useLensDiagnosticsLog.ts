import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { LensDiagnosticsStateRevision } from "@/lib/lens/lens-diagnostics-state";
import {
  type BrowserConsoleEntry,
  type BrowserConsoleEntryDetail,
  type BrowserConsoleEventPayload,
  type BrowserNetworkBody,
  type BrowserNetworkEntry,
  type BrowserNetworkEntryDetail,
  type BrowserNetworkEventPayload,
  type LensDiagnosticsCaptureState,
} from "@/lib/lens/lens.types";
import {
  LENS_LOG_LIMIT,
  appendLimited,
  formatConsoleEntries,
  formatNetworkEntries,
  formatNetworkEntryDetails,
  matchesSession,
  upsertConsoleEntriesLimited,
  upsertNetworkEntriesLimited,
  type ConsoleLevelFilter,
  type LensPanelTab,
} from "@/lib/lens/lens-log-format";

/**
 * Console and network diagnostics log for one lens session: the log state and
 * its pause buffers, the event subscriptions that feed them, the detail and
 * body fetches behind the entry inspector, and the toolbar callbacks that
 * `LensConsoleWorkbench` / `LensNetworkWorkbench` render.
 *
 * `lastLoadError` stays with the panel (the preview branch renders it) but the
 * console subscription is what recognizes a `Navigation failed:` entry, so the
 * panel hands its setter down.
 */
export function useLensDiagnosticsLog(args: {
  workspaceId: string;
  lensSessionId: string;
  hasLensApi: boolean;
  url: string;
  lensPanelTab: LensPanelTab;
  setLastLoadError: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    workspaceId,
    lensSessionId,
    hasLensApi,
    url,
    lensPanelTab,
    setLastLoadError,
  } = args;
  const [consoleEntries, setConsoleEntries] = useState<BrowserConsoleEntry[]>(
    [],
  );
  const [networkEntries, setNetworkEntries] = useState<BrowserNetworkEntry[]>(
    [],
  );
  const [consoleLevelFilter, setConsoleLevelFilter] =
    useState<ConsoleLevelFilter>("all");
  const [consoleSearch, setConsoleSearch] = useState("");
  const [networkSearch, setNetworkSearch] = useState("");
  const [consolePaused, setConsolePaused] = useState(false);
  const [networkPaused, setNetworkPaused] = useState(false);
  const [consoleBufferedCount, setConsoleBufferedCount] = useState(0);
  const [networkBufferedCount, setNetworkBufferedCount] = useState(0);
  const [selectedConsoleEntryId, setSelectedConsoleEntryId] = useState<
    string | null
  >(null);
  const [selectedNetworkEntryId, setSelectedNetworkEntryId] = useState<
    string | null
  >(null);
  const [consoleDetailsOpen, setConsoleDetailsOpen] = useState(false);
  const [networkDetailsOpen, setNetworkDetailsOpen] = useState(false);
  const [consoleDetailTab, setConsoleDetailTab] = useState("message");
  const [networkDetailTab, setNetworkDetailTab] = useState("headers");
  const [consoleEntryDetail, setConsoleEntryDetail] =
    useState<BrowserConsoleEntryDetail | null>(null);
  const [consoleDetailLoading, setConsoleDetailLoading] = useState(false);
  const [consoleDetailError, setConsoleDetailError] = useState<string | null>(
    null,
  );
  const [networkEntryDetail, setNetworkEntryDetail] =
    useState<BrowserNetworkEntryDetail | null>(null);
  const [networkDetailLoading, setNetworkDetailLoading] = useState(false);
  const [networkDetailError, setNetworkDetailError] = useState<string | null>(
    null,
  );
  const [networkBodyState, setNetworkBodyState] = useState<
    Record<
      "request" | "response",
      {
        entryId: string;
        entryState: BrowserNetworkEntry["state"];
        loading: boolean;
        body: BrowserNetworkBody | null;
        error: string | null;
      } | null
    >
  >({ request: null, response: null });
  const [diagnosticsCaptureState, setDiagnosticsCaptureState] =
    useState<LensDiagnosticsCaptureState | null>(null);
  const [diagnosticsCaptureBusy, setDiagnosticsCaptureBusy] = useState(false);
  const diagnosticsCaptureStateRevisionRef = useRef(
    new LensDiagnosticsStateRevision(),
  );
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const consoleLogRef = useRef<HTMLDivElement>(null);
  const networkLogRef = useRef<HTMLDivElement>(null);
  const consolePausedRef = useRef(consolePaused);
  const networkPausedRef = useRef(networkPaused);
  const consolePausedBufferRef = useRef<BrowserConsoleEntry[]>([]);
  const networkPausedBufferRef = useRef<BrowserNetworkEntry[]>([]);
  const selectedConsoleEntry = useMemo(
    () =>
      consoleEntries.find((entry) => entry.id === selectedConsoleEntryId) ??
      null,
    [consoleEntries, selectedConsoleEntryId],
  );
  const selectedNetworkEntry = useMemo(
    () =>
      networkEntries.find(
        (entry) => entry.entryId === selectedNetworkEntryId,
      ) ?? null,
    [networkEntries, selectedNetworkEntryId],
  );
  const selectedNetworkEntryState = selectedNetworkEntry?.state ?? null;
  const selectedRequestBodyState =
    networkBodyState.request?.entryId === selectedNetworkEntryId &&
    networkBodyState.request.entryState === selectedNetworkEntryState
      ? networkBodyState.request
      : null;
  const selectedResponseBodyState =
    networkBodyState.response?.entryId === selectedNetworkEntryId &&
    networkBodyState.response.entryState === selectedNetworkEntryState
      ? networkBodyState.response
      : null;
  const networkBodyStateRef = useRef(networkBodyState);
  consolePausedRef.current = consolePaused;
  networkPausedRef.current = networkPaused;
  networkBodyStateRef.current = networkBodyState;

  useEffect(() => {
    setConsoleEntries([]);
    setSelectedConsoleEntryId(null);
    setConsoleDetailsOpen(false);
    setConsoleEntryDetail(null);
    setConsoleDetailError(null);
    setLastLoadError(null);
    if (!workspaceId || !hasLensApi) {
      return;
    }

    let cancelled = false;
    let pendingConsoleEntries: BrowserConsoleEntry[] = [];
    let consoleFrame: number | null = null;
    const flushConsoleEntries = () => {
      consoleFrame = null;
      const entries = pendingConsoleEntries;
      pendingConsoleEntries = [];
      if (cancelled || entries.length === 0) {
        return;
      }
      if (consolePausedRef.current) {
        consolePausedBufferRef.current = entries.reduce(
          (buffer, entry) => appendLimited(buffer, entry),
          consolePausedBufferRef.current,
        );
        setConsoleBufferedCount(consolePausedBufferRef.current.length);
        return;
      }
      setConsoleEntries((current) =>
        upsertConsoleEntriesLimited(current, entries),
      );
    };
    void window.api?.lens
      ?.getConsoleLog?.({ workspaceId, lensSessionId, limit: LENS_LOG_LIMIT })
      .then((result) => {
        if (!cancelled && result?.ok && result.entries) {
          const entries = result.entries.slice(-LENS_LOG_LIMIT);
          setConsoleEntries((current) =>
            upsertConsoleEntriesLimited(entries, current),
          );
          const latestError = entries
            .slice()
            .reverse()
            .find((entry) => entry.level === "error");
          if (latestError?.text.startsWith("Navigation failed:")) {
            setLastLoadError(latestError.text);
          }
        }
      });

    const unsubscribe = window.api?.lens?.subscribeConsoleEvents?.(
      (payload: BrowserConsoleEventPayload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }
        if (payload.entry.diagnosticsCaptureState) {
          diagnosticsCaptureStateRevisionRef.current.supersede();
          setDiagnosticsCaptureState(payload.entry.diagnosticsCaptureState);
        }
        if (payload.entry.text.startsWith("Navigation failed:")) {
          setLastLoadError(payload.entry.text);
        }
        pendingConsoleEntries.push(payload.entry);
        if (consoleFrame === null) {
          consoleFrame = requestAnimationFrame(flushConsoleEntries);
        }
      },
    );

    return () => {
      cancelled = true;
      if (consoleFrame !== null) {
        cancelAnimationFrame(consoleFrame);
      }
      unsubscribe?.();
    };
  }, [hasLensApi, lensSessionId, workspaceId]);

  useEffect(() => {
    setNetworkEntries([]);
    setSelectedNetworkEntryId(null);
    setNetworkDetailsOpen(false);
    setNetworkEntryDetail(null);
    setNetworkDetailError(null);
    setNetworkBodyState({ request: null, response: null });
    if (!workspaceId || !hasLensApi) {
      return;
    }

    let cancelled = false;
    let pendingNetworkEntries: BrowserNetworkEntry[] = [];
    let networkFrame: number | null = null;
    const flushNetworkEntries = () => {
      networkFrame = null;
      const entries = pendingNetworkEntries;
      pendingNetworkEntries = [];
      if (cancelled || entries.length === 0) {
        return;
      }
      if (networkPausedRef.current) {
        networkPausedBufferRef.current = upsertNetworkEntriesLimited(
          networkPausedBufferRef.current,
          entries,
        );
        setNetworkBufferedCount(networkPausedBufferRef.current.length);
        return;
      }
      setNetworkEntries((current) =>
        upsertNetworkEntriesLimited(current, entries),
      );
    };
    void window.api?.lens
      ?.getNetworkLog?.({ workspaceId, lensSessionId, limit: LENS_LOG_LIMIT })
      .then((result) => {
        if (!cancelled && result?.ok && result.entries) {
          const entries = result.entries;
          setNetworkEntries((current) =>
            upsertNetworkEntriesLimited(entries, current),
          );
        }
      });

    const unsubscribe = window.api?.lens?.subscribeNetworkEvents?.(
      (payload: BrowserNetworkEventPayload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }
        pendingNetworkEntries.push(...(payload.entries ?? [payload.entry]));
        if (networkFrame === null) {
          networkFrame = requestAnimationFrame(flushNetworkEntries);
        }
      },
    );

    return () => {
      cancelled = true;
      if (networkFrame !== null) {
        cancelAnimationFrame(networkFrame);
      }
      unsubscribe?.();
    };
  }, [hasLensApi, lensSessionId, workspaceId]);

  useEffect(() => {
    const requestRevision =
      diagnosticsCaptureStateRevisionRef.current.supersede();
    setDiagnosticsCaptureState(null);
    const getCaptureState = window.api?.lens?.getDiagnosticsCaptureState;
    if (!workspaceId || !hasLensApi || !getCaptureState) {
      return;
    }

    let cancelled = false;
    void getCaptureState({ workspaceId, lensSessionId })
      .then((result) => {
        if (
          cancelled ||
          !diagnosticsCaptureStateRevisionRef.current.isCurrent(requestRevision)
        ) {
          return;
        }
        if (result.ok && result.state) {
          setDiagnosticsCaptureState(result.state);
          return;
        }
        setDiagnosticsCaptureState({
          enabled: false,
          message: result.message ?? "Full diagnostics capture is unavailable.",
        });
      })
      .catch((error) => {
        if (
          cancelled ||
          !diagnosticsCaptureStateRevisionRef.current.isCurrent(requestRevision)
        ) {
          return;
        }
        setDiagnosticsCaptureState({
          enabled: false,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [hasLensApi, lensSessionId, url, workspaceId]);

  useLayoutEffect(() => {
    setNetworkEntryDetail(null);
    setNetworkDetailError(null);
  }, [selectedNetworkEntryId, selectedNetworkEntryState]);

  useEffect(() => {
    if (
      !workspaceId ||
      !hasLensApi ||
      !selectedConsoleEntryId ||
      !consoleDetailsOpen
    ) {
      return;
    }
    const getDetail = window.api?.lens?.getConsoleEntryDetail;
    if (!getDetail) {
      setConsoleEntryDetail(null);
      setConsoleDetailError("Console detail capture is unavailable.");
      return;
    }

    let cancelled = false;
    setConsoleEntryDetail(null);
    setConsoleDetailError(null);
    setConsoleDetailLoading(true);
    void getDetail({
      workspaceId,
      lensSessionId,
      entryId: selectedConsoleEntryId,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.ok && result.detail) {
          setConsoleEntryDetail(result.detail);
          return;
        }
        setConsoleDetailError(
          result.message ?? "Console detail is unavailable for this entry.",
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setConsoleDetailError(
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setConsoleDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    consoleDetailsOpen,
    hasLensApi,
    lensSessionId,
    selectedConsoleEntryId,
    workspaceId,
  ]);

  useEffect(() => {
    if (
      !workspaceId ||
      !hasLensApi ||
      !selectedNetworkEntryId ||
      !selectedNetworkEntryState ||
      !networkDetailsOpen
    ) {
      return;
    }
    const getDetail = window.api?.lens?.getNetworkEntryDetail;
    if (!getDetail) {
      setNetworkEntryDetail(null);
      setNetworkDetailError("Network detail capture is unavailable.");
      return;
    }

    let cancelled = false;
    setNetworkEntryDetail(null);
    setNetworkDetailError(null);
    setNetworkDetailLoading(true);
    void getDetail({
      workspaceId,
      lensSessionId,
      entryId: selectedNetworkEntryId,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.ok && result.detail) {
          setNetworkEntryDetail(result.detail);
          return;
        }
        setNetworkDetailError(
          result.message ?? "Network detail is unavailable for this entry.",
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setNetworkDetailError(
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setNetworkDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    hasLensApi,
    lensSessionId,
    networkDetailsOpen,
    selectedNetworkEntryState,
    selectedNetworkEntryId,
    workspaceId,
  ]);

  useEffect(() => {
    const kind =
      networkDetailTab === "payload"
        ? "request"
        : networkDetailTab === "response"
          ? "response"
          : null;
    if (
      !kind ||
      !workspaceId ||
      !hasLensApi ||
      !selectedNetworkEntryId ||
      !selectedNetworkEntryState ||
      !networkDetailsOpen
    ) {
      return;
    }
    const current = networkBodyStateRef.current[kind];
    if (
      current?.entryId === selectedNetworkEntryId &&
      current.entryState === selectedNetworkEntryState &&
      (current.loading || current.body || current.error)
    ) {
      return;
    }
    const getBody = window.api?.lens?.getNetworkBody;
    if (!getBody) {
      setNetworkBodyState((state) => ({
        ...state,
        [kind]: {
          entryId: selectedNetworkEntryId,
          entryState: selectedNetworkEntryState,
          loading: false,
          body: null,
          error: "Network body capture is unavailable.",
        },
      }));
      return;
    }

    let cancelled = false;
    setNetworkBodyState((state) => ({
      ...state,
      [kind]: {
        entryId: selectedNetworkEntryId,
        entryState: selectedNetworkEntryState,
        loading: true,
        body: null,
        error: null,
      },
    }));
    void getBody({
      workspaceId,
      lensSessionId,
      entryId: selectedNetworkEntryId,
      kind,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setNetworkBodyState((state) => ({
          ...state,
          [kind]: {
            entryId: selectedNetworkEntryId,
            entryState: selectedNetworkEntryState,
            loading: false,
            body: result.ok ? (result.body ?? null) : null,
            error: result.ok
              ? null
              : (result.message ?? "Network body is unavailable."),
          },
        }));
      })
      .catch((error) => {
        if (!cancelled) {
          setNetworkBodyState((state) => ({
            ...state,
            [kind]: {
              entryId: selectedNetworkEntryId,
              entryState: selectedNetworkEntryState,
              loading: false,
              body: null,
              error: error instanceof Error ? error.message : String(error),
            },
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    hasLensApi,
    lensSessionId,
    networkDetailTab,
    networkDetailsOpen,
    selectedNetworkEntryState,
    selectedNetworkEntryId,
    workspaceId,
  ]);

  const filteredConsoleEntries = useMemo(() => {
    const query = consoleSearch.trim().toLowerCase();
    return consoleEntries.filter((entry) => {
      if (consoleLevelFilter !== "all" && entry.level !== consoleLevelFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        entry.text.toLowerCase().includes(query) ||
        entry.source?.toLowerCase().includes(query)
      );
    });
  }, [consoleEntries, consoleLevelFilter, consoleSearch]);

  const filteredNetworkEntries = useMemo(() => {
    const query = networkSearch.trim().toLowerCase();
    if (!query) {
      return networkEntries;
    }
    return networkEntries.filter(
      (entry) =>
        entry.url.toLowerCase().includes(query) ||
        entry.method.toLowerCase().includes(query) ||
        entry.resourceType?.toLowerCase().includes(query) ||
        entry.mimeType?.toLowerCase().includes(query) ||
        entry.error?.toLowerCase().includes(query) ||
        String(entry.status ?? "").includes(query),
    );
  }, [networkEntries, networkSearch]);
  const networkWaterfallMaxMs = useMemo(
    () =>
      Math.max(
        1,
        ...filteredNetworkEntries.map((entry) => entry.durationMs ?? 0),
      ),
    [filteredNetworkEntries],
  );

  useEffect(() => {
    if (!autoScrollLogs || lensPanelTab !== "console") {
      return;
    }
    const node = consoleLogRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [autoScrollLogs, filteredConsoleEntries.length, lensPanelTab]);

  useEffect(() => {
    if (!autoScrollLogs || lensPanelTab !== "network") {
      return;
    }
    const node = networkLogRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [autoScrollLogs, filteredNetworkEntries.length, lensPanelTab]);

  useEffect(() => {
    if (
      selectedConsoleEntryId &&
      !consoleEntries.some((entry) => entry.id === selectedConsoleEntryId)
    ) {
      setSelectedConsoleEntryId(null);
      setConsoleDetailsOpen(false);
    }
  }, [consoleEntries, selectedConsoleEntryId]);

  useEffect(() => {
    if (
      selectedNetworkEntryId &&
      !networkEntries.some((entry) => entry.entryId === selectedNetworkEntryId)
    ) {
      setSelectedNetworkEntryId(null);
      setNetworkDetailsOpen(false);
    }
  }, [networkEntries, selectedNetworkEntryId]);

  const copyConsoleLog = useCallback(() => {
    void copyTextToClipboard(formatConsoleEntries(filteredConsoleEntries))
      .then(() => {
        toast.success("Console copied");
      })
      .catch(() => {
        toast.error("Failed to copy console log");
      });
  }, [filteredConsoleEntries]);

  const copyNetworkLog = useCallback(() => {
    void copyTextToClipboard(formatNetworkEntries(filteredNetworkEntries))
      .then(() => {
        toast.success("Network log copied");
      })
      .catch(() => {
        toast.error("Failed to copy network log");
      });
  }, [filteredNetworkEntries]);

  const toggleConsolePaused = useCallback(() => {
    const nextPaused = !consolePausedRef.current;
    consolePausedRef.current = nextPaused;
    setConsolePaused(nextPaused);
    if (nextPaused) {
      return;
    }

    const buffered = consolePausedBufferRef.current;
    consolePausedBufferRef.current = [];
    setConsoleBufferedCount(0);
    if (buffered.length > 0) {
      setConsoleEntries((current) =>
        upsertConsoleEntriesLimited(current, buffered),
      );
    }
  }, []);

  const toggleNetworkPaused = useCallback(() => {
    const nextPaused = !networkPausedRef.current;
    networkPausedRef.current = nextPaused;
    setNetworkPaused(nextPaused);
    if (nextPaused) {
      return;
    }

    const buffered = networkPausedBufferRef.current;
    networkPausedBufferRef.current = [];
    setNetworkBufferedCount(0);
    if (buffered.length > 0) {
      setNetworkEntries((current) =>
        upsertNetworkEntriesLimited(current, buffered),
      );
    }
  }, []);

  const clearConsoleLog = useCallback(() => {
    consolePausedBufferRef.current = [];
    setConsoleBufferedCount(0);
    setConsoleEntries([]);
    setSelectedConsoleEntryId(null);
    setConsoleDetailsOpen(false);
    setConsoleEntryDetail(null);
    setConsoleDetailError(null);
    setLastLoadError(null);

    const clear = window.api?.lens?.clearConsoleLog;
    if (!clear) {
      return;
    }
    void clear({ workspaceId, lensSessionId })
      .then((result) => {
        if (!result.ok) {
          toast.error("Could not clear console history", {
            description: result.message,
          });
        }
      })
      .catch((error) => {
        toast.error("Could not clear console history", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  }, [lensSessionId, workspaceId]);

  const clearNetworkLog = useCallback(() => {
    networkPausedBufferRef.current = [];
    setNetworkBufferedCount(0);
    setNetworkEntries([]);
    setSelectedNetworkEntryId(null);
    setNetworkDetailsOpen(false);
    setNetworkEntryDetail(null);
    setNetworkDetailError(null);
    setNetworkBodyState({ request: null, response: null });

    const clear = window.api?.lens?.clearNetworkLog;
    if (!clear) {
      return;
    }
    void clear({ workspaceId, lensSessionId })
      .then((result) => {
        if (!result.ok) {
          toast.error("Could not clear network history", {
            description: result.message,
          });
        }
      })
      .catch((error) => {
        toast.error("Could not clear network history", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  }, [lensSessionId, workspaceId]);

  const copySelectedConsoleEntry = useCallback(() => {
    if (!selectedConsoleEntry) {
      return;
    }
    void copyTextToClipboard(formatConsoleEntries([selectedConsoleEntry])).then(
      () => toast.success("Console entry copied"),
      () => toast.error("Failed to copy console entry"),
    );
  }, [selectedConsoleEntry]);

  const copySelectedNetworkEntry = useCallback(() => {
    if (!selectedNetworkEntry) {
      return;
    }
    void copyTextToClipboard(
      formatNetworkEntryDetails(selectedNetworkEntry),
    ).then(
      () => toast.success("Network entry copied"),
      () => toast.error("Failed to copy network entry"),
    );
  }, [selectedNetworkEntry]);

  const loadConsoleObjectProperties = useCallback(
    async (objectHandle: string) => {
      const getProperties = window.api?.lens?.getConsoleObjectProperties;
      if (!workspaceId || !selectedConsoleEntryId || !getProperties) {
        throw new Error("Object inspection is unavailable.");
      }
      const result = await getProperties({
        workspaceId,
        lensSessionId,
        entryId: selectedConsoleEntryId,
        objectHandle,
        limit: 100,
      });
      if (!result.ok || !result.properties) {
        throw new Error(
          result.message ?? "Object properties are no longer available.",
        );
      }
      return result.properties;
    },
    [lensSessionId, selectedConsoleEntryId, workspaceId],
  );

  const setDiagnosticsCapture = useCallback(
    async (enabled: boolean) => {
      const setCapture = window.api?.lens?.setDiagnosticsCapture;
      if (!workspaceId || !setCapture || diagnosticsCaptureBusy) {
        return;
      }
      const requestRevision =
        diagnosticsCaptureStateRevisionRef.current.supersede();
      setDiagnosticsCaptureBusy(true);
      try {
        const result = await setCapture({
          workspaceId,
          lensSessionId,
          enabled,
        });
        if (
          !diagnosticsCaptureStateRevisionRef.current.isCurrent(requestRevision)
        ) {
          return;
        }
        if (!result.ok || !result.state) {
          toast.error(
            enabled
              ? "Could not start full capture"
              : "Could not stop full capture",
            {
              description:
                result.message ?? "Lens diagnostics capture did not respond.",
            },
          );
          return;
        }
        setDiagnosticsCaptureState(result.state);
      } catch (error) {
        if (
          !diagnosticsCaptureStateRevisionRef.current.isCurrent(requestRevision)
        ) {
          return;
        }
        toast.error(
          enabled
            ? "Could not start full capture"
            : "Could not stop full capture",
          {
            description: error instanceof Error ? error.message : String(error),
          },
        );
      } finally {
        setDiagnosticsCaptureBusy(false);
      }
    },
    [diagnosticsCaptureBusy, lensSessionId, workspaceId],
  );

  return {
    autoScrollLogs,
    clearConsoleLog,
    clearNetworkLog,
    consoleBufferedCount,
    consoleDetailError,
    consoleDetailLoading,
    consoleDetailTab,
    consoleDetailsOpen,
    consoleEntries,
    consoleEntryDetail,
    consoleLevelFilter,
    consoleLogRef,
    consolePaused,
    consolePausedBufferRef,
    consolePausedRef,
    consoleSearch,
    copyConsoleLog,
    copyNetworkLog,
    copySelectedConsoleEntry,
    copySelectedNetworkEntry,
    diagnosticsCaptureBusy,
    diagnosticsCaptureState,
    filteredConsoleEntries,
    filteredNetworkEntries,
    loadConsoleObjectProperties,
    networkBufferedCount,
    networkDetailError,
    networkDetailLoading,
    networkDetailTab,
    networkDetailsOpen,
    networkEntries,
    networkEntryDetail,
    networkLogRef,
    networkPaused,
    networkPausedBufferRef,
    networkPausedRef,
    networkSearch,
    networkWaterfallMaxMs,
    selectedConsoleEntry,
    selectedConsoleEntryId,
    selectedNetworkEntry,
    selectedNetworkEntryId,
    selectedRequestBodyState,
    selectedResponseBodyState,
    setAutoScrollLogs,
    setConsoleBufferedCount,
    setConsoleDetailTab,
    setConsoleDetailsOpen,
    setConsoleEntries,
    setConsoleLevelFilter,
    setConsolePaused,
    setConsoleSearch,
    setDiagnosticsCapture,
    setNetworkBufferedCount,
    setNetworkDetailTab,
    setNetworkDetailsOpen,
    setNetworkEntries,
    setNetworkPaused,
    setNetworkSearch,
    setSelectedConsoleEntryId,
    setSelectedNetworkEntryId,
    toggleConsolePaused,
    toggleNetworkPaused,
  };
}

export type LensDiagnosticsLog = ReturnType<typeof useLensDiagnosticsLog>;
