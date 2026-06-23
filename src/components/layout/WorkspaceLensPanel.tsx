import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDownToLine,
  Camera,
  ChevronDown,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  Globe,
  Highlighter,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Network,
  Pause,
  Play,
  RotateCw,
  ScanSearch,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatAnnotationsForChat,
  formatElementForChat,
} from "@/lib/lens/lens-element-message";
import { copyTextToClipboard } from "@/lib/clipboard";
import type {
  BrowserConsoleEntry,
  BrowserConsoleEventPayload,
  BrowserNetworkEntry,
  BrowserNetworkEventPayload,
  LensAnnotation,
  LensAnnotationEventPayload,
  BrowserNavigationEventPayload,
  BrowserNavigationState,
  ElementPickerResult,
  LensBounds,
  LensCdpApprovalRequestPayload,
  LensDownloadEntry,
  LensDownloadEventPayload,
  LensSourceMappingConfig,
  LensStyleEdit,
} from "@/lib/lens/lens.types";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

const DEFAULT_NAVIGATION_STATE: BrowserNavigationState = {
  url: "about:blank",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
};

const LENS_LOG_LIMIT = 200;
type LensPanelTab = "preview" | "console" | "network";
type ConsoleLevelFilter = "all" | BrowserConsoleEntry["level"];

const CONSOLE_LEVEL_FILTERS: ConsoleLevelFilter[] = [
  "all",
  "error",
  "warn",
  "info",
  "log",
  "debug",
];

function appendLimited<T>(entries: T[], entry: T): T[] {
  return [...entries, entry].slice(-LENS_LOG_LIMIT);
}

function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatBytes(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "-";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getConsoleLevelClass(level: BrowserConsoleEntry["level"]) {
  switch (level) {
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "warn":
      return "border-warning/30 bg-warning/10 text-warning";
    case "info":
      return "border-primary/30 bg-primary/10 text-primary";
    case "debug":
      return "border-muted-foreground/30 bg-muted/50 text-muted-foreground";
    default:
      return "border-border bg-muted/60 text-foreground";
  }
}

function getNetworkStatusClass(status: number | undefined) {
  if (!status) {
    return "text-destructive";
  }
  if (status >= 500) {
    return "text-destructive";
  }
  if (status >= 400) {
    return "text-warning";
  }
  if (status >= 300) {
    return "text-primary";
  }
  return "text-success";
}

function formatConsoleEntries(entries: BrowserConsoleEntry[]): string {
  return entries
    .map((entry) => {
      const source = entry.source ? ` ${entry.source}` : "";
      return `[${entry.timestamp}] ${entry.level.toUpperCase()}${source} ${entry.text}`;
    })
    .join("\n");
}

function formatNetworkEntries(entries: BrowserNetworkEntry[]): string {
  return entries
    .map((entry) => {
      const status = entry.status ?? "-";
      const mimeType = entry.mimeType ?? "-";
      return `[${entry.timestamp}] ${entry.method} ${status} ${mimeType} ${entry.url}`;
    })
    .join("\n");
}

function hasLensOccludingFloatingSurface(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return Boolean(
    document.querySelector(
      ".t-dropdown, .t-modal, .t-overlay, .cn-toast, [data-sonner-toast]",
    ),
  );
}

function areLensBoundsEqual(
  left: LensBounds | null,
  right: LensBounds | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function mergeDownloadEntry(
  entries: LensDownloadEntry[],
  entry: LensDownloadEntry,
): LensDownloadEntry[] {
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  const next =
    index >= 0
      ? entries.map((candidate, candidateIndex) =>
          candidateIndex === index ? entry : candidate,
        )
      : [...entries, entry];
  return next.slice(-20);
}

function mergeAnnotationEntry(
  annotations: LensAnnotation[],
  annotation: LensAnnotation,
): LensAnnotation[] {
  const index = annotations.findIndex(
    (candidate) => candidate.id === annotation.id,
  );
  if (index >= 0) {
    return annotations.map((candidate, candidateIndex) =>
      candidateIndex === index ? annotation : candidate,
    );
  }
  return [...annotations, annotation].sort((left, right) => left.pin - right.pin);
}

const ANNOTATION_STYLE_FIELDS = [
  "fontSize",
  "fontWeight",
  "color",
  "backgroundColor",
  "padding",
  "margin",
] as const;

function resolveAnnotationStyleValue(
  annotation: LensAnnotation,
  field: (typeof ANNOTATION_STYLE_FIELDS)[number],
): string {
  const edit = annotation.styleEdits
    ?.slice()
    .reverse()
    .find((candidate) => candidate.property === field);
  return edit?.after ?? annotation.computedStyles?.[field] ?? "";
}

function AnnotationStylePopover(args: {
  annotation: LensAnnotation;
  disabled: boolean;
  onOpenChange?: (open: boolean) => void;
  onApply: (
    annotation: LensAnnotation,
    patch: Record<string, string>,
  ) => Promise<void>;
}) {
  const { annotation, disabled, onApply, onOpenChange } = args;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const field of ANNOTATION_STYLE_FIELDS) {
      next[field] = resolveAnnotationStyleValue(annotation, field);
    }
    setDraft(next);
  }, [annotation]);

  const patch = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(draft).filter(([field, value]) => {
          const trimmed = value.trim();
          return (
            trimmed !== "" &&
            trimmed !==
              resolveAnnotationStyleValue(
                annotation,
                field as (typeof ANNOTATION_STYLE_FIELDS)[number],
              )
          );
        }),
      ),
    [annotation, draft],
  );

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={disabled || !annotation.selector}
          aria-label={`Edit styles for annotation ${annotation.pin}`}
        >
          <SlidersHorizontal className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <PopoverTitle>Style</PopoverTitle>
          <PopoverDescription>
            Live inline edits for the selected element.
          </PopoverDescription>
        </div>
        <div className="grid gap-2">
          {ANNOTATION_STYLE_FIELDS.map((field) => (
            <label key={field} className="grid gap-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {field}
              </span>
              <Input
                value={draft[field] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                className="h-7 font-mono text-xs"
              />
            </label>
          ))}
        </div>
        <Button
          type="button"
          size="xs"
          className="w-full"
          disabled={saving || Object.keys(patch).length === 0}
          onClick={() => {
            setSaving(true);
            void onApply(annotation, patch).finally(() => setSaving(false));
          }}
        >
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function WorkspaceLensPanel(args: { occluded?: boolean }) {
  // Keep the store subscription primitive-only. Returning a nested object here
  // causes a fresh selector snapshot on every render, which can trigger React
  // 19 ref/update loops on tooltip-heavy surfaces like Lens.
  const [
    workspaceId,
    activeTaskId,
    lensSourceMappingHeuristic,
    lensSourceMappingReactDebugSource,
    isLensFullscreen,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.activeTaskId,
    state.settings.lensSourceMappingHeuristic,
    state.settings.lensSourceMappingReactDebugSource,
    Boolean(state.layout.lensFullscreenByWorkspaceId[state.activeWorkspaceId]),
  ] as const));

  const sourceMappingConfig = useMemo(
    () =>
      ({
        heuristic: lensSourceMappingHeuristic,
        reactDebugSource: lensSourceMappingReactDebugSource,
      } satisfies LensSourceMappingConfig),
    [lensSourceMappingHeuristic, lensSourceMappingReactDebugSource],
  );

  const lensApi = window.api?.lens;
  const hasLensApi = Boolean(lensApi);

  const placeholderRef = useRef<HTMLDivElement>(null);
  const measureRafRef = useRef<number>(0);
  const flushRafRef = useRef<number>(0);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const pendingBoundsRef = useRef<LensBounds | null>(null);
  const lastSentBoundsRef = useRef<LensBounds | null>(null);
  const boundsRequestInFlightRef = useRef(false);
  const isViewReadyRef = useRef(false);
  // Track whether the URL address bar is focused so navigation events don't
  // clobber text the user is actively editing.
  const isUrlInputFocused = useRef(false);

  const [url, setUrl] = useState(DEFAULT_NAVIGATION_STATE.url);
  const [inputUrl, setInputUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [cdpApprovalRequest, setCdpApprovalRequest] =
    useState<LensCdpApprovalRequestPayload | null>(null);
  const [downloads, setDownloads] = useState<LensDownloadEntry[]>([]);
  const [annotations, setAnnotations] = useState<LensAnnotation[]>([]);
  const [isAnnotationModeActive, setIsAnnotationModeActive] = useState(false);
  const [isLensFloatingSurfaceOpen, setIsLensFloatingSurfaceOpen] =
    useState(false);
  const [lensPanelTab, setLensPanelTab] = useState<LensPanelTab>("preview");
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
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [lastLoadError, setLastLoadError] = useState<string | null>(null);
  const [hasExternalFloatingSurface, setHasExternalFloatingSurface] =
    useState(false);
  const consoleLogRef = useRef<HTMLDivElement>(null);
  const networkLogRef = useRef<HTMLDivElement>(null);
  const isOccluded = Boolean(args.occluded);
  const isLensSuppressed =
    isOccluded ||
    isLensFloatingSurfaceOpen ||
    hasExternalFloatingSurface ||
    lensPanelTab !== "preview";
  const cdpApprovalRequestRef =
    useRef<LensCdpApprovalRequestPayload | null>(null);
  const isLensSuppressedRef = useRef(isLensSuppressed);
  const consolePausedRef = useRef(consolePaused);
  const networkPausedRef = useRef(networkPaused);
  isLensSuppressedRef.current = isLensSuppressed;
  consolePausedRef.current = consolePaused;
  networkPausedRef.current = networkPaused;

  useEffect(() => {
    cdpApprovalRequestRef.current = cdpApprovalRequest;
  }, [cdpApprovalRequest]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) {
      return;
    }

    let frame = 0;
    const sync = () => {
      frame = 0;
      const next = hasLensOccludingFloatingSurface();
      setHasExternalFloatingSurface((current) =>
        current === next ? current : next,
      );
    };
    const scheduleSync = () => {
      if (frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      observer.disconnect();
    };
  }, []);

  const setLensFullscreen = useCallback((nextFullscreen: boolean) => {
    const state = useAppStore.getState();
    const currentWorkspaceId = state.activeWorkspaceId;
    if (!currentWorkspaceId) {
      return;
    }
    state.setLayout({
      patch: {
        lensFullscreenByWorkspaceId: {
          ...state.layout.lensFullscreenByWorkspaceId,
          [currentWorkspaceId]: nextFullscreen,
        },
      },
    });
  }, []);

  const applyNavigationState = useCallback((state: BrowserNavigationState) => {
    setUrl(state.url);
    // Only sync the input field when the user is not actively typing in it.
    // Without this guard, in-progress SPA redirects would erase partially typed URLs.
    if (!isUrlInputFocused.current) {
      setInputUrl(state.url === "about:blank" ? "" : state.url);
    }
    setTitle(state.title);
    setIsLoading(state.isLoading);
    if (state.isLoading) {
      setLastLoadError(null);
    }
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
  }, []);

  const flushPendingBounds = useCallback(() => {
    if (!workspaceId || !hasLensApi || boundsRequestInFlightRef.current) {
      return;
    }

    const bounds = pendingBoundsRef.current;
    if (!bounds) {
      return;
    }

    if (areLensBoundsEqual(bounds, lastSentBoundsRef.current)) {
      pendingBoundsRef.current = null;
      return;
    }

    pendingBoundsRef.current = null;
    boundsRequestInFlightRef.current = true;

    const request = window.api?.lens?.setBounds?.({
      workspaceId,
      bounds,
    });
    if (!request) {
      boundsRequestInFlightRef.current = false;
      return;
    }

    void request
      .then((result) => {
        if (result?.ok) {
          lastSentBoundsRef.current = bounds;
        }
      })
      .catch(() => {
        // Bounds sync is best-effort; the next layout change retries.
      })
      .finally(() => {
        boundsRequestInFlightRef.current = false;

        if (!pendingBoundsRef.current) {
          return;
        }

        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = requestAnimationFrame(() => {
          flushPendingBounds();
        });
      });
  }, [hasLensApi, workspaceId]);

  const syncBounds = useCallback((options?: { immediate?: boolean }) => {
    const el = placeholderRef.current;
    if (
      !workspaceId ||
      !el ||
      !hasLensApi ||
      !isViewReadyRef.current ||
      isLensSuppressedRef.current
    ) {
      return;
    }

    const measureBounds = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      pendingBoundsRef.current = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      cancelAnimationFrame(flushRafRef.current);
      if (options?.immediate) {
        flushPendingBounds();
        return;
      }

      flushRafRef.current = requestAnimationFrame(() => {
        flushPendingBounds();
      });
    };

    cancelAnimationFrame(measureRafRef.current);
    if (options?.immediate) {
      measureBounds();
      return;
    }

    measureRafRef.current = requestAnimationFrame(measureBounds);
  }, [flushPendingBounds, hasLensApi, workspaceId]);

  useLayoutEffect(() => {
    if (!workspaceId || !hasLensApi || isLensSuppressed) {
      return;
    }

    syncBounds({ immediate: true });
  }, [
    annotations.length,
    hasLensApi,
    isAnnotationModeActive,
    isLensFullscreen,
    isLensSuppressed,
    syncBounds,
    workspaceId,
  ]);

  useEffect(() => {
    if (!isLensFullscreen) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setLensFullscreen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLensFullscreen, setLensFullscreen]);

  useEffect(() => {
    pendingBoundsRef.current = null;
    lastSentBoundsRef.current = null;
    boundsRequestInFlightRef.current = false;
    isViewReadyRef.current = false;
    setAnnotations([]);
    setIsAnnotationModeActive(false);
    setConsoleEntries([]);
    setNetworkEntries([]);
    setLastLoadError(null);
    setLensPanelTab("preview");

    if (!workspaceId) {
      applyNavigationState(DEFAULT_NAVIGATION_STATE);
      return;
    }

    applyNavigationState(DEFAULT_NAVIGATION_STATE);

    if (!hasLensApi) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const createResult = await lensApi?.createView?.({ workspaceId });
      if (cancelled || !createResult?.ok) {
        if (!cancelled && createResult && !createResult.ok) {
          toast.error("Lens failed to start", {
            description: createResult.message ?? "Could not create the embedded browser view.",
          });
        }
        return;
      }

      isViewReadyRef.current = true;
      await lensApi?.setVisible?.({
        workspaceId,
        visible: !isLensSuppressedRef.current,
      });

      const stateResult = await lensApi?.getState?.({ workspaceId });
      if (!cancelled && stateResult?.ok && stateResult.state) {
        applyNavigationState(stateResult.state);
        setIsAnnotationModeActive(Boolean(stateResult.annotationModeActive));
      }

      const annotationsResult = await lensApi?.getAnnotations?.({ workspaceId });
      if (!cancelled && annotationsResult?.ok) {
        setAnnotations(annotationsResult.annotations ?? []);
      }

      if (isLensSuppressedRef.current) {
        await lensApi?.setBounds?.({
          workspaceId,
          bounds: { x: 0, y: 0, width: 0, height: 0 },
        });
        return;
      }

      syncBounds();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(measureRafRef.current);
      cancelAnimationFrame(flushRafRef.current);
      pendingBoundsRef.current = null;
      lastSentBoundsRef.current = null;
      boundsRequestInFlightRef.current = false;
      isViewReadyRef.current = false;
      // Reset bounds first so the view doesn't occlude other panels while hidden.
      void window.api?.lens?.setBounds?.({
        workspaceId,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      });
      void window.api?.lens?.setVisible?.({ workspaceId, visible: false });
      // Keep the workspace-scoped session alive so returning to the workspace
      // restores its Lens page, annotation overlay, and navigation history.
    };
  }, [applyNavigationState, hasLensApi, lensApi, syncBounds, workspaceId]);

  useEffect(() => {
    const el = placeholderRef.current;
    if (!workspaceId || !el || !hasLensApi) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncBounds();
    });
    resizeObserver.observe(el);

    const handleWindowResize = () => {
      syncBounds();
    };

    window.addEventListener("resize", handleWindowResize);
    const unsubscribeZoom = window.api?.window?.subscribeZoomChanges?.(() => {
      syncBounds();
    });

    syncBounds();

    return () => {
      cancelAnimationFrame(measureRafRef.current);
      cancelAnimationFrame(flushRafRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      unsubscribeZoom?.();
    };
  }, [hasLensApi, syncBounds, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    if (isLensSuppressed) {
      cancelAnimationFrame(measureRafRef.current);
      cancelAnimationFrame(flushRafRef.current);
      pendingBoundsRef.current = null;
      lastSentBoundsRef.current = null;
      void window.api?.lens?.setBounds?.({
        workspaceId,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      });
      void window.api?.lens?.setVisible?.({ workspaceId, visible: false });
      return;
    }

    void window.api?.lens?.setVisible?.({ workspaceId, visible: true });
    syncBounds();
  }, [
    hasLensApi,
    isLensSuppressed,
    syncBounds,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi || !cdpApprovalRequest) {
      return;
    }

    cancelAnimationFrame(measureRafRef.current);
    cancelAnimationFrame(flushRafRef.current);
    pendingBoundsRef.current = null;
    lastSentBoundsRef.current = null;
    void window.api?.lens?.setBounds?.({
      workspaceId,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    });
    void window.api?.lens?.setVisible?.({ workspaceId, visible: false });

    return () => {
      if (isLensSuppressedRef.current) {
        return;
      }
      void window.api?.lens?.setVisible?.({ workspaceId, visible: true });
      syncBounds();
    };
  }, [cdpApprovalRequest, hasLensApi, syncBounds, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const unsubscribe = window.api?.lens?.subscribeNavigationEvents?.(
      (payload: BrowserNavigationEventPayload) => {
        if (payload.workspaceId !== workspaceId) {
          return;
        }
        applyNavigationState(payload.state);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [applyNavigationState, hasLensApi, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const unsubscribe = window.api?.lens?.subscribeCdpApprovalRequests?.(
      (payload: LensCdpApprovalRequestPayload) => {
        if (payload.workspaceId !== workspaceId) {
          return;
        }
        setCdpApprovalRequest(payload);
      },
    );

    return () => {
      const pending = cdpApprovalRequestRef.current;
      if (pending?.workspaceId === workspaceId) {
        void window.api?.lens?.respondCdpApproval?.({
          requestId: pending.requestId,
          approved: false,
        });
      }
      unsubscribe?.();
    };
  }, [hasLensApi, workspaceId]);

  useEffect(() => {
    setDownloads([]);
    if (!workspaceId || !hasLensApi) {
      return;
    }

    let cancelled = false;
    void window.api?.lens?.listDownloads?.({ workspaceId }).then((result) => {
      if (!cancelled && result?.ok && result.entries) {
        setDownloads(result.entries.slice(-20));
      }
    });

    const unsubscribe = window.api?.lens?.subscribeDownloadEvents?.(
      (payload: LensDownloadEventPayload) => {
        if (payload.workspaceId !== workspaceId) {
          return;
        }
        setDownloads((current) => mergeDownloadEntry(current, payload.entry));
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hasLensApi, workspaceId]);

  useEffect(() => {
    setConsoleEntries([]);
    setLastLoadError(null);
    if (!workspaceId || !hasLensApi) {
      return;
    }

    let cancelled = false;
    void window.api?.lens
      ?.getConsoleLog?.({ workspaceId, limit: LENS_LOG_LIMIT })
      .then((result) => {
        if (!cancelled && result?.ok && result.entries) {
          const entries = result.entries.slice(-LENS_LOG_LIMIT);
          setConsoleEntries(entries);
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
        if (payload.workspaceId !== workspaceId) {
          return;
        }
        if (payload.entry.text.startsWith("Navigation failed:")) {
          setLastLoadError(payload.entry.text);
        }
        if (consolePausedRef.current) {
          return;
        }
        setConsoleEntries((current) => appendLimited(current, payload.entry));
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hasLensApi, workspaceId]);

  useEffect(() => {
    setNetworkEntries([]);
    if (!workspaceId || !hasLensApi) {
      return;
    }

    let cancelled = false;
    void window.api?.lens
      ?.getNetworkLog?.({ workspaceId, limit: LENS_LOG_LIMIT })
      .then((result) => {
        if (!cancelled && result?.ok && result.entries) {
          setNetworkEntries(result.entries.slice(-LENS_LOG_LIMIT));
        }
      });

    const unsubscribe = window.api?.lens?.subscribeNetworkEvents?.(
      (payload: BrowserNetworkEventPayload) => {
        if (payload.workspaceId !== workspaceId || networkPausedRef.current) {
          return;
        }
        setNetworkEntries((current) => appendLimited(current, payload.entry));
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hasLensApi, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const unsubscribe = window.api?.lens?.subscribeAnnotationEvents?.(
      (payload: LensAnnotationEventPayload) => {
        if (payload.workspaceId !== workspaceId) {
          return;
        }

        if (payload.type === "clear") {
          setAnnotations([]);
          return;
        }
        if (payload.type === "remove" && payload.annotation) {
          setAnnotations((current) =>
            current.filter(
              (annotation) => annotation.id !== payload.annotation?.id,
            ),
          );
          return;
        }
        if (
          (payload.type === "add" || payload.type === "update") &&
          payload.annotation
        ) {
          setAnnotations((current) =>
            mergeAnnotationEntry(current, payload.annotation!),
          );
        }
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [hasLensApi, workspaceId]);

  const navigate = useCallback(
    async (targetUrl: string) => {
      if (!workspaceId || !targetUrl.trim()) {
        return;
      }
      if (!hasLensApi) {
        toast.error("Lens is unavailable", {
          description: "The embedded browser only works in the Electron desktop runtime.",
        });
        return;
      }

      const result = await window.api?.lens?.navigate?.({
        workspaceId,
        url: targetUrl.trim(),
      });

      if (result && !result.ok) {
        toast.error("Navigation failed", {
          description: result.message ?? "Lens could not load that address.",
        });
      }
    },
    [hasLensApi, workspaceId],
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void navigate(inputUrl);
      urlInputRef.current?.blur();
    },
    [inputUrl, navigate],
  );

  const handleUrlKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setInputUrl(url === "about:blank" ? "" : url);
        urlInputRef.current?.blur();
      }
    },
    [url],
  );

  const goBack = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.goBack?.({ workspaceId });
    }
  }, [workspaceId]);

  const goForward = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.goForward?.({ workspaceId });
    }
  }, [workspaceId]);

  const reload = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.reload?.({ workspaceId });
    }
  }, [workspaceId]);

  const startElementPicker = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    if (!hasLensApi) {
      toast.error("Lens is unavailable", {
        description: "The embedded browser only works in the Electron desktop runtime.",
      });
      return;
    }
    if (!activeTaskId) {
      toast.warning("Select a task first", {
        description: "Lens sends element context into the active task draft.",
      });
      return;
    }

    setIsPickerActive(true);
    try {
      const result = await window.api?.lens?.startElementPicker?.({
        workspaceId,
        options: {
          extractDebugSource: sourceMappingConfig.reactDebugSource,
        },
      });

      if (!result?.ok) {
        toast.error("Element picker failed", {
          description: result?.message ?? "Lens could not start the element picker.",
        });
        return;
      }

      if (!result.result) {
        return;
      }

      const selectionText = formatElementForChat(
        result.result as ElementPickerResult,
        sourceMappingConfig,
      );

      // updatePromptDraft + promptFocusNonce both call zustand set(). In
      // React 18, event-handler updates are auto-batched so this is one
      // render, but we call through the store action to preserve its equality
      // guards and field merging logic.
      const currentText =
        useAppStore.getState().promptDraftByTask[activeTaskId]?.text?.trim() ?? "";
      useAppStore.getState().updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          text: currentText ? `${currentText}\n\n${selectionText}` : selectionText,
        },
      });
      useAppStore.setState((state) => ({
        promptFocusNonce: state.promptFocusNonce + 1,
      }));

      toast.success("Lens selection added", {
        description: "Element details were appended to the active task draft.",
      });
    } finally {
      setIsPickerActive(false);
    }
  }, [activeTaskId, hasLensApi, sourceMappingConfig, workspaceId]);

  const respondToCdpApproval = useCallback(
    async (approved: boolean) => {
      const request = cdpApprovalRequest;
      if (!request) {
        return;
      }

      setCdpApprovalRequest(null);
      cdpApprovalRequestRef.current = null;

      if (approved) {
        const state = useAppStore.getState();
        const host = request.host.trim().toLowerCase();
        const alreadyApproved = state.settings.lensCdpApprovedHosts.some(
          (entry) => entry.trim().toLowerCase() === host,
        );
        if (!alreadyApproved) {
          state.updateSettings({
            patch: {
              lensCdpApprovedHosts: [
                ...state.settings.lensCdpApprovedHosts,
                host,
              ],
            },
          });
        }
      }

      const result = await window.api?.lens?.respondCdpApproval?.({
        requestId: request.requestId,
        approved,
        remember: approved,
      });

      if (result && !result.ok) {
        toast.error("CDP approval expired", {
          description: "Retry the Lens action to request access again.",
        });
      }
    },
    [cdpApprovalRequest],
  );

  const saveScreenshot = useCallback(
    async (fullPage: boolean) => {
      if (!workspaceId || !hasLensApi) {
        return;
      }

      const result = await window.api?.lens?.saveScreenshot?.({
        workspaceId,
        options: { fullPage },
      });

      if (!result?.ok) {
        toast.error("Screenshot failed", {
          description: result?.message ?? "Lens could not save the screenshot.",
        });
        return;
      }

      toast.success("Screenshot saved", {
        description: result.path,
      });
    },
    [hasLensApi, workspaceId],
  );

  const downloadPageAssets = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const result = await window.api?.lens?.downloadPageAssets?.({
      workspaceId,
    });

    if (!result?.ok) {
      toast.error("Download failed", {
        description: result?.message ?? "Lens could not download page assets.",
      });
      return;
    }

    const count = result.entries?.length ?? 0;
    const failed = result.errors?.length ?? 0;
    toast.success("Page assets downloaded", {
      description:
        failed > 0
          ? `${count} saved, ${failed} skipped.`
          : `${count} asset${count === 1 ? "" : "s"} saved.`,
    });
  }, [hasLensApi, workspaceId]);

  const openDownloadInFinder = useCallback((savePath: string) => {
    void window.api?.shell?.showInFinder?.({ path: savePath });
  }, []);

  const toggleAnnotationMode = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    if (isAnnotationModeActive) {
      const result = await window.api?.lens?.stopAnnotationMode?.({
        workspaceId,
      });
      if (!result?.ok) {
        toast.error("Annotation mode failed", {
          description: result?.message ?? "Lens could not stop annotation mode.",
        });
        return;
      }
      setIsAnnotationModeActive(false);
      return;
    }

    const result = await window.api?.lens?.startAnnotationMode?.({
      workspaceId,
      options: {
        extractDebugSource: sourceMappingConfig.reactDebugSource,
      },
    });
    if (!result?.ok) {
      toast.error("Annotation mode failed", {
        description: result?.message ?? "Lens could not start annotation mode.",
      });
      return;
    }
    setIsAnnotationModeActive(true);
  }, [
    hasLensApi,
    isAnnotationModeActive,
    sourceMappingConfig.reactDebugSource,
    workspaceId,
  ]);

  const removeAnnotation = useCallback(
    async (annotationId: string) => {
      if (!workspaceId || !hasLensApi) {
        return;
      }

      const result = await window.api?.lens?.removeAnnotation?.({
        workspaceId,
        annotationId,
      });
      if (!result?.ok) {
        setAnnotations((current) =>
          current.filter((annotation) => annotation.id !== annotationId),
        );
      }
    },
    [hasLensApi, workspaceId],
  );

  const applyAnnotationStyle = useCallback(
    async (annotation: LensAnnotation, patch: Record<string, string>) => {
      if (!workspaceId || !hasLensApi || !annotation.selector) {
        return;
      }

      const result = await window.api?.lens?.setElementStyle?.({
        workspaceId,
        selector: annotation.selector,
        patch,
      });

      if (!result?.ok || !result.edits) {
        toast.error("Style edit failed", {
          description: result?.message ?? "Lens could not edit that element.",
        });
        return;
      }

      const edits: LensStyleEdit[] = result.edits;
      setAnnotations((current) =>
        current.map((candidate) => {
          if (candidate.id !== annotation.id) {
            return candidate;
          }
          return {
            ...candidate,
            computedStyles: {
              ...(candidate.computedStyles ?? {}),
              ...Object.fromEntries(
                edits.map((edit) => [edit.property, edit.after]),
              ),
            },
            styleEdits: [...(candidate.styleEdits ?? []), ...edits],
          };
        }),
      );

      toast.success("Style updated", {
        description: `${edits.length} propert${edits.length === 1 ? "y" : "ies"} changed.`,
      });
    },
    [hasLensApi, workspaceId],
  );

  const sendAnnotationsToDraft = useCallback(async () => {
    if (!activeTaskId) {
      toast.warning("Select a task first", {
        description: "Lens sends visual comments into the active task draft.",
      });
      return;
    }

    if (annotations.length === 0) {
      return;
    }

    const annotationText = formatAnnotationsForChat(
      annotations,
      sourceMappingConfig,
    );
    const currentText =
      useAppStore.getState().promptDraftByTask[activeTaskId]?.text?.trim() ??
      "";
    useAppStore.getState().updatePromptDraft({
      taskId: activeTaskId,
      patch: {
        text: currentText
          ? `${currentText}\n\n${annotationText}`
          : annotationText,
      },
    });
    useAppStore.setState((state) => ({
      promptFocusNonce: state.promptFocusNonce + 1,
    }));

    toast.success("Lens comments added", {
      description: `${annotations.length} visual comment${
        annotations.length === 1 ? "" : "s"
      } appended to the active task draft.`,
    });
  }, [activeTaskId, annotations, sourceMappingConfig]);

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
        entry.mimeType?.toLowerCase().includes(query) ||
        String(entry.status ?? "").includes(query),
    );
  }, [networkEntries, networkSearch]);

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

  const pickerDisabled = !hasLensApi || !activeTaskId || url === "about:blank";
  const lensPageActionDisabled = !hasLensApi || url === "about:blank";
  const pickerTooltip = useMemo(() => {
    if (!hasLensApi) {
      return "Lens is only available in the Electron desktop runtime.";
    }
    if (!activeTaskId) {
      return "Select a task first so Lens can append element context to its draft.";
    }
    if (url === "about:blank") {
      return "Open a page first.";
    }
    return "Pick an element and append its structure, styles, and source hints to the active task.";
  }, [activeTaskId, hasLensApi, url]);

  const statusText = lastLoadError
    ? lastLoadError
    : title
      ? title
      : hasLensApi
        ? "Open a local or deployed page, then use Pick Element to send UI context into the active task."
        : "Lens requires the Electron desktop runtime.";

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden bg-sidebar/20",
          isLensFullscreen && "fixed inset-0 h-dvh bg-background shadow-2xl",
          isLensFullscreen && UI_LAYER_CLASS.floatingChrome,
        )}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={!canGoBack || !hasLensApi}
                  onClick={goBack}
                  aria-label="Go back"
                >
                  <ArrowLeft className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={!canGoForward || !hasLensApi}
                  onClick={goForward}
                  aria-label="Go forward"
                >
                  <ArrowRight className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Forward</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={!hasLensApi}
                  onClick={reload}
                  aria-label={isLoading ? "Stop loading" : "Reload page"}
                >
                  {isLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLoading ? "Loading" : "Reload"}</TooltipContent>
            </Tooltip>

            <form onSubmit={handleSubmit} className="min-w-0 flex-1">
              <InputGroup className="h-8 bg-background/80">
                <InputGroupAddon align="inline-start" className="gap-1.5 pl-2 text-xs text-muted-foreground">
                  <Globe className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  ref={urlInputRef}
                  type="text"
                  value={inputUrl}
                  onChange={(event) => setInputUrl(event.target.value)}
                  onKeyDown={handleUrlKeyDown}
                  onFocus={(event) => {
                    isUrlInputFocused.current = true;
                    event.target.select();
                  }}
                  onBlur={() => {
                    isUrlInputFocused.current = false;
                    // Discard any uncommitted edit and restore the current page URL.
                    setInputUrl(url === "about:blank" ? "" : url);
                  }}
                  placeholder={hasLensApi ? "http://localhost:3000 or https://example.com" : "Lens is unavailable in browser-only mode"}
                  className="text-xs"
                  disabled={!hasLensApi}
                />
                {inputUrl ? (
                  <InputGroupAddon align="inline-end" className="pr-1">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="Clear address"
                      onClick={() => setInputUrl("")}
                    >
                      <X className="size-3" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </form>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  disabled={pickerDisabled || isPickerActive}
                  onClick={() => {
                    void startElementPicker();
                  }}
                  aria-label="Pick element"
                >
                  {isPickerActive ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Crosshair className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-pretty">
                {pickerTooltip}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={isAnnotationModeActive ? "secondary" : "outline"}
                  disabled={lensPageActionDisabled}
                  onClick={() => {
                    void toggleAnnotationMode();
                  }}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Highlighter className="size-3.5" />
                  <span>Annotate</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Visual comments</TooltipContent>
            </Tooltip>

            <DropdownMenu onOpenChange={setIsLensFloatingSurfaceOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={lensPageActionDisabled}
                      aria-label="Save screenshot"
                      className="h-7 gap-0.5 px-1.5"
                    >
                      <Camera className="size-3.5" />
                      <ChevronDown className="size-2.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Screenshot</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onSelect={() => {
                    void saveScreenshot(false);
                  }}
                >
                  Viewport
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void saveScreenshot(true);
                  }}
                >
                  Full Page
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu onOpenChange={setIsLensFloatingSurfaceOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant={downloads.length > 0 ? "secondary" : "outline"}
                      disabled={!hasLensApi}
                      aria-label="Downloads"
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Downloads</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Downloads</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={lensPageActionDisabled}
                  onSelect={() => {
                    void downloadPageAssets();
                  }}
                >
                  Download Page Assets
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {downloads.length > 0 ? (
                  downloads
                    .slice(-5)
                    .reverse()
                    .map((entry) => (
                      <DropdownMenuItem
                        key={entry.id}
                        className="min-w-0"
                        onSelect={() => openDownloadInFinder(entry.savePath)}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {entry.filename}
                        </span>
                        <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                          {entry.state}
                        </span>
                      </DropdownMenuItem>
                    ))
                ) : (
                  <DropdownMenuItem disabled>No downloads yet</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant={isLensFullscreen ? "secondary" : "outline"}
                  disabled={!hasLensApi}
                  onClick={() => setLensFullscreen(!isLensFullscreen)}
                  aria-label={
                    isLensFullscreen
                      ? "Exit fullscreen Lens"
                      : "Open Lens fullscreen"
                  }
                >
                  {isLensFullscreen ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isLensFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
              {workspaceId ? `workspace ${workspaceId}` : "no workspace"}
            </Badge>
            <Badge
              variant={activeTaskId ? "secondary" : "outline"}
              className="h-5 rounded-md px-1.5 text-[10px] font-medium"
            >
              {activeTaskId ? "task linked" : "select task to send"}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
              {sourceMappingConfig.heuristic ? "heuristic hints on" : "heuristic hints off"}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
              {sourceMappingConfig.reactDebugSource ? "react source on" : "react source off"}
            </Badge>
          </div>
          <div className="flex min-w-0 items-center gap-1 rounded-md border border-border/60 bg-background/70 p-1">
            {[
              {
                id: "preview" as const,
                label: "Preview",
                icon: Monitor,
                count: null,
              },
              {
                id: "console" as const,
                label: "Console",
                icon: Terminal,
                count: consoleEntries.length,
              },
              {
                id: "network" as const,
                label: "Network",
                icon: Network,
                count: networkEntries.length,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = lensPanelTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  type="button"
                  size="xs"
                  variant={active ? "secondary" : "ghost"}
                  className="h-7 min-w-0 flex-1 gap-1.5 px-2 text-[11px]"
                  onClick={() => setLensPanelTab(tab.id)}
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">{tab.label}</span>
                  {tab.count !== null ? (
                    <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                      {tab.count}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>
          {annotations.length > 0 ? (
            <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium">
                  {annotations.length} comment
                  {annotations.length === 1 ? "" : "s"}
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  disabled={!activeTaskId}
                  onClick={() => {
                    void sendAnnotationsToDraft();
                  }}
                  className="h-6 gap-1 px-2 text-[11px]"
                >
                  <Send className="size-3" />
                  Send
                </Button>
              </div>
              <div className="space-y-1">
                {annotations.map((annotation) => (
                  <div
                    key={annotation.id}
                    className="flex items-start gap-2 rounded border border-border/50 bg-muted/30 px-2 py-1.5 text-xs"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {annotation.pin}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {annotation.comment}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {annotation.kind === "area"
                          ? "area"
                          : annotation.selector}
                      </div>
                    </div>
                    <AnnotationStylePopover
                      annotation={annotation}
                      disabled={!hasLensApi || annotation.kind !== "element"}
                      onOpenChange={setIsLensFloatingSurfaceOpen}
                      onApply={applyAnnotationStyle}
                    />
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove annotation ${annotation.pin}`}
                      onClick={() => {
                        void removeAnnotation(annotation.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {lensPanelTab === "preview" ? (
            <>
              <div
                ref={placeholderRef}
                className="absolute inset-0 min-h-0 overflow-hidden bg-background"
              />
              {hasLensApi && isLoading ? (
                <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border/70 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" />
                    Loading page
                  </span>
                </div>
              ) : null}
              {hasLensApi && lastLoadError ? (
                <div className="absolute inset-x-3 bottom-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm">
                  {lastLoadError}
                </div>
              ) : null}
              {hasLensApi && isOccluded ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center text-xs text-muted-foreground">
                  Lens preview is hidden while another surface is above it.
                </div>
              ) : null}
              {!hasLensApi ? (
                <div className="absolute inset-0 p-3">
                  <Empty className="h-full justify-center rounded-xl border-border/70 bg-background/70 p-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ScanSearch />
                      </EmptyMedia>
                      <EmptyTitle>Lens needs the desktop runtime</EmptyTitle>
                      <EmptyDescription>
                        The embedded browser is backed by Electron `WebContentsView`, so it is unavailable in browser-only mode.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>Use `bun run dev:desktop` or a packaged desktop build to inspect pages, capture screenshots, and send element context to a task.</p>
                      </div>
                    </EmptyContent>
                  </Empty>
                </div>
              ) : null}
            </>
          ) : lensPanelTab === "console" ? (
            <div className="flex h-full min-h-0 flex-col bg-background">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 p-2">
                <div className="relative min-w-36 flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={consoleSearch}
                    onChange={(event) => setConsoleSearch(event.target.value)}
                    placeholder="Search console"
                    className="h-7 pl-7 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1 overflow-x-auto">
                  {CONSOLE_LEVEL_FILTERS.map((level) => (
                    <Button
                      key={level}
                      type="button"
                      size="xs"
                      variant={consoleLevelFilter === level ? "secondary" : "ghost"}
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setConsoleLevelFilter(level)}
                    >
                      {level}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant={consolePaused ? "secondary" : "ghost"}
                  onClick={() => setConsolePaused((current) => !current)}
                  aria-label={consolePaused ? "Resume console log" : "Pause console log"}
                >
                  {consolePaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant={autoScrollLogs ? "secondary" : "ghost"}
                  onClick={() => setAutoScrollLogs((current) => !current)}
                  aria-label="Toggle log autoscroll"
                >
                  <ArrowDownToLine className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={filteredConsoleEntries.length === 0}
                  onClick={copyConsoleLog}
                  aria-label="Copy console log"
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={consoleEntries.length === 0}
                  onClick={() => {
                    setConsoleEntries([]);
                    setLastLoadError(null);
                  }}
                  aria-label="Clear console log"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div
                ref={consoleLogRef}
                className="min-h-0 flex-1 overflow-auto font-mono text-xs"
              >
                {filteredConsoleEntries.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {filteredConsoleEntries.map((entry, index) => (
                      <div
                        key={`${entry.timestamp}-${index}`}
                        className="grid grid-cols-[4.5rem_4.25rem_minmax(0,1fr)] gap-2 px-3 py-2"
                      >
                        <span className="text-[11px] text-muted-foreground">
                          {formatLogTime(entry.timestamp)}
                        </span>
                        <span
                          className={cn(
                            "h-5 rounded border px-1.5 text-center text-[10px] uppercase leading-5",
                            getConsoleLevelClass(entry.level),
                          )}
                        >
                          {entry.level}
                        </span>
                        <div className="min-w-0">
                          <div className="whitespace-pre-wrap break-words text-foreground">
                            {entry.text}
                          </div>
                          {entry.source ? (
                            <div className="mt-1 truncate text-[10px] text-muted-foreground">
                              {entry.source}
                              {entry.lineNumber ? `:${entry.lineNumber}` : ""}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
                    No console entries.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col bg-background">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 p-2">
                <div className="relative min-w-40 flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={networkSearch}
                    onChange={(event) => setNetworkSearch(event.target.value)}
                    placeholder="Search network"
                    className="h-7 pl-7 text-xs"
                  />
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant={networkPaused ? "secondary" : "ghost"}
                  onClick={() => setNetworkPaused((current) => !current)}
                  aria-label={networkPaused ? "Resume network log" : "Pause network log"}
                >
                  {networkPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant={autoScrollLogs ? "secondary" : "ghost"}
                  onClick={() => setAutoScrollLogs((current) => !current)}
                  aria-label="Toggle log autoscroll"
                >
                  <ArrowDownToLine className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={filteredNetworkEntries.length === 0}
                  onClick={copyNetworkLog}
                  aria-label="Copy network log"
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={networkEntries.length === 0}
                  onClick={() => setNetworkEntries([])}
                  aria-label="Clear network log"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div
                ref={networkLogRef}
                className="min-h-0 flex-1 overflow-auto text-xs"
              >
                {filteredNetworkEntries.length > 0 ? (
                  <div className="min-w-[560px]">
                    <div className="grid grid-cols-[4.5rem_4rem_4rem_minmax(8rem,1fr)_6rem_4.5rem] gap-2 border-b border-border/60 px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
                      <span>Time</span>
                      <span>Method</span>
                      <span>Status</span>
                      <span>URL</span>
                      <span>Type</span>
                      <span>Size</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {filteredNetworkEntries.map((entry) => (
                        <div
                          key={entry.requestId}
                          className="grid grid-cols-[4.5rem_4rem_4rem_minmax(8rem,1fr)_6rem_4.5rem] gap-2 px-3 py-2"
                        >
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatLogTime(entry.timestamp)}
                          </span>
                          <span className="font-mono text-[11px] font-medium">
                            {entry.method}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-[11px] font-semibold",
                              getNetworkStatusClass(entry.status),
                            )}
                          >
                            {entry.status ?? "ERR"}
                          </span>
                          <span className="truncate font-mono text-[11px]">
                            {entry.url}
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {entry.mimeType ?? "-"}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatBytes(entry.responseSize)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
                    No network entries.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5">
          <div className="min-w-0 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 truncate">
              {isLoading ? <Loader2 className="size-3 animate-spin" /> : null}
              {statusText}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <ExternalLink className="size-3" />
            <span>{url === "about:blank" ? "ready" : "live"}</span>
          </div>
        </div>
      </div>
      <Dialog
        open={cdpApprovalRequest !== null}
        onOpenChange={(open) => {
          if (!open) {
            void respondToCdpApproval(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-muted">
                <ShieldAlert className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <DialogTitle>Allow Lens CDP access?</DialogTitle>
                <DialogDescription className="mt-1">
                  Full CDP access lets agents inspect and control this site.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">
                Host
              </div>
              <div className="truncate font-mono text-xs">
                {cdpApprovalRequest?.host ?? ""}
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Approving remembers this host in Settings &gt; Lens &gt; Developer Mode.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void respondToCdpApproval(false);
              }}
            >
              Deny
            </Button>
            <Button
              type="button"
              onClick={() => {
                void respondToCdpApproval(true);
              }}
            >
              Approve and Remember
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
