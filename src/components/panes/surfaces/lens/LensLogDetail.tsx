import {
  useCallback,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ChevronRight,
  Copy,
  Crosshair,
  Loader2,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";
import {
  formatConsoleInspectableValue,
  formatDuration,
  formatNetworkBodyContent,
  getNetworkTimingPhases,
  type ConsoleInspectableValue,
} from "@/lib/lens/lens-log-format";
import { formatLensNetworkBytes } from "@/lib/lens/lens-network";
import type {
  BrowserConsoleObjectProperties,
  BrowserNetworkBody,
  BrowserNetworkEntry,
  BrowserNetworkTiming,
  LensDiagnosticsCaptureState,
} from "@/lib/lens/lens.types";
import { cn } from "@/lib/utils";

export const LENS_TOOL_ACTIVE_CLASS =
  "border-primary/50 bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary dark:bg-primary/15";
export const LENS_TOOL_INACTIVE_CLASS =
  "text-muted-foreground hover:text-foreground";
export const LENS_TOOL_ICON_CLASS = "size-4";

export type LensLogDetailTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function LensLogDetailBlock(props: {
  label: string;
  children: ReactNode;
}) {
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

export function ConsoleInspectableRow(props: {
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

export function DetailLoadState(props: {
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

export function NetworkBodyView(props: {
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

export function NetworkTimingView(props: {
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

export function NetworkWaterfallCell(props: {
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

export function LensDiagnosticsCaptureControls(props: {
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

export function LensLogEntryDetail(props: {
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
