import type { IDockviewPanelProps } from "dockview-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDownToLine,
  Camera,
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  Download,
  Globe,
  Highlighter,
  Loader2,
  Monitor,
  Network,
  PanelRightOpen,
  Pause,
  Play,
  RotateCw,
  Ruler,
  ScanSearch,
  Search,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import { formatElementForChat } from "@/lib/lens/lens-element-message";
import { LensDiagnosticsStateRevision } from "@/lib/lens/lens-diagnostics-state";
import {
  getLensCommentImageId,
  isLensCommentImageAttachment,
  upsertLensAnnotationsAttachment,
} from "@/lib/lens/lens-annotation-attachment";
import { hasLensOccludingFloatingSurface } from "@/lib/lens/lens-occlusion";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  DEFAULT_LENS_SESSION_ID,
  type BrowserConsoleArgument,
  type BrowserConsoleEntry,
  type BrowserConsoleEntryDetail,
  type BrowserConsoleEventPayload,
  type BrowserConsoleObjectProperties,
  type BrowserConsoleObjectProperty,
  type BrowserNetworkBody,
  type BrowserNetworkEntry,
  type BrowserNetworkEntryDetail,
  type BrowserNetworkEventPayload,
  type BrowserNetworkTiming,
  type BrowserStackTrace,
  type LensAnnotation,
  type LensAnnotationEventPayload,
  type LensDiagnosticsCaptureState,
  type BrowserNavigationEventPayload,
  type BrowserNavigationState,
  type ElementPickerResult,
  type LensBounds,
  type LensDownloadEntry,
  type LensDownloadEventPayload,
  type LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import {
  formatLensNetworkBytes,
  formatLensNetworkStatus,
} from "@/lib/lens/lens-network";
import { parsePanePanelId } from "@/lib/panes/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { isEditableShortcutTarget } from "@/components/layout/app-shell.shortcuts";
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  isVisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";

const DEFAULT_NAVIGATION_STATE: BrowserNavigationState = {
  url: "about:blank",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
};

const LENS_LOG_LIMIT = 200;
const LENS_TOOL_ACTIVE_CLASS =
  "border-primary/50 bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary dark:bg-primary/15";
const LENS_TOOL_INACTIVE_CLASS = "text-muted-foreground hover:text-foreground";
const LENS_TOOL_ICON_CLASS = "size-4";
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

/**
 * Lens sessions whose surface panel is currently visible. Workspace-level
 * events that carry no lensSessionId (visual-comment shortcut relayed while
 * the page has focus) are fielded by exactly one mounted panel picked
 * deterministically from this registry / the store.
 */
const visibleLensSessionIds = new Set<string>();

function appendLimited<T>(entries: T[], entry: T): T[] {
  return [...entries, entry].slice(-LENS_LOG_LIMIT);
}

function upsertConsoleEntriesLimited(
  entries: BrowserConsoleEntry[],
  incoming: BrowserConsoleEntry[],
): BrowserConsoleEntry[] {
  const byEntryId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    byEntryId.set(entry.id, entry);
  }
  return [...byEntryId.values()].slice(-LENS_LOG_LIMIT);
}

function upsertNetworkEntriesLimited(
  entries: BrowserNetworkEntry[],
  incoming: BrowserNetworkEntry[],
): BrowserNetworkEntry[] {
  const byEntryId = new Map(entries.map((entry) => [entry.entryId, entry]));
  for (const entry of incoming) {
    byEntryId.set(entry.entryId, entry);
  }
  return [...byEntryId.values()].slice(-LENS_LOG_LIMIT);
}

function matchesSession(
  payload: { workspaceId: string; lensSessionId?: string },
  workspaceId: string,
  lensSessionId: string,
): boolean {
  return (
    payload.workspaceId === workspaceId &&
    (payload.lensSessionId ?? DEFAULT_LENS_SESSION_ID) === lensSessionId
  );
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

function formatDuration(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "-";
  }
  if (value < 1) {
    return "<1 ms";
  }
  if (value < 1_000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1_000).toFixed(2)} s`;
}

function formatNetworkHeaders(
  headers: BrowserNetworkEntry["requestHeaders"],
): string {
  if (!headers || Object.keys(headers).length === 0) {
    return "No captured headers.";
  }
  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, values]) => values.map((value) => `${name}: ${value}`))
    .join("\n");
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

function getNetworkStatusClass(entry: BrowserNetworkEntry) {
  if (entry.state === "pending") {
    return "text-muted-foreground";
  }
  if (entry.state === "failed") {
    return "text-destructive";
  }
  const status = entry.status;
  if (!status) {
    return "text-muted-foreground";
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

function formatNetworkRowStatus(entry: BrowserNetworkEntry): string {
  if (entry.state === "pending") {
    return "Pending";
  }
  if (entry.state === "failed") {
    return entry.status ? String(entry.status) : "Failed";
  }
  return entry.status ? String(entry.status) : "Done";
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
      const type = entry.resourceType ?? entry.mimeType ?? "-";
      const duration = formatDuration(entry.durationMs);
      const error = entry.error ? ` ${entry.error}` : "";
      return `[${entry.timestamp}] ${entry.method} ${status} ${type} ${duration} ${entry.url}${error}`;
    })
    .join("\n");
}

function formatNetworkEntryDetails(entry: BrowserNetworkEntry): string {
  return [
    `Request URL: ${entry.url}`,
    `Method: ${entry.method}`,
    `Status: ${formatLensNetworkStatus(entry)}`,
    `Resource type: ${entry.resourceType ?? "-"}`,
    `MIME type: ${entry.mimeType ?? "-"}`,
    `Started: ${entry.startedAt ?? "-"}`,
    `Completed: ${entry.timestamp}`,
    `Duration: ${formatDuration(entry.durationMs)}`,
    `Transferred: ${formatLensNetworkBytes(entry.responseSize)}`,
    `Cache: ${entry.fromCache ? "Yes" : "No"}`,
    entry.referrer ? `Referrer: ${entry.referrer}` : "",
    entry.error ? `Failure: ${entry.error}` : "",
    "",
    "Request headers",
    formatNetworkHeaders(entry.requestHeaders),
    "",
    "Response headers",
    formatNetworkHeaders(entry.responseHeaders),
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n");
}

type LensLogDetailTab = {
  id: string;
  label: string;
  content: ReactNode;
};

function LensLogDetailBlock(props: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {props.label}
      </div>
      <div className="mt-1 rounded-md border border-border/70 bg-background/75 p-2 font-mono text-[11px] leading-relaxed text-foreground">
        {props.children}
      </div>
    </div>
  );
}

type ConsoleInspectableValue =
  BrowserConsoleArgument | BrowserConsoleObjectProperty;

function formatConsoleInspectableValue(value: ConsoleInspectableValue): string {
  if ("description" in value && value.description) {
    return value.description;
  }
  if ("unserializableValue" in value && value.unserializableValue) {
    return value.unserializableValue;
  }
  if (value.value !== undefined) {
    return typeof value.value === "string"
      ? value.value
      : JSON.stringify(value.value);
  }
  if (value.preview?.description) {
    return value.preview.description;
  }
  return value.subtype ?? value.type;
}

function ConsoleInspectableRow(props: {
  entryId: string;
  label: string;
  value: ConsoleInspectableValue;
  depth?: number;
  loadProperties: (
    objectHandle: string,
  ) => Promise<BrowserConsoleObjectProperties>;
}) {
  const { entryId, label, value, depth = 0, loadProperties } = props;
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] =
    useState<BrowserConsoleObjectProperties | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canExpand = Boolean(value.objectHandle) && depth < 2;
  const preview = value.preview;

  const toggleExpanded = useCallback(async () => {
    if (!canExpand || !value.objectHandle) {
      return;
    }
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (!nextExpanded || properties || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadProperties(value.objectHandle);
      setProperties(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Object properties are unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    canExpand,
    expanded,
    loadProperties,
    loading,
    properties,
    value.objectHandle,
  ]);

  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-background/70",
        depth > 0 && "ml-4",
      )}
      data-console-entry-id={entryId}
    >
      <div className="flex min-w-0 items-start gap-1.5 px-2 py-1.5">
        {canExpand ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="mt-[-2px] size-6 shrink-0"
            onClick={() => void toggleExpanded()}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
            aria-expanded={expanded}
          >
            {loading ? (
              <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
            ) : (
              <ChevronRight
                className={cn(
                  "size-3 transition-transform duration-150 motion-reduce:transition-none",
                  expanded && "rotate-90",
                )}
              />
            )}
          </Button>
        ) : (
          <span className="block size-6 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[11px]">
            <span className="shrink-0 text-primary">{label}</span>
            <span className="break-all text-foreground">
              {formatConsoleInspectableValue(value)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {value.subtype ?? value.type}
            </span>
          </div>
          {!expanded && preview?.properties.length ? (
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
              {preview.properties
                .slice(0, 4)
                .map(
                  (property) =>
                    `${property.name}: ${formatConsoleInspectableValue(property)}`,
                )
                .join(", ")}
              {preview.overflow || preview.properties.length > 4 ? ", …" : ""}
            </p>
          ) : null}
        </div>
      </div>
      {expanded ? (
        <div className="space-y-1 border-t border-border/60 p-1.5">
          {error ? (
            <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              {error}
            </div>
          ) : properties?.properties.length ? (
            <>
              {properties.properties.map((property, index) => (
                <ConsoleInspectableRow
                  key={`${property.name}-${property.objectHandle ?? index}`}
                  entryId={entryId}
                  label={property.name}
                  value={property}
                  depth={depth + 1}
                  loadProperties={loadProperties}
                />
              ))}
              {properties.overflow ? (
                <p className="px-2 py-1 text-[10px] text-muted-foreground">
                  Additional properties were omitted by the capture limit.
                </p>
              ) : null}
            </>
          ) : loading ? (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">
              Loading properties…
            </p>
          ) : (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">
              No enumerable properties.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function flattenStackTrace(stackTrace: BrowserStackTrace | undefined): Array<{
  frame: BrowserStackTrace["callFrames"][number];
  depth: number;
  description?: string;
}> {
  const frames: Array<{
    frame: BrowserStackTrace["callFrames"][number];
    depth: number;
    description?: string;
  }> = [];
  let current = stackTrace;
  let depth = 0;
  while (current) {
    for (const frame of current.callFrames) {
      frames.push({ frame, depth, description: current.description });
    }
    current = current.parent;
    depth += 1;
  }
  return frames;
}

function DetailLoadState(props: {
  loading: boolean;
  error: string | null;
  empty: string;
}) {
  if (props.loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
        Loading diagnostic detail…
      </div>
    );
  }
  if (props.error) {
    return (
      <div className="rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
        {props.error}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border/70 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
      {props.empty}
    </div>
  );
}

function formatNetworkBodyContent(body: BrowserNetworkBody): string {
  if (!body.content) {
    return "";
  }
  if (body.kind !== "json") {
    return body.content;
  }
  try {
    return JSON.stringify(JSON.parse(body.content), null, 2);
  } catch {
    return body.content;
  }
}

function NetworkBodyView(props: {
  label: string;
  loading: boolean;
  error: string | null;
  body: BrowserNetworkBody | null;
  metadata?: Omit<BrowserNetworkBody, "content">;
  available: boolean;
}) {
  const { label, loading, error, body, metadata, available } = props;
  if (loading) {
    return (
      <DetailLoadState
        loading
        error={null}
        empty={`No ${label.toLowerCase()} body.`}
      />
    );
  }
  if (error) {
    return <DetailLoadState loading={false} error={error} empty="" />;
  }
  if (!available && !metadata) {
    return (
      <DetailLoadState
        loading={false}
        error={null}
        empty={`No ${label.toLowerCase()} body was captured.`}
      />
    );
  }
  const resolved = body ?? metadata;
  if (!resolved || resolved.kind === "unavailable") {
    return (
      <DetailLoadState
        loading={false}
        error={null}
        empty={
          resolved?.unavailableReason ??
          `${label} body is unavailable for this request.`
        }
      />
    );
  }

  const content = body ? formatNetworkBodyContent(body) : "";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium uppercase">
          {resolved.kind}
        </span>
        {resolved.mimeType ? <span>{resolved.mimeType}</span> : null}
        <span>
          {formatLensNetworkBytes(resolved.capturedBytes)}
          {resolved.size && resolved.size !== resolved.capturedBytes
            ? ` of ${formatLensNetworkBytes(resolved.size)}`
            : ""}
        </span>
        {resolved.redacted ? (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
            Sensitive fields redacted
          </span>
        ) : null}
        {resolved.truncated ? (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
            Truncated
          </span>
        ) : null}
      </div>
      {resolved.kind === "binary" ? (
        <DetailLoadState
          loading={false}
          error={null}
          empty="Binary content is represented by capture metadata only."
        />
      ) : content ? (
        <LensLogDetailBlock label={label}>
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-all">
            {content}
          </pre>
        </LensLogDetailBlock>
      ) : (
        <DetailLoadState
          loading={false}
          error={null}
          empty={`${label} body metadata was captured, but no displayable content is available.`}
        />
      )}
    </div>
  );
}

type NetworkTimingPhase = {
  label: string;
  start: number;
  end: number;
};

function getNetworkTimingPhases(
  timing: BrowserNetworkTiming | undefined,
  durationMs: number | undefined,
): NetworkTimingPhase[] {
  if (!timing) {
    return [];
  }
  const phases: Array<[string, number | undefined, number | undefined]> = [
    ["Proxy", timing.proxyStart, timing.proxyEnd],
    ["DNS", timing.dnsStart, timing.dnsEnd],
    ["Connect", timing.connectStart, timing.connectEnd],
    ["SSL", timing.sslStart, timing.sslEnd],
    ["Worker", timing.workerStart, timing.workerRespondWithSettled],
    ["Send", timing.sendStart, timing.sendEnd],
    ["Waiting", timing.sendEnd, timing.receiveHeadersStart],
    ["Headers", timing.receiveHeadersStart, timing.receiveHeadersEnd],
  ];
  const total =
    typeof durationMs === "number" && Number.isFinite(durationMs)
      ? durationMs
      : undefined;
  if (
    total !== undefined &&
    timing.receiveHeadersEnd !== undefined &&
    timing.receiveHeadersEnd >= 0 &&
    total >= timing.receiveHeadersEnd
  ) {
    phases.push(["Download", timing.receiveHeadersEnd, total]);
  }
  return phases.flatMap(([label, start, end]) =>
    start !== undefined && end !== undefined && start >= 0 && end >= start
      ? [{ label, start, end }]
      : [],
  );
}

function NetworkTimingView(props: {
  timing: BrowserNetworkTiming | undefined;
  durationMs: number | undefined;
}) {
  const phases = getNetworkTimingPhases(props.timing, props.durationMs);
  if (!props.timing) {
    return (
      <DetailLoadState
        loading={false}
        error={null}
        empty="Timing phases are unavailable for this request."
      />
    );
  }
  const maxEnd = Math.max(
    props.durationMs ?? 0,
    ...phases.map((phase) => phase.end),
    1,
  );
  return (
    <div className="space-y-3">
      <LensLogDetailBlock label="Raw timestamps">
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Request monotonic</dt>
          <dd>{props.timing.requestTimestamp}</dd>
          <dt className="text-muted-foreground">Wall time</dt>
          <dd>{props.timing.wallTime ?? "-"}</dd>
          <dt className="text-muted-foreground">Response monotonic</dt>
          <dd>{props.timing.responseTimestamp ?? "-"}</dd>
          <dt className="text-muted-foreground">Finished monotonic</dt>
          <dd>{props.timing.finishedTimestamp ?? "-"}</dd>
        </dl>
      </LensLogDetailBlock>
      {phases.length ? (
        <div className="overflow-hidden rounded-md border border-border/70 bg-background/70">
          <div className="grid grid-cols-[4.5rem_3.5rem_3.5rem_minmax(7rem,1fr)] gap-2 border-b border-border/60 px-2 py-1.5 text-[10px] font-medium uppercase text-muted-foreground">
            <span>Phase</span>
            <span>Start</span>
            <span>Time</span>
            <span>Waterfall</span>
          </div>
          {phases.map((phase) => {
            const duration = phase.end - phase.start;
            return (
              <div
                key={phase.label}
                className="grid grid-cols-[4.5rem_3.5rem_3.5rem_minmax(7rem,1fr)] items-center gap-2 border-b border-border/50 px-2 py-1.5 text-[10px] last:border-b-0"
              >
                <span className="font-medium text-foreground">
                  {phase.label}
                </span>
                <span className="font-mono text-muted-foreground">
                  {formatDuration(phase.start)}
                </span>
                <span className="font-mono text-muted-foreground">
                  {formatDuration(duration)}
                </span>
                <span className="relative h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className="absolute inset-y-0 rounded-full bg-primary/70"
                    style={{
                      left: `${Math.min(100, (phase.start / maxEnd) * 100)}%`,
                      width: `${Math.max(2, (duration / maxEnd) * 100)}%`,
                    }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <DetailLoadState
          loading={false}
          error={null}
          empty="Chromium did not report any request phases."
        />
      )}
    </div>
  );
}

function NetworkWaterfallCell(props: {
  entry: BrowserNetworkEntry;
  maxDurationMs: number;
}) {
  const duration = props.entry.durationMs ?? 0;
  const width =
    props.entry.state === "pending"
      ? 28
      : Math.max(3, Math.min(100, (duration / props.maxDurationMs) * 100));
  return (
    <span
      className="relative h-1.5 overflow-hidden rounded-full bg-muted"
      aria-label={
        props.entry.state === "pending"
          ? "Request pending"
          : `Request duration ${formatDuration(props.entry.durationMs)}`
      }
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          props.entry.state === "failed"
            ? "bg-destructive/75"
            : "bg-primary/70",
          props.entry.state === "pending" &&
            "animate-pulse motion-reduce:animate-none",
        )}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

function LensDiagnosticsCaptureControls(props: {
  state: LensDiagnosticsCaptureState | null;
  busy: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { state, busy, disabled, onChange } = props;
  const enabled = Boolean(state?.enabled);
  return (
    <div
      className="flex min-w-0 items-center gap-1"
      aria-live="polite"
      title={state?.message}
    >
      {enabled ? (
        <>
          <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-[10px] font-medium text-success">
            <span className="size-1.5 shrink-0 rounded-full bg-success" />
            <span className="truncate">
              Full capture · {state?.host ?? "current host"}
            </span>
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            disabled={disabled || busy}
            onClick={() => onChange(false)}
            aria-label="Stop full diagnostics capture"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Square className="size-3 fill-current" />
            )}
            Stop
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          disabled={disabled || busy}
          onClick={() => onChange(true)}
          aria-label="Enable full diagnostics capture for the current host"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Crosshair className="size-3.5" />
          )}
          Full capture
        </Button>
      )}
    </div>
  );
}

function LensLogEntryDetail(props: {
  ariaLabel: string;
  testId: string;
  fields: Array<{ label: string; value: string }>;
  tabs: LensLogDetailTab[];
  activeTabId: string;
  onActiveTabChange: (tabId: string) => void;
  onClose: () => void;
  onCopy: () => void;
}) {
  const {
    ariaLabel,
    testId,
    fields,
    tabs,
    activeTabId,
    onActiveTabChange,
    onClose,
    onCopy,
  } = props;
  const activeTab =
    tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

  const moveTabFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) {
      return;
    }
    onActiveTabChange(nextTab.id);
    document.getElementById(`${testId}-${nextTab.id}-tab`)?.focus();
  };

  return (
    <section
      id={testId}
      aria-label={ariaLabel}
      data-testid={testId}
      data-lens-inspector-placement="right"
      className="order-last h-full min-h-0 w-[min(38%,34rem)] min-w-[min(18rem,48%)] max-w-[48%] shrink-0 overflow-auto border-l border-border bg-card"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-xs font-semibold text-foreground">
            Entry details
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onCopy}
              aria-label={`Copy ${ariaLabel.toLowerCase()}`}
            >
              <Copy className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onClose}
              aria-label={`Close ${ariaLabel.toLowerCase()}`}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
        <div
          role="tablist"
          aria-label={`${ariaLabel} sections`}
          className="flex min-w-0 items-center gap-1 overflow-x-auto px-2"
        >
          {tabs.map((tab, index) => {
            const selected = tab.id === activeTab?.id;
            return (
              <button
                key={tab.id}
                id={`${testId}-${tab.id}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${testId}-${tab.id}-panel`}
                tabIndex={selected ? 0 : -1}
                className={cn(
                  "relative h-8 shrink-0 px-2 text-[11px] font-medium text-muted-foreground outline-none transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-px after:scale-x-0 after:bg-primary after:transition-transform hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "text-foreground after:scale-x-100",
                )}
                onClick={() => onActiveTabChange(tab.id)}
                onKeyDown={(event) => moveTabFocus(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-3 p-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {field.label}
              </dt>
              <dd className="mt-0.5 break-words font-mono text-[11px] text-foreground">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
        {activeTab ? (
          <div
            id={`${testId}-${activeTab.id}-panel`}
            role="tabpanel"
            aria-labelledby={`${testId}-${activeTab.id}-tab`}
            tabIndex={0}
            className="space-y-3 outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            {activeTab.content}
          </div>
        ) : null}
      </div>
    </section>
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
  return [...annotations, annotation].sort(
    (left, right) => left.pin - right.pin,
  );
}

/**
 * Dockview panel wrapper for one lens (embedded browser) session. The panel
 * id encodes the lensSessionId; every `window.api.lens.*` call below is
 * scoped to that session so multiple lens tabs can coexist (and even be
 * visible simultaneously in separate groups).
 */
export function LensSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  if (surface?.kind !== "lens") {
    return null;
  }
  return (
    <LensSessionSurface
      key={surface.lensSessionId}
      lensSessionId={surface.lensSessionId}
      panelApi={props.api}
    />
  );
}

function LensSessionSurface(args: {
  lensSessionId: string;
  panelApi: IDockviewPanelProps["api"];
}) {
  const { lensSessionId, panelApi } = args;
  // Keep the store subscription primitive-only. Returning a nested object here
  // causes a fresh selector snapshot on every render, which can trigger React
  // 19 ref/update loops on tooltip-heavy surfaces like Lens.
  const [
    workspaceId,
    projectPath,
    activeTaskId,
    lensSourceMappingHeuristic,
    lensSourceMappingReactDebugSource,
    lensSessionScope,
    visualCommentShortcut,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.projectPath,
          state.activeTaskId,
          state.settings.lensSourceMappingHeuristic,
          state.settings.lensSourceMappingReactDebugSource,
          state.settings.lensSessionScope,
          state.settings.visualCommentShortcut,
        ] as const,
    ),
  );
  // Whether this session's tab still exists in the store. It flips to false
  // when the tab is closed (possibly via a path that bypassed
  // `closePaneSurface`), which is the cue to tear down the backing session.
  const isTabOpen = useAppStore(
    useCallback(
      (state) => state.lensTabs.some((tab) => tab.id === lensSessionId),
      [lensSessionId],
    ),
  );

  const sourceMappingConfig = useMemo(
    () =>
      ({
        heuristic: lensSourceMappingHeuristic,
        reactDebugSource: lensSourceMappingReactDebugSource,
      }) satisfies LensSourceMappingConfig,
    [lensSourceMappingHeuristic, lensSourceMappingReactDebugSource],
  );

  const hasLensApi = Boolean(window.api?.lens);

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

  // Dockview panel visibility drives per-session WebContentsView visibility:
  // a hidden tab keeps its DOM (renderer "always") and its session alive but
  // must release the native view's screen real estate.
  const [isPanelVisible, setIsPanelVisible] = useState(
    () => panelApi.isVisible,
  );
  const isPanelActiveRef = useRef(panelApi.isActive);

  useEffect(() => {
    setIsPanelVisible(panelApi.isVisible);
    isPanelActiveRef.current = panelApi.isActive;
    const visibilityDisposable = panelApi.onDidVisibilityChange((event) => {
      setIsPanelVisible(event.isVisible);
    });
    const activeDisposable = panelApi.onDidActiveChange((event) => {
      isPanelActiveRef.current = event.isActive;
    });
    return () => {
      visibilityDisposable.dispose();
      activeDisposable.dispose();
    };
  }, [panelApi]);

  useEffect(() => {
    if (isPanelVisible) {
      visibleLensSessionIds.add(lensSessionId);
    } else {
      visibleLensSessionIds.delete(lensSessionId);
    }
    return () => {
      visibleLensSessionIds.delete(lensSessionId);
    };
  }, [isPanelVisible, lensSessionId]);

  const [url, setUrl] = useState(DEFAULT_NAVIGATION_STATE.url);
  const [inputUrl, setInputUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [downloads, setDownloads] = useState<LensDownloadEntry[]>([]);
  const [annotations, setAnnotations] = useState<LensAnnotation[]>([]);
  const [isAnnotationModeActive, setIsAnnotationModeActive] = useState(false);
  const [isBoxInspectActive, setIsBoxInspectActive] = useState(false);
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
  const [lastLoadError, setLastLoadError] = useState<string | null>(null);
  const [hasExternalFloatingSurface, setHasExternalFloatingSurface] =
    useState(false);
  const consoleLogRef = useRef<HTMLDivElement>(null);
  const networkLogRef = useRef<HTMLDivElement>(null);
  const isLensSuppressed =
    !isPanelVisible ||
    isLensFloatingSurfaceOpen ||
    hasExternalFloatingSurface ||
    lensPanelTab !== "preview";
  const isLensSuppressedRef = useRef(isLensSuppressed);
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
  isLensSuppressedRef.current = isLensSuppressed;
  consolePausedRef.current = consolePaused;
  networkPausedRef.current = networkPaused;
  networkBodyStateRef.current = networkBodyState;

  useEffect(() => {
    if (!isPanelVisible || lensPanelTab !== "preview") {
      setHasExternalFloatingSurface(false);
      return;
    }
    if (typeof document === "undefined" || !document.body) {
      return;
    }

    let frame = 0;
    const sync = () => {
      frame = 0;
      const next = hasLensOccludingFloatingSurface(
        document,
        placeholderRef.current?.getBoundingClientRect() ?? null,
      );
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

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleSync);
    const placeholder = placeholderRef.current;
    if (placeholder) {
      resizeObserver?.observe(placeholder);
    }
    window.addEventListener("resize", scheduleSync);

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSync);
    };
  }, [isPanelVisible, lensPanelTab, workspaceId]);

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
      lensSessionId,
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
  }, [hasLensApi, lensSessionId, workspaceId]);

  const syncBounds = useCallback(
    (options?: { immediate?: boolean }) => {
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

        // Keep the measured CSS-pixel rectangle intact. The main process
        // converts its scaled edges inward so the native view cannot overlap
        // Dockview's renderer-owned resize sash by a rounding pixel.
        pendingBoundsRef.current = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
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
    },
    [flushPendingBounds, hasLensApi, workspaceId],
  );

  useLayoutEffect(() => {
    if (!workspaceId || !hasLensApi || isLensSuppressed) {
      return;
    }

    syncBounds({ immediate: true });
  }, [
    annotations.length,
    hasLensApi,
    isAnnotationModeActive,
    isLensSuppressed,
    isPanelVisible,
    syncBounds,
    workspaceId,
  ]);

  // Session lifecycle. Opening is idempotent (`openSession` reuses a live
  // session, so re-showing a hidden tab or remounting the panel restores the
  // same page). The cleanup only hides the native view; the session itself is
  // destroyed exclusively when its tab has been removed from the store.
  useEffect(() => {
    pendingBoundsRef.current = null;
    lastSentBoundsRef.current = null;
    boundsRequestInFlightRef.current = false;
    isViewReadyRef.current = false;
    setAnnotations([]);
    setIsAnnotationModeActive(false);
    setIsBoxInspectActive(false);
    setConsoleEntries([]);
    setNetworkEntries([]);
    setSelectedConsoleEntryId(null);
    setSelectedNetworkEntryId(null);
    setConsoleDetailsOpen(false);
    setNetworkDetailsOpen(false);
    consolePausedRef.current = false;
    networkPausedRef.current = false;
    consolePausedBufferRef.current = [];
    networkPausedBufferRef.current = [];
    setConsolePaused(false);
    setNetworkPaused(false);
    setConsoleBufferedCount(0);
    setNetworkBufferedCount(0);
    setLastLoadError(null);
    setLensPanelTab("preview");

    applyNavigationState(DEFAULT_NAVIGATION_STATE);

    if (!workspaceId || !isTabOpen || !hasLensApi) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const lensApi = window.api?.lens;
      const openResult = lensApi?.openSession
        ? await lensApi.openSession({
            workspaceId,
            lensSessionId,
            sessionScope: lensSessionScope,
            projectKey: projectPath,
          })
        : await lensApi?.createView?.({
            workspaceId,
            lensSessionId,
            sessionScope: lensSessionScope,
            projectKey: projectPath,
          });
      if (cancelled || !openResult?.ok) {
        if (!cancelled && openResult && !openResult.ok) {
          toast.error("Lens failed to start", {
            description:
              openResult.message ??
              "Could not create the embedded browser view.",
          });
        }
        return;
      }

      isViewReadyRef.current = true;
      await lensApi?.setVisible?.({
        workspaceId,
        lensSessionId,
        visible: !isLensSuppressedRef.current,
      });

      const stateResult = await lensApi?.getState?.({
        workspaceId,
        lensSessionId,
      });
      if (!cancelled && stateResult?.ok && stateResult.state) {
        applyNavigationState(stateResult.state);
        setIsAnnotationModeActive(Boolean(stateResult.annotationModeActive));
        setIsBoxInspectActive(Boolean(stateResult.boxInspectModeActive));
      }

      const annotationsResult = await lensApi?.getAnnotations?.({
        workspaceId,
        lensSessionId,
      });
      if (!cancelled && annotationsResult?.ok) {
        setAnnotations(annotationsResult.annotations ?? []);
      }

      if (isLensSuppressedRef.current) {
        await lensApi?.setBounds?.({
          workspaceId,
          lensSessionId,
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
        lensSessionId,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      });
      void window.api?.lens?.setVisible?.({
        workspaceId,
        lensSessionId,
        visible: false,
      });
      // Hidden ≠ closed: the session survives unmounts (workspace switches,
      // layout churn). Destroy it only when its tab is gone from the SAME
      // workspace — this also covers close paths that bypassed
      // `closePaneSurface` (Dockview-initiated removal, ⌘W in AppShell).
      const store = useAppStore.getState();
      if (
        store.activeWorkspaceId === workspaceId &&
        !store.lensTabs.some((tab) => tab.id === lensSessionId)
      ) {
        void window.api?.lens
          ?.closeSession?.({ workspaceId, lensSessionId })
          .catch(() => {
            // Best-effort teardown; the main process reaps on workspace dispose.
          });
      }
    };
  }, [
    applyNavigationState,
    hasLensApi,
    isTabOpen,
    lensSessionId,
    lensSessionScope,
    projectPath,
    syncBounds,
    workspaceId,
  ]);

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
        lensSessionId,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      });
      void window.api?.lens?.setVisible?.({
        workspaceId,
        lensSessionId,
        visible: false,
      });
      return;
    }

    void window.api?.lens?.setVisible?.({
      workspaceId,
      lensSessionId,
      visible: true,
    });
    syncBounds();
  }, [hasLensApi, isLensSuppressed, lensSessionId, syncBounds, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const unsubscribe = window.api?.lens?.subscribeNavigationEvents?.(
      (payload: BrowserNavigationEventPayload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }
        applyNavigationState(payload.state);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [applyNavigationState, hasLensApi, lensSessionId, workspaceId]);

  useEffect(() => {
    setDownloads([]);
    if (!workspaceId || !hasLensApi) {
      return;
    }

    let cancelled = false;
    void window.api?.lens
      ?.listDownloads?.({ workspaceId, lensSessionId })
      .then((result) => {
        if (!cancelled && result?.ok && result.entries) {
          setDownloads(result.entries.slice(-20));
        }
      });

    const unsubscribe = window.api?.lens?.subscribeDownloadEvents?.(
      (payload: LensDownloadEventPayload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }
        setDownloads((current) => mergeDownloadEntry(current, payload.entry));
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hasLensApi, lensSessionId, workspaceId]);

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
        if (consolePausedRef.current) {
          consolePausedBufferRef.current = appendLimited(
            consolePausedBufferRef.current,
            payload.entry,
          );
          setConsoleBufferedCount(consolePausedBufferRef.current.length);
          return;
        }
        setConsoleEntries((current) =>
          upsertConsoleEntriesLimited(current, [payload.entry]),
        );
      },
    );

    return () => {
      cancelled = true;
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
        if (networkPausedRef.current) {
          networkPausedBufferRef.current = upsertNetworkEntriesLimited(
            networkPausedBufferRef.current,
            [payload.entry],
          );
          setNetworkBufferedCount(networkPausedBufferRef.current.length);
          return;
        }
        setNetworkEntries((current) =>
          upsertNetworkEntriesLimited(current, [payload.entry]),
        );
      },
    );

    return () => {
      cancelled = true;
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
          !diagnosticsCaptureStateRevisionRef.current.isCurrent(
            requestRevision,
          )
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
          !diagnosticsCaptureStateRevisionRef.current.isCurrent(
            requestRevision,
          )
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

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const captureAnnotationScreenshot = async (annotation: LensAnnotation) => {
      if (!activeTaskId) {
        return;
      }
      const imageId = getLensCommentImageId({
        workspaceId,
        lensSessionId,
        annotationId: annotation.id,
      });
      const storeBeforeCapture = useAppStore.getState();
      const currentDraftBeforeCapture =
        storeBeforeCapture.promptDraftByTask[activeTaskId];
      if (
        currentDraftBeforeCapture?.attachments.some(
          (attachment) =>
            attachment.kind === "image" && attachment.id === imageId,
        )
      ) {
        return;
      }
      const result = await window.api?.lens?.screenshot?.({
        workspaceId,
        lensSessionId,
        options: {
          clip: {
            x: Math.max(0, Math.round(annotation.rect.x)),
            y: Math.max(0, Math.round(annotation.rect.y)),
            width: Math.max(1, Math.round(annotation.rect.width)),
            height: Math.max(1, Math.round(annotation.rect.height)),
          },
          documentId: annotation.review.page.documentId,
        },
      });
      if (
        !result?.ok ||
        !result.dataUrl ||
        result.documentId !== annotation.review.page.documentId
      ) {
        return;
      }
      const store = useAppStore.getState();
      const currentDraft = store.promptDraftByTask[activeTaskId];
      const currentAttachments = currentDraft?.attachments ?? [];
      if (
        currentAttachments.some(
          (attachment) =>
            attachment.kind === "image" && attachment.id === imageId,
        )
      ) {
        return;
      }
      store.updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          attachments: [
            ...currentAttachments,
            {
              kind: "image",
              id: imageId,
              dataUrl: result.dataUrl,
              label:
                annotation.comment.trim() || `Visual comment ${annotation.pin}`,
            },
          ],
        },
      });
    };

    const unsubscribe = window.api?.lens?.subscribeAnnotationEvents?.(
      (payload: LensAnnotationEventPayload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }

        if (payload.type === "clear") {
          setAnnotations([]);
          return;
        }
        if (
          payload.type === "remove" &&
          payload.annotation &&
          payload.documentId === payload.annotation.review.page.documentId
        ) {
          setAnnotations((current) =>
            current.filter(
              (annotation) => annotation.id !== payload.annotation?.id,
            ),
          );
          return;
        }
        if (
          (payload.type === "add" || payload.type === "update") &&
          payload.annotation &&
          payload.documentId === payload.annotation.review.page.documentId
        ) {
          setAnnotations((current) =>
            mergeAnnotationEntry(
              current.filter(
                (annotation) =>
                  annotation.review.page.documentId === payload.documentId,
              ),
              payload.annotation!,
            ),
          );
          if (payload.type === "add") {
            void captureAnnotationScreenshot(payload.annotation);
          }
        }
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [activeTaskId, hasLensApi, lensSessionId, workspaceId]);

  const navigate = useCallback(
    async (targetUrl: string) => {
      if (!workspaceId || !targetUrl.trim()) {
        return;
      }
      if (!hasLensApi) {
        toast.error("Lens is unavailable", {
          description:
            "The embedded browser only works in the Electron desktop runtime.",
        });
        return;
      }

      const result = await window.api?.lens?.navigate?.({
        workspaceId,
        lensSessionId,
        url: targetUrl.trim(),
      });

      if (result && !result.ok) {
        toast.error("Navigation failed", {
          description: result.message ?? "Lens could not load that address.",
        });
      }
    },
    [hasLensApi, lensSessionId, workspaceId],
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
      void window.api?.lens?.goBack?.({ workspaceId, lensSessionId });
    }
  }, [lensSessionId, workspaceId]);

  const goForward = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.goForward?.({ workspaceId, lensSessionId });
    }
  }, [lensSessionId, workspaceId]);

  const reload = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.reload?.({ workspaceId, lensSessionId });
    }
  }, [lensSessionId, workspaceId]);

  const startElementPicker = useCallback(async () => {
    if (isPickerActive) {
      return;
    }
    if (!workspaceId) {
      return;
    }
    if (!hasLensApi) {
      toast.error("Lens is unavailable", {
        description:
          "The embedded browser only works in the Electron desktop runtime.",
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
        lensSessionId,
        options: {
          extractDebugSource: sourceMappingConfig.reactDebugSource,
        },
      });

      if (!result?.ok) {
        toast.error("Element picker failed", {
          description:
            result?.message ?? "Lens could not start the element picker.",
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
        useAppStore.getState().promptDraftByTask[activeTaskId]?.text?.trim() ??
        "";
      useAppStore.getState().updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          text: currentText
            ? `${currentText}\n\n${selectionText}`
            : selectionText,
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
  }, [
    activeTaskId,
    hasLensApi,
    isPickerActive,
    lensSessionId,
    sourceMappingConfig,
    workspaceId,
  ]);

  const saveScreenshot = useCallback(
    async (fullPage: boolean) => {
      if (!workspaceId || !hasLensApi) {
        return;
      }

      const result = await window.api?.lens?.saveScreenshot?.({
        workspaceId,
        lensSessionId,
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
    [hasLensApi, lensSessionId, workspaceId],
  );

  const downloadPageAssets = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const result = await window.api?.lens?.downloadPageAssets?.({
      workspaceId,
      lensSessionId,
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
  }, [hasLensApi, lensSessionId, workspaceId]);

  const openDownloadInFinder = useCallback((savePath: string) => {
    void window.api?.shell?.showInFinder?.({ path: savePath });
  }, []);

  const startAnnotationMode = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    if (isAnnotationModeActive) {
      return;
    }

    // Annotation and inspect overlays both capture pointer events - keep them
    // mutually exclusive so they never fight over the same hover/click.
    if (isBoxInspectActive) {
      await window.api?.lens?.stopBoxInspect?.({ workspaceId, lensSessionId });
      setIsBoxInspectActive(false);
    }

    const result = await window.api?.lens?.startAnnotationMode?.({
      workspaceId,
      lensSessionId,
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
    isBoxInspectActive,
    lensSessionId,
    sourceMappingConfig.reactDebugSource,
    workspaceId,
  ]);

  const stopAnnotationMode = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const result = await window.api?.lens?.stopAnnotationMode?.({
      workspaceId,
      lensSessionId,
    });
    if (!result?.ok) {
      toast.error("Annotation mode failed", {
        description: result?.message ?? "Lens could not stop annotation mode.",
      });
      return;
    }
    setIsAnnotationModeActive(false);
  }, [hasLensApi, lensSessionId, workspaceId]);

  const toggleAnnotationMode = useCallback(async () => {
    if (isAnnotationModeActive) {
      await stopAnnotationMode();
      return;
    }
    await startAnnotationMode();
  }, [isAnnotationModeActive, startAnnotationMode, stopAnnotationMode]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }
      if (
        !isVisualCommentShortcut({
          shortcut: visualCommentShortcut ?? DEFAULT_VISUAL_COMMENT_SHORTCUT,
          key: event.key,
          code: event.code,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          isComposing: event.isComposing,
        })
      ) {
        return;
      }
      // The shortcut is window-global while every lens panel is mounted
      // (keep-alive), so exactly one session may claim it: the active lens
      // panel if there is one, otherwise the first *visible* lens tab.
      if (!isPanelActiveRef.current) {
        const state = useAppStore.getState();
        const activePanelSessionId =
          state.activeSurface.kind === "lens"
            ? state.activeSurface.lensSessionId
            : null;
        if (activePanelSessionId) {
          if (activePanelSessionId !== lensSessionId) {
            return;
          }
        } else {
          const firstVisible = state.lensTabs.find((tab) =>
            visibleLensSessionIds.has(tab.id),
          );
          if (firstVisible?.id !== lensSessionId) {
            return;
          }
        }
      }
      event.preventDefault();
      void toggleAnnotationMode();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hasLensApi,
    lensSessionId,
    toggleAnnotationMode,
    visualCommentShortcut,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const unsubscribe =
      window.api?.lens?.subscribeVisualCommentShortcutEvents?.((payload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }
        if (
          !isVisualCommentShortcut({
            shortcut: visualCommentShortcut ?? DEFAULT_VISUAL_COMMENT_SHORTCUT,
            key: payload.key,
            code: payload.code,
            shiftKey: payload.shiftKey,
            altKey: payload.altKey,
            ctrlKey: payload.ctrlKey,
            metaKey: payload.metaKey,
            isComposing: payload.isComposing,
          })
        ) {
          return;
        }
        void toggleAnnotationMode();
      });

    return () => {
      unsubscribe?.();
    };
  }, [
    hasLensApi,
    lensSessionId,
    toggleAnnotationMode,
    visualCommentShortcut,
    workspaceId,
  ]);

  const toggleBoxInspect = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    if (isBoxInspectActive) {
      const result = await window.api?.lens?.stopBoxInspect?.({
        workspaceId,
        lensSessionId,
      });
      if (!result?.ok) {
        toast.error("Inspect mode failed", {
          description: result?.message ?? "Lens could not stop inspect mode.",
        });
        return;
      }
      setIsBoxInspectActive(false);
      return;
    }

    // Inspect and annotation overlays are mutually exclusive (see above).
    if (isAnnotationModeActive) {
      await stopAnnotationMode();
    }

    const result = await window.api?.lens?.startBoxInspect?.({
      workspaceId,
      lensSessionId,
    });
    if (!result?.ok) {
      toast.error("Inspect mode failed", {
        description: result?.message ?? "Lens could not start inspect mode.",
      });
      return;
    }
    setIsBoxInspectActive(true);
  }, [
    hasLensApi,
    isAnnotationModeActive,
    isBoxInspectActive,
    lensSessionId,
    stopAnnotationMode,
    workspaceId,
  ]);

  useEffect(() => {
    if (!activeTaskId || !workspaceId) {
      return;
    }

    const store = useAppStore.getState();
    const currentDraft = store.promptDraftByTask[activeTaskId];
    const currentAttachments = currentDraft?.attachments ?? [];
    const currentAnnotationIds = new Set(
      annotations.map((annotation) =>
        getLensCommentImageId({
          workspaceId,
          lensSessionId,
          annotationId: annotation.id,
        }),
      ),
    );
    const retainedAttachments = currentAttachments.filter((attachment) => {
      if (
        attachment.kind !== "image" ||
        !isLensCommentImageAttachment(attachment, workspaceId, lensSessionId)
      ) {
        return true;
      }
      return currentAnnotationIds.has(attachment.id);
    });
    const nextAttachments = upsertLensAnnotationsAttachment({
      attachments: retainedAttachments,
      workspaceId,
      lensSessionId,
      annotations,
      sourceMappingConfig,
    });
    if (
      JSON.stringify(currentAttachments) === JSON.stringify(nextAttachments)
    ) {
      return;
    }
    store.updatePromptDraft({
      taskId: activeTaskId,
      patch: {
        attachments: nextAttachments,
      },
    });
  }, [
    activeTaskId,
    annotations,
    lensSessionId,
    sourceMappingConfig,
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
          !diagnosticsCaptureStateRevisionRef.current.isCurrent(
            requestRevision,
          )
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
          !diagnosticsCaptureStateRevisionRef.current.isCurrent(
            requestRevision,
          )
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

  const pickerDisabled = !hasLensApi || !activeTaskId || url === "about:blank";
  const lensPageActionDisabled = !hasLensApi || url === "about:blank";
  const pickerTooltip = useMemo(() => {
    if (isPickerActive) {
      return "Pick mode is active. Click an element in the page or press Escape to cancel.";
    }
    if (!hasLensApi) {
      return "Lens is only available in the Electron desktop runtime.";
    }
    if (!activeTaskId) {
      return "Select a task first so Lens can append element context to its draft.";
    }
    if (url === "about:blank") {
      return "Open a page first.";
    }
    return "Pick an element and append a compact selector, style, and source summary to the active task.";
  }, [activeTaskId, hasLensApi, isPickerActive, url]);

  return (
    <TooltipProvider delay={120}>
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar/20"
        data-testid="lens-surface-panel"
        data-lens-session-id={lensSessionId}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className={LENS_TOOL_INACTIVE_CLASS}
                    disabled={!canGoBack || !hasLensApi}
                    onClick={goBack}
                    aria-label="Go back"
                  />
                }
              >
                <ArrowLeft className={LENS_TOOL_ICON_CLASS} />
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className={LENS_TOOL_INACTIVE_CLASS}
                    disabled={!canGoForward || !hasLensApi}
                    onClick={goForward}
                    aria-label="Go forward"
                  />
                }
              >
                <ArrowRight className={LENS_TOOL_ICON_CLASS} />
              </TooltipTrigger>
              <TooltipContent>Forward</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className={LENS_TOOL_INACTIVE_CLASS}
                    disabled={!hasLensApi}
                    onClick={reload}
                    aria-label={isLoading ? "Stop loading" : "Reload page"}
                  />
                }
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCw className={LENS_TOOL_ICON_CLASS} />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {isLoading ? "Loading" : "Reload"}
              </TooltipContent>
            </Tooltip>

            <form onSubmit={handleSubmit} className="min-w-0 flex-1">
              <InputGroup className="h-9 overflow-hidden bg-background/80 transition-[background-color,border-color,box-shadow] duration-200 focus-within:bg-background">
                <InputGroupAddon
                  align="inline-start"
                  className="gap-1.5 pl-2.5 text-sm text-muted-foreground"
                >
                  <Globe className={LENS_TOOL_ICON_CLASS} />
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
                  placeholder={
                    hasLensApi
                      ? "http://localhost:3000 or https://example.com"
                      : "Lens is unavailable in browser-only mode"
                  }
                  className="bg-transparent! text-sm focus-visible:bg-transparent!"
                  disabled={!hasLensApi}
                />
                {inputUrl ? (
                  <InputGroupAddon align="inline-end" className="pr-1">
                    <InputGroupButton
                      size="icon-sm"
                      aria-label="Clear address"
                      onClick={() => setInputUrl("")}
                    >
                      <X className="size-3.5" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </form>

            <div className="flex shrink-0 items-center rounded-md border border-border/60 bg-background/70 p-0.5">
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
                  count: Math.min(
                    LENS_LOG_LIMIT,
                    consoleEntries.length + consoleBufferedCount,
                  ),
                },
                {
                  id: "network" as const,
                  label: "Network",
                  icon: Network,
                  count: Math.min(
                    LENS_LOG_LIMIT,
                    networkEntries.length + networkBufferedCount,
                  ),
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = lensPanelTab === tab.id;
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant={active ? "secondary" : "ghost"}
                          className={cn(
                            "relative",
                            active
                              ? LENS_TOOL_ACTIVE_CLASS
                              : LENS_TOOL_INACTIVE_CLASS,
                          )}
                          onClick={() => setLensPanelTab(tab.id)}
                          aria-label={`Show ${tab.label.toLowerCase()}`}
                          aria-pressed={active}
                        />
                      }
                    >
                      <Icon className={LENS_TOOL_ICON_CLASS} />
                      {tab.count ? (
                        <span className="absolute -right-1 -top-1 min-w-3.5 rounded-full bg-primary px-1 text-[9px] leading-3.5 text-primary-foreground">
                          {tab.count > 99 ? "99+" : tab.count}
                        </span>
                      ) : null}
                    </TooltipTrigger>
                    <TooltipContent>{tab.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={isPickerActive ? "secondary" : "outline"}
                    className={cn(
                      isPickerActive
                        ? LENS_TOOL_ACTIVE_CLASS
                        : LENS_TOOL_INACTIVE_CLASS,
                    )}
                    disabled={pickerDisabled}
                    onClick={() => {
                      void startElementPicker();
                    }}
                    aria-label="Pick element"
                    aria-pressed={isPickerActive}
                  />
                }
              >
                <Crosshair className={LENS_TOOL_ICON_CLASS} />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-pretty">
                {pickerTooltip}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={isAnnotationModeActive ? "secondary" : "outline"}
                    className={cn(
                      isAnnotationModeActive
                        ? LENS_TOOL_ACTIVE_CLASS
                        : LENS_TOOL_INACTIVE_CLASS,
                    )}
                    disabled={lensPageActionDisabled}
                    onClick={() => {
                      void toggleAnnotationMode();
                    }}
                    aria-label="Toggle visual comments"
                    aria-pressed={isAnnotationModeActive}
                  />
                }
              >
                <Highlighter className={LENS_TOOL_ICON_CLASS} />
              </TooltipTrigger>
              <TooltipContent>
                {isAnnotationModeActive
                  ? "Visual comments active"
                  : "Visual comments"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={isBoxInspectActive ? "secondary" : "outline"}
                    className={cn(
                      isBoxInspectActive
                        ? LENS_TOOL_ACTIVE_CLASS
                        : LENS_TOOL_INACTIVE_CLASS,
                    )}
                    disabled={lensPageActionDisabled}
                    onClick={() => {
                      void toggleBoxInspect();
                    }}
                    aria-label="Toggle box-model inspect"
                    aria-pressed={isBoxInspectActive}
                  />
                }
              >
                <Ruler className={LENS_TOOL_ICON_CLASS} />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-pretty">
                Inspect padding, border &amp; margin on hover. Click an element,
                then hover another to measure the gap between them.
              </TooltipContent>
            </Tooltip>

            <DropdownMenu onOpenChange={setIsLensFloatingSurfaceOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={lensPageActionDisabled}
                          aria-label="Save screenshot"
                          className={cn(
                            "h-8 gap-1 px-2",
                            LENS_TOOL_INACTIVE_CLASS,
                          )}
                        />
                      }
                    />
                  }
                >
                  <Camera className={LENS_TOOL_ICON_CLASS} />
                  <ChevronDown className="size-3 opacity-70" />
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
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant={
                            downloads.length > 0 ? "secondary" : "outline"
                          }
                          className={
                            downloads.length > 0
                              ? undefined
                              : LENS_TOOL_INACTIVE_CLASS
                          }
                          disabled={!hasLensApi}
                          aria-label="Downloads"
                        />
                      }
                    />
                  }
                >
                  <Download className={LENS_TOOL_ICON_CLASS} />
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
          </div>
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
              {!hasLensApi ? (
                <div className="absolute inset-0 p-3">
                  <Empty className="h-full justify-center rounded-xl border-border/70 bg-background/70 p-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ScanSearch />
                      </EmptyMedia>
                      <EmptyTitle>Lens needs the desktop runtime</EmptyTitle>
                      <EmptyDescription>
                        The embedded browser is backed by Electron
                        `WebContentsView`, so it is unavailable in browser-only
                        mode.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>
                          Use `bun run dev:desktop` or a packaged desktop build
                          to inspect pages, capture screenshots, and send
                          element context to a task.
                        </p>
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
                      variant={
                        consoleLevelFilter === level ? "secondary" : "ghost"
                      }
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setConsoleLevelFilter(level)}
                    >
                      {level}
                    </Button>
                  ))}
                </div>
                <LensDiagnosticsCaptureControls
                  state={diagnosticsCaptureState}
                  busy={diagnosticsCaptureBusy}
                  disabled={
                    lensPageActionDisabled ||
                    !window.api?.lens?.setDiagnosticsCapture
                  }
                  onChange={(enabled) => void setDiagnosticsCapture(enabled)}
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant={consolePaused ? "secondary" : "ghost"}
                  onClick={toggleConsolePaused}
                  aria-label={
                    consolePaused ? "Resume console log" : "Pause console log"
                  }
                >
                  {consolePaused ? (
                    <Play className="size-3.5" />
                  ) : (
                    <Pause className="size-3.5" />
                  )}
                </Button>
                {consolePaused ? (
                  <span
                    role="status"
                    className="whitespace-nowrap text-[11px] font-medium text-warning"
                  >
                    {consoleBufferedCount > 0
                      ? `${consoleBufferedCount} buffered`
                      : "Paused"}
                  </span>
                ) : null}
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
                  size="xs"
                  variant={consoleDetailsOpen ? "secondary" : "ghost"}
                  className="h-7 px-2 text-[11px]"
                  disabled={!selectedConsoleEntry}
                  onClick={() => setConsoleDetailsOpen((current) => !current)}
                  aria-label={
                    consoleDetailsOpen
                      ? "Hide console details"
                      : "Show console details"
                  }
                  aria-expanded={consoleDetailsOpen}
                  aria-controls="lens-console-entry-detail"
                >
                  <PanelRightOpen className="size-3.5" />
                  Details
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
                  disabled={
                    consoleEntries.length === 0 && consoleBufferedCount === 0
                  }
                  onClick={clearConsoleLog}
                  aria-label="Clear console log"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div
                data-testid="lens-console-log-workbench"
                className="flex min-h-0 min-w-0 flex-1 flex-row"
              >
                <div
                  ref={consoleLogRef}
                  data-testid="lens-console-entry-list"
                  className="min-h-0 min-w-0 flex-1 overflow-auto font-mono text-xs"
                >
                  {filteredConsoleEntries.length > 0 ? (
                    <div className="divide-y divide-border">
                      {filteredConsoleEntries.map((entry, index) => {
                        const selected = selectedConsoleEntryId === entry.id;
                        return (
                          <button
                            key={entry.id || `${entry.timestamp}-${index}`}
                            type="button"
                            className={cn(
                              "grid w-full grid-cols-[4.5rem_4.25rem_minmax(0,1fr)] gap-2 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                              selected && "bg-accent text-accent-foreground",
                            )}
                            aria-pressed={selected}
                            aria-expanded={
                              selected ? consoleDetailsOpen : undefined
                            }
                            aria-controls={
                              selected ? "lens-console-entry-detail" : undefined
                            }
                            onClick={() => {
                              setSelectedConsoleEntryId(entry.id);
                              setConsoleDetailsOpen(true);
                            }}
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
                            <span className="min-w-0">
                              <span className="block whitespace-pre-wrap break-words text-foreground">
                                {entry.text}
                              </span>
                              {entry.source ? (
                                <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                                  {entry.source}
                                  {entry.lineNumber
                                    ? `:${entry.lineNumber}`
                                    : ""}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
                      No console entries.
                    </div>
                  )}
                </div>
                {selectedConsoleEntry && consoleDetailsOpen ? (
                  <LensLogEntryDetail
                    ariaLabel="Console entry details"
                    testId="lens-console-entry-detail"
                    fields={[
                      {
                        label: "Level",
                        value: selectedConsoleEntry.level.toUpperCase(),
                      },
                      {
                        label: "Timestamp",
                        value: selectedConsoleEntry.timestamp,
                      },
                      {
                        label: "Source",
                        value: selectedConsoleEntry.source ?? "Page",
                      },
                      {
                        label: "Line",
                        value:
                          selectedConsoleEntry.lineNumber === undefined
                            ? "-"
                            : String(selectedConsoleEntry.lineNumber),
                      },
                    ]}
                    tabs={[
                      {
                        id: "message",
                        label: "Message",
                        content: (
                          <LensLogDetailBlock label="Message">
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">
                              {selectedConsoleEntry.text}
                            </pre>
                          </LensLogDetailBlock>
                        ),
                      },
                      {
                        id: "arguments",
                        label: "Arguments",
                        content: (
                          <div className="space-y-1.5">
                            {consoleEntryDetail?.arguments.length ? (
                              consoleEntryDetail.arguments.map(
                                (argument, index) => (
                                  <ConsoleInspectableRow
                                    key={`${selectedConsoleEntry.id}-${argument.objectHandle ?? index}`}
                                    entryId={selectedConsoleEntry.id}
                                    label={`[${index}]`}
                                    value={argument}
                                    loadProperties={loadConsoleObjectProperties}
                                  />
                                ),
                              )
                            ) : (
                              <DetailLoadState
                                loading={consoleDetailLoading}
                                error={consoleDetailError}
                                empty="This console entry has no captured arguments."
                              />
                            )}
                          </div>
                        ),
                      },
                      {
                        id: "stack",
                        label: "Stack",
                        content: (
                          <div className="space-y-1.5">
                            {consoleEntryDetail?.stackTrace ? (
                              flattenStackTrace(
                                consoleEntryDetail.stackTrace,
                              ).map(({ frame, depth, description }, index) => (
                                <div
                                  key={`${frame.scriptId ?? frame.url}-${frame.lineNumber}-${frame.columnNumber}-${index}`}
                                  className="rounded-md border border-border/70 bg-background/70 px-2 py-1.5 font-mono text-[11px]"
                                  style={{ marginLeft: `${depth * 12}px` }}
                                >
                                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                                    <span className="truncate font-medium text-foreground">
                                      {frame.functionName || "(anonymous)"}
                                    </span>
                                    {description ? (
                                      <span className="shrink-0 text-[10px] text-muted-foreground">
                                        {description}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-0.5 break-all text-[10px] text-muted-foreground">
                                    {frame.url || "(inline)"}
                                    {`:${frame.lineNumber}:${frame.columnNumber}`}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <DetailLoadState
                                loading={consoleDetailLoading}
                                error={consoleDetailError}
                                empty="No JavaScript stack was captured for this entry."
                              />
                            )}
                          </div>
                        ),
                      },
                      {
                        id: "context",
                        label: "Context",
                        content: (
                          <div className="grid gap-3">
                            <LensLogDetailBlock label="Execution context">
                              {consoleEntryDetail?.executionContext?.name ??
                                consoleEntryDetail?.executionContext?.origin ??
                                (selectedConsoleEntry.executionContextId
                                  ? `Context ${selectedConsoleEntry.executionContextId}`
                                  : "Page")}
                            </LensLogDetailBlock>
                            <LensLogDetailBlock label="Location">
                              {selectedConsoleEntry.source ?? "Page"}
                              {selectedConsoleEntry.lineNumber === undefined
                                ? ""
                                : `:${selectedConsoleEntry.lineNumber}`}
                              {selectedConsoleEntry.columnNumber === undefined
                                ? ""
                                : `:${selectedConsoleEntry.columnNumber}`}
                            </LensLogDetailBlock>
                            <LensLogDetailBlock label="Captured">
                              {selectedConsoleEntry.timestamp}
                            </LensLogDetailBlock>
                            <LensLogDetailBlock label="Capture source">
                              {selectedConsoleEntry.captureSource ??
                                "Electron fallback"}
                            </LensLogDetailBlock>
                          </div>
                        ),
                      },
                    ]}
                    activeTabId={consoleDetailTab}
                    onActiveTabChange={setConsoleDetailTab}
                    onCopy={copySelectedConsoleEntry}
                    onClose={() => setConsoleDetailsOpen(false)}
                  />
                ) : null}
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
                <LensDiagnosticsCaptureControls
                  state={diagnosticsCaptureState}
                  busy={diagnosticsCaptureBusy}
                  disabled={
                    lensPageActionDisabled ||
                    !window.api?.lens?.setDiagnosticsCapture
                  }
                  onChange={(enabled) => void setDiagnosticsCapture(enabled)}
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant={networkPaused ? "secondary" : "ghost"}
                  onClick={toggleNetworkPaused}
                  aria-label={
                    networkPaused ? "Resume network log" : "Pause network log"
                  }
                >
                  {networkPaused ? (
                    <Play className="size-3.5" />
                  ) : (
                    <Pause className="size-3.5" />
                  )}
                </Button>
                {networkPaused ? (
                  <span
                    role="status"
                    className="whitespace-nowrap text-[11px] font-medium text-warning"
                  >
                    {networkBufferedCount > 0
                      ? `${networkBufferedCount} buffered`
                      : "Paused"}
                  </span>
                ) : null}
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
                  size="xs"
                  variant={networkDetailsOpen ? "secondary" : "ghost"}
                  className="h-7 px-2 text-[11px]"
                  disabled={!selectedNetworkEntry}
                  onClick={() => setNetworkDetailsOpen((current) => !current)}
                  aria-label={
                    networkDetailsOpen
                      ? "Hide network details"
                      : "Show network details"
                  }
                  aria-expanded={networkDetailsOpen}
                  aria-controls="lens-network-entry-detail"
                >
                  <PanelRightOpen className="size-3.5" />
                  Details
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
                  disabled={
                    networkEntries.length === 0 && networkBufferedCount === 0
                  }
                  onClick={clearNetworkLog}
                  aria-label="Clear network log"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div
                data-testid="lens-network-log-workbench"
                className="flex min-h-0 min-w-0 flex-1 flex-row"
              >
                <div
                  ref={networkLogRef}
                  data-testid="lens-network-entry-list"
                  className="min-h-0 min-w-0 flex-1 overflow-auto text-xs"
                >
                  {filteredNetworkEntries.length > 0 ? (
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-[4.5rem_4rem_4.5rem_minmax(8rem,1fr)_5.5rem_4.5rem_4.5rem_5rem] gap-2 border-b border-border px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
                        <span>Time</span>
                        <span>Method</span>
                        <span>Status</span>
                        <span>URL</span>
                        <span>Type</span>
                        <span>Size</span>
                        <span>Time</span>
                        <span>Waterfall</span>
                      </div>
                      <div className="divide-y divide-border">
                        {filteredNetworkEntries.map((entry) => {
                          const selected =
                            selectedNetworkEntryId === entry.entryId;
                          return (
                            <button
                              key={entry.entryId}
                              type="button"
                              className={cn(
                                "grid w-full grid-cols-[4.5rem_4rem_4.5rem_minmax(8rem,1fr)_5.5rem_4.5rem_4.5rem_5rem] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                selected && "bg-accent text-accent-foreground",
                              )}
                              aria-pressed={selected}
                              aria-expanded={
                                selected ? networkDetailsOpen : undefined
                              }
                              aria-controls={
                                selected
                                  ? "lens-network-entry-detail"
                                  : undefined
                              }
                              onClick={() => {
                                setSelectedNetworkEntryId(entry.entryId);
                                setNetworkDetailsOpen(true);
                              }}
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
                                  getNetworkStatusClass(entry),
                                )}
                              >
                                {formatNetworkRowStatus(entry)}
                              </span>
                              <span className="truncate font-mono text-[11px]">
                                {entry.url}
                              </span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {entry.resourceType ?? entry.mimeType ?? "-"}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {formatLensNetworkBytes(entry.responseSize)}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {formatDuration(entry.durationMs)}
                              </span>
                              <NetworkWaterfallCell
                                entry={entry}
                                maxDurationMs={networkWaterfallMaxMs}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
                      No network entries.
                    </div>
                  )}
                </div>
                {selectedNetworkEntry && networkDetailsOpen ? (
                  <LensLogEntryDetail
                    ariaLabel="Network entry details"
                    testId="lens-network-entry-detail"
                    fields={[
                      {
                        label: "Method",
                        value: selectedNetworkEntry.method,
                      },
                      {
                        label: "Status",
                        value: formatLensNetworkStatus(selectedNetworkEntry),
                      },
                      {
                        label: "Duration",
                        value: formatDuration(selectedNetworkEntry.durationMs),
                      },
                      {
                        label: "Transferred",
                        value: formatLensNetworkBytes(
                          selectedNetworkEntry.responseSize,
                        ),
                      },
                      {
                        label: "Request ID",
                        value: selectedNetworkEntry.requestId,
                      },
                    ]}
                    tabs={[
                      {
                        id: "headers",
                        label: "Headers",
                        content: (
                          <>
                            <LensLogDetailBlock label="Request URL">
                              <span className="break-all">
                                {selectedNetworkEntry.url}
                              </span>
                            </LensLogDetailBlock>
                            {networkDetailLoading && !networkEntryDetail ? (
                              <DetailLoadState loading error={null} empty="" />
                            ) : networkDetailError ? (
                              <DetailLoadState
                                loading={false}
                                error={networkDetailError}
                                empty=""
                              />
                            ) : null}
                            <LensLogDetailBlock label="General">
                              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                                <dt className="text-muted-foreground">State</dt>
                                <dd>{selectedNetworkEntry.state}</dd>
                                <dt className="text-muted-foreground">
                                  Protocol
                                </dt>
                                <dd>{networkEntryDetail?.protocol ?? "-"}</dd>
                                <dt className="text-muted-foreground">
                                  Remote address
                                </dt>
                                <dd>
                                  {networkEntryDetail?.remoteAddress ?? "-"}
                                </dd>
                                <dt className="text-muted-foreground">
                                  Priority
                                </dt>
                                <dd>{networkEntryDetail?.priority ?? "-"}</dd>
                                <dt className="text-muted-foreground">Cache</dt>
                                <dd>
                                  {selectedNetworkEntry.fromCache
                                    ? "Yes"
                                    : "No"}
                                </dd>
                              </dl>
                            </LensLogDetailBlock>
                            <LensLogDetailBlock label="Request headers">
                              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all">
                                {formatNetworkHeaders(
                                  networkEntryDetail?.requestHeaders ??
                                    selectedNetworkEntry.requestHeaders,
                                )}
                              </pre>
                            </LensLogDetailBlock>
                            <LensLogDetailBlock label="Response headers">
                              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all">
                                {formatNetworkHeaders(
                                  networkEntryDetail?.responseHeaders ??
                                    selectedNetworkEntry.responseHeaders,
                                )}
                              </pre>
                            </LensLogDetailBlock>
                          </>
                        ),
                      },
                      {
                        id: "payload",
                        label: "Payload",
                        content: (
                          <NetworkBodyView
                            label="Request payload"
                            loading={selectedRequestBodyState?.loading ?? false}
                            error={selectedRequestBodyState?.error ?? null}
                            body={selectedRequestBodyState?.body ?? null}
                            metadata={networkEntryDetail?.requestBody}
                            available={Boolean(
                              selectedNetworkEntry.hasRequestBody,
                            )}
                          />
                        ),
                      },
                      {
                        id: "response",
                        label: "Response",
                        content: (
                          <NetworkBodyView
                            label="Response"
                            loading={
                              selectedResponseBodyState?.loading ?? false
                            }
                            error={selectedResponseBodyState?.error ?? null}
                            body={selectedResponseBodyState?.body ?? null}
                            metadata={networkEntryDetail?.responseBody}
                            available={Boolean(
                              selectedNetworkEntry.hasResponseBody,
                            )}
                          />
                        ),
                      },
                      {
                        id: "initiator",
                        label: "Initiator",
                        content: (
                          <div className="space-y-3">
                            {networkEntryDetail?.initiator ? (
                              <>
                                <LensLogDetailBlock label="Initiator">
                                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                                    <dt className="text-muted-foreground">
                                      Type
                                    </dt>
                                    <dd>{networkEntryDetail.initiator.type}</dd>
                                    <dt className="text-muted-foreground">
                                      Location
                                    </dt>
                                    <dd className="break-all">
                                      {networkEntryDetail.initiator.url ?? "-"}
                                      {networkEntryDetail.initiator
                                        .lineNumber === undefined
                                        ? ""
                                        : `:${networkEntryDetail.initiator.lineNumber}`}
                                      {networkEntryDetail.initiator
                                        .columnNumber === undefined
                                        ? ""
                                        : `:${networkEntryDetail.initiator.columnNumber}`}
                                    </dd>
                                  </dl>
                                </LensLogDetailBlock>
                                {networkEntryDetail.initiator.stack ? (
                                  <div className="space-y-1.5">
                                    {flattenStackTrace(
                                      networkEntryDetail.initiator.stack,
                                    ).map(({ frame, depth }, index) => (
                                      <div
                                        key={`${frame.scriptId ?? frame.url}-${frame.lineNumber}-${frame.columnNumber}-${index}`}
                                        className="rounded-md border border-border/70 bg-background/70 px-2 py-1.5 font-mono text-[11px]"
                                        style={{
                                          marginLeft: `${depth * 12}px`,
                                        }}
                                      >
                                        <div className="font-medium text-foreground">
                                          {frame.functionName || "(anonymous)"}
                                        </div>
                                        <div className="mt-0.5 break-all text-[10px] text-muted-foreground">
                                          {frame.url || "(inline)"}
                                          {`:${frame.lineNumber}:${frame.columnNumber}`}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <DetailLoadState
                                loading={networkDetailLoading}
                                error={networkDetailError}
                                empty="No initiator information was captured."
                              />
                            )}
                            {networkEntryDetail?.redirects?.length ? (
                              <LensLogDetailBlock label="Redirect chain">
                                <ol className="space-y-1">
                                  {networkEntryDetail.redirects.map(
                                    (redirect, index) => (
                                      <li
                                        key={`${redirect.url}-${redirect.timestamp}-${index}`}
                                        className="break-all"
                                      >
                                        {redirect.status} {redirect.url}
                                      </li>
                                    ),
                                  )}
                                </ol>
                              </LensLogDetailBlock>
                            ) : null}
                          </div>
                        ),
                      },
                      {
                        id: "timing",
                        label: "Timing",
                        content: (
                          <div className="space-y-3">
                            <LensLogDetailBlock label="Summary">
                              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                                <dt className="text-muted-foreground">
                                  Started
                                </dt>
                                <dd>{selectedNetworkEntry.startedAt ?? "-"}</dd>
                                <dt className="text-muted-foreground">
                                  Completed
                                </dt>
                                <dd>
                                  {selectedNetworkEntry.completedAt ??
                                    selectedNetworkEntry.timestamp}
                                </dd>
                                <dt className="text-muted-foreground">
                                  Duration
                                </dt>
                                <dd>
                                  {formatDuration(
                                    selectedNetworkEntry.durationMs,
                                  )}
                                </dd>
                                <dt className="text-muted-foreground">
                                  Transferred
                                </dt>
                                <dd>
                                  {formatLensNetworkBytes(
                                    selectedNetworkEntry.responseSize,
                                  )}
                                </dd>
                              </dl>
                            </LensLogDetailBlock>
                            {networkDetailLoading && !networkEntryDetail ? (
                              <DetailLoadState loading error={null} empty="" />
                            ) : networkDetailError ? (
                              <DetailLoadState
                                loading={false}
                                error={networkDetailError}
                                empty=""
                              />
                            ) : (
                              <NetworkTimingView
                                timing={networkEntryDetail?.timing}
                                durationMs={selectedNetworkEntry.durationMs}
                              />
                            )}
                          </div>
                        ),
                      },
                    ]}
                    activeTabId={networkDetailTab}
                    onActiveTabChange={setNetworkDetailTab}
                    onCopy={copySelectedNetworkEntry}
                    onClose={() => setNetworkDetailsOpen(false)}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
