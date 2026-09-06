import { chromeStyles } from "./lens-chrome.styles";
import { sx } from "../../../ads/utils/stylex";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  useCallback,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronRight, Copy, Crosshair, Square, X } from "lucide-react";
import { Button, Loader } from "@/components/ui";
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
import { detailStyles as d } from "./lens-detail.styles";
import { focusRing } from "../../../ads/recipes/focus-ring";
import { transition } from "../../../ads/recipes/transition";

export const LENS_TOOL_ACTIVE_CLASS = sx(chromeStyles.toolActive);
export const LENS_TOOL_INACTIVE_CLASS = sx(chromeStyles.toolInactive);
export const LENS_TOOL_ICON_CLASS = sx(chromeStyles.toolIcon);

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
      <div className={sx(d.label)}>
        {props.label}
      </div>
      <div className={sx(d.block)}>
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
      className={sx(d.object, depth > 0 && d.nested)}
      data-console-entry-id={entryId}
    >
      <div className={sx(d.objectRow)}>
        {canExpand ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            xstyle={d.toggle}
            onClick={() => void toggleExpanded()}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
            aria-expanded={expanded}
          >
            {loading ? (
              <Loader size="xs" variant="scan" />
            ) : (
              <ChevronRight
                className={sx(d.chevron, expanded && d.expanded)}
              />
            )}
          </Button>
        ) : (
          <span className={sx(d.spacer)} aria-hidden />
        )}
        <div className={sx(d.fill)}>
          <div className={sx(d.valueRow)}>
            <span className={sx(d.property)}>{label}</span>
            <span className={sx(d.value)}>
              {formatConsoleInspectableValue(value)}
            </span>
            <span className={sx(d.hint)}>
              {value.subtype ?? value.type}
            </span>
          </div>
          {!expanded && preview?.properties.length ? (
            <p className={sx(d.preview)}>
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
        <div className={sx(d.properties)}>
          {error ? (
            <div className={sx(d.error)}>
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
                <p className={sx(d.note)}>
                  Additional properties were omitted by the capture limit.
                </p>
              ) : null}
            </>
          ) : loading ? (
            <p className={sx(d.note)}>
              Loading properties…
            </p>
          ) : (
            <p className={sx(d.note)}>
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
      <div className={sx(d.state)}>
        <Loader aria-hidden size="xs" variant="scan" />
        Loading diagnostic detail…
      </div>
    );
  }
  if (props.error) {
    return (
      <div className={sx(d.error, d.stateError)}>
        {props.error}
      </div>
    );
  }
  return (
    <div className={sx(d.state)}>
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
    <div className={sx(d.stack)}>
      <div className={sx(d.metadata)}>
        <span className={sx(d.kind)}>
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
          <span className={sx(d.warning)}>
            Sensitive fields redacted
          </span>
        ) : null}
        {resolved.truncated ? (
          <span className={sx(d.warning)}>
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
          <pre className={sx(d.body)}>
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
    <div className={sx(d.spacedStack)}>
      <LensLogDetailBlock label="Raw timestamps">
        <dl className={sx(d.timestamps)}>
          <dt className={sx(d.muted)}>Request monotonic</dt>
          <dd>{props.timing.requestTimestamp}</dd>
          <dt className={sx(d.muted)}>Wall time</dt>
          <dd>{props.timing.wallTime ?? "-"}</dd>
          <dt className={sx(d.muted)}>Response monotonic</dt>
          <dd>{props.timing.responseTimestamp ?? "-"}</dd>
          <dt className={sx(d.muted)}>Finished monotonic</dt>
          <dd>{props.timing.finishedTimestamp ?? "-"}</dd>
        </dl>
      </LensLogDetailBlock>
      {phases.length ? (
        <div className={sx(d.table)}>
          <div className={sx(d.phaseRow, d.phaseHeading)}>
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
                className={sx(d.phaseRow)}
              >
                <span className={sx(d.phaseName)}>
                  {phase.label}
                </span>
                <span className={sx(d.monoMuted)}>
                  {formatDuration(phase.start)}
                </span>
                <span className={sx(d.monoMuted)}>
                  {formatDuration(duration)}
                </span>
                <span className={sx(d.track)}>
                  <span
                    className={sx(d.bar)}
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
      className={sx(d.track, d.smallTrack)}
      aria-label={
        props.entry.state === "pending"
          ? "Request pending"
          : `Request duration ${formatDuration(props.entry.durationMs)}`
      }
    >
      <span
        className={sx(d.bar, d.barOrigin, props.entry.state === "failed" && d.failed)}
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
      className={sx(d.capture)}
      aria-live="polite"
      title={state?.message}
    >
      {enabled ? (
        <>
          <span className={sx(d.captureStatus)}>
            <span className={sx(d.dot)} />
            <span className={sx(d.truncated)}>
              Full capture · {state?.host ?? "current host"}
            </span>
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            xstyle={d.captureButton}
            disabled={disabled || busy}
            onClick={() => onChange(false)}
            aria-label="Stop full diagnostics capture"
          >
            {busy ? (
              <Loader aria-hidden size="xs" variant="scan" />
            ) : (
              <Square className={sx(d.stopIcon)} />
            )}
            Stop
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          xstyle={d.captureButton}
          disabled={disabled || busy}
          onClick={() => onChange(true)}
          aria-label="Enable full diagnostics capture for the current host"
        >
          {busy ? (
            <Loader aria-hidden size="xs" variant="scan" />
          ) : (
            <Crosshair className={sx(d.icon)} />
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
      className={sx(d.inspector)}
    >
      <div className={sx(d.sticky)}>
        <div className={sx(d.header)}>
          <span className={sx(d.title)}>
            Entry details
          </span>
          <div className={sx(d.actions)}>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onCopy}
              aria-label={`Copy ${ariaLabel.toLowerCase()}`}
            >
              <Copy className={sx(d.icon)} />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onClose}
              aria-label={`Close ${ariaLabel.toLowerCase()}`}
            >
              <X className={sx(d.icon)} />
            </Button>
          </div>
        </div>
        <div
          role="tablist"
          aria-label={`${ariaLabel} sections`}
          className={sx(d.tablist)}
        >
          {tabs.map((tab, index) => {
            const selected = tab.id === activeTab?.id;
            return (
              <AdsButton layout="host"
                key={tab.id}
                id={`${testId}-${tab.id}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${testId}-${tab.id}-panel`}
                tabIndex={selected ? 0 : -1}
                xstyle={[d.tab, transition.colors, focusRing.ringInset, selected && d.selectedTab]}
                onClick={() => onActiveTabChange(tab.id)}
                onKeyDown={(event) => moveTabFocus(event, index)}
              >
                {tab.label}
              </AdsButton>
            );
          })}
        </div>
      </div>
      <div className={sx(d.spacedStack, d.content)}>
        <dl className={sx(d.fields)}>
          {fields.map((field) => (
            <div key={field.label} className={sx(d.field)}>
              <dt className={sx(d.label)}>
                {field.label}
              </dt>
              <dd className={sx(d.fieldValue)}>
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
            className={sx(d.spacedStack, focusRing.ringInset)}
          >
            {activeTab.content}
          </div>
        ) : null}
      </div>
    </section>
  );
}
