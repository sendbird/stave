import { ChevronRight } from "lucide-react";
import * as React from "react";

import { i18n, Trans, useTranslation } from "@/i18n";
import { formatDuration as formatHostDuration } from "@/i18n/format";

import { disclosureChevron } from "../recipes/disclosure-chevron";
import { focusRing } from "../recipes/focus-ring";
import { controlHeights, controlSquares } from "../recipes/control-metrics";
import { themeSlotProps, themeTargetClassName } from "../theming/theme-props";
import {
  DISCLOSURE_GROUP_MIN_ROWS,
  useDisclosureGroup,
} from "../utils/disclosure-group";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { DisclosureGroupToggle } from "./disclosure-group-toggle";
import { barStatusStyles, barToneStyles, styles } from "./TraceWaterfall.styles";

export type TraceSpanStatus = "ok" | "error" | "running";

/**
 * Host addition: which data-ink series a bar is drawn in. `chart1` is the
 * upstream default; the others let one waterfall tell kinds of span apart
 * (the turn itself, a tool call, a subagent) without a status colour standing
 * in for a category. `error` still wins over any tone.
 */
export type TraceSpanTone = "chart1" | "chart2" | "chart4" | "neutral";

export type TraceSpan = {
  durationMs: number;
  /** Stable identity — list key, selection + expansion target. */
  id: string;
  /** Extra context rendered muted after the span name (e.g. an op tag). */
  meta?: React.ReactNode;
  name: React.ReactNode;
  /** Parent span id; `null`/`undefined` marks a root span. */
  parentId?: string | null;
  /** Start offset (ms) on the shared trace axis. */
  startMs: number;
  /** Defaults to "ok". "error" tints the bar danger; "running" pulses. */
  status?: TraceSpanStatus;
  /** Host addition: bar series. @default "chart1" */
  tone?: TraceSpanTone;
  /** Host addition: content before the duration figure (a tag, a cost). */
  trailing?: React.ReactNode;
};

export type TraceWaterfallProps = Omit<
  React.ComponentProps<"div">,
  "onSelect"
> & {
  /** Span ids collapsed initially (uncontrolled expansion; default all expanded). */
  defaultCollapsedIds?: string[];
  label?: string;
  /**
   * Host addition: a moment on the axis drawn as a vertical line through every
   * track — "now" while the trace is still running. The axis stretches to
   * include it.
   */
  markerMs?: number;
  onSelectSpan?: (id: string) => void;
  /** Id of the selected span (selection is controlled). */
  selected?: string | null;
  /** Flat span list; hierarchy comes from `parentId`. Orphans render as roots. */
  spans: TraceSpan[];
} & XstyleProp;

type FlatSpan = {
  depth: number;
  hasChildren: boolean;
  span: TraceSpan;
};

/** Indent (px) applied per tree depth level in the name column. */
const DEPTH_INDENT = 16;

/** Host: the app's duration words, so a span reads like every other clock. */
function formatDuration(durationMs: number): string {
  return formatHostDuration(durationMs, { tenths: true });
}

export type TraceAxis = { originMs: number; totalMs: number };

/**
 * Host: the shared axis, exported so the math is tested where it is used.
 * Origin at the earliest start, end at the latest end or the marker, never
 * zero wide.
 */
export function resolveTraceAxis(
  spans: readonly Pick<TraceSpan, "durationMs" | "startMs">[],
  markerMs?: number,
): TraceAxis {
  if (spans.length === 0) {
    return { originMs: 0, totalMs: 1 };
  }

  const start = Math.min(...spans.map((span) => span.startMs));
  const end = Math.max(
    ...spans.map((span) => span.startMs + span.durationMs),
    markerMs ?? Number.NEGATIVE_INFINITY,
  );

  return { originMs: start, totalMs: Math.max(end - start, 1) };
}

/**
 * Host: where a bar sits, in percent of its track. The minimum width keeps an
 * instant visible without moving its start, and the bar never runs past the
 * track's end.
 */
export function layoutTraceBar(
  span: Pick<TraceSpan, "durationMs" | "startMs">,
  axis: TraceAxis,
  minWidthPercent = 0.5,
) {
  const startPercent = ((span.startMs - axis.originMs) / axis.totalMs) * 100;
  const widthPercent = Math.min(
    Math.max((span.durationMs / axis.totalMs) * 100, minWidthPercent),
    Math.max(100 - startPercent, 0),
  );
  return { startPercent, widthPercent };
}

/**
 * Hierarchical span waterfall (trace-view anatomy: chronologically
 * ordered rows, children indented under parents, proportional timing bars on
 * one shared 0..total axis, expandable via chevrons).
 *
 * Bars use `chart1` data ink by default; `error` switches to danger and
 * `running` pulses (static at reduced motion). Rows are plain buttons in DOM
 * order (natural Tab); ArrowUp/Down move focus, Enter selects,
 * ArrowLeft/Right collapse/expand the focused row.
 *
 * Once two or more spans have children, a head row states the span count and
 * total duration and offers expand/collapse-all over every parent span, at any
 * depth (the shared `utils/disclosure-group` model). A span that streams in
 * after a bulk action follows it.
 *
 * Host: every row is a subgrid of the root's three columns, so the trailing
 * column is as wide as its widest cell on every row and the tracks — and the
 * bars on them — share one axis whatever a row's duration text measures.
 */
export function TraceWaterfall({
  className,
  defaultCollapsedIds,
  label,
  markerMs,
  onSelectSpan,
  selected,
  spans,
  xstyle,
  ...props
}: TraceWaterfallProps) {
  useTranslation();
  // `defaultCollapsedIds` seeds the first render only, like every `default*`.
  const [initiallyCollapsed] = React.useState(
    () => new Set(defaultCollapsedIds ?? []),
  );
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());

  // Shared axis: origin at the earliest start, span to the latest end.
  const axis = React.useMemo(
    () => resolveTraceAxis(spans, markerMs),
    [markerMs, spans],
  );
  const { originMs, totalMs } = axis;

  // Link spans to their children, chronological within a level (waterfall
  // ordering). Spans whose parent is missing are treated as roots so bad data
  // still renders.
  const childrenOf = React.useMemo(() => {
    const ids = new Set(spans.map((span) => span.id));
    const links = new Map<string | null, TraceSpan[]>();

    for (const span of spans) {
      const parentKey =
        span.parentId != null && ids.has(span.parentId) ? span.parentId : null;
      const siblings = links.get(parentKey) ?? [];

      siblings.push(span);
      links.set(parentKey, siblings);
    }
    for (const siblings of links.values()) {
      siblings.sort((a, b) => a.startMs - b.startMs);
    }

    return links;
  }, [spans]);

  // Every parent span, at any depth — "Expand all" opens the whole tree.
  const parentIds = React.useMemo(
    () => spans.filter((span) => childrenOf.has(span.id)).map((s) => s.id),
    [childrenOf, spans],
  );
  const group = useDisclosureGroup({
    defaultExpanded: (id) => !initiallyCollapsed.has(id),
    ids: parentIds,
  });

  // The visible, depth-first row list.
  const visible: FlatSpan[] = [];
  const walk = (parentKey: string | null, depth: number) => {
    for (const span of childrenOf.get(parentKey) ?? []) {
      const hasChildren = childrenOf.has(span.id);

      visible.push({ depth, hasChildren, span });

      if (hasChildren && group.isExpanded(span.id)) {
        walk(span.id, depth + 1);
      }
    }
  };

  walk(null, 0);

  const focusRowAt = (index: number) => {
    const target = visible[index];

    if (target) {
      rowRefs.current.get(target.span.id)?.focus();
    }
  };

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const node = visible[index];

    if (!node) {
      return;
    }

    const open = node.hasChildren && group.isExpanded(node.span.id);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRowAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRowAt(index - 1);
        break;
      case "ArrowRight":
        if (node.hasChildren && !open) {
          event.preventDefault();
          group.setExpanded(node.span.id, true);
        }
        break;
      case "ArrowLeft":
        if (open) {
          event.preventDefault();
          group.setExpanded(node.span.id, false);
        }
        break;
      default:
        break;
    }
  };

  const markerPercent =
    markerMs === undefined ? null : ((markerMs - originMs) / totalMs) * 100;

  return (
    <div
      {...props}
      aria-label={label ?? i18n.t("ui:traceWaterfall.label")}
      className={cx(
        sx(styles.root, xstyle),
        themeTargetClassName("trace-waterfall"),
        className,
      )}
      role="group"
    >
      {parentIds.length >= DISCLOSURE_GROUP_MIN_ROWS ? (
        <div
          {...themeSlotProps("trace-waterfall", "head")}
          className={sx(styles.head)}
        >
          <span
            {...themeSlotProps("trace-waterfall", "summary")}
            className={sx(styles.summary)}
          >
            <Trans
              i18n={i18n}
              ns="ui"
              i18nKey="traceWaterfall.summary"
              count={spans.length}
              values={{ count: spans.length, duration: formatDuration(totalMs) }}
              components={{
                strong: <span className={sx(styles.summaryStrong)} />,
                dot: <span className={sx(styles.dot)} />,
              }}
            />
          </span>
          <DisclosureGroupToggle
            expanded={group.allExpanded}
            onToggle={group.toggleAll}
            themeSlot={themeSlotProps("trace-waterfall", "toggle")}
          />
        </div>
      ) : null}
      {visible.map((node, index) => {
        const { depth, hasChildren, span } = node;
        const expanded = hasChildren && group.isExpanded(span.id);
        const isSelected = selected === span.id;
        const status = span.status ?? "ok";
        const spanName = typeof span.name === "string" ? span.name : span.id;
        const { startPercent, widthPercent } = layoutTraceBar(span, axis);

        return (
          <div
            className={sx(styles.row)}
            data-trace-span-id={span.id}
            key={span.id}
          >
            <div
              className={sx(styles.nameCell)}
              style={{ paddingInlineStart: depth * DEPTH_INDENT }}
            >
              {hasChildren ? (
                <button
                  aria-expanded={expanded}
                  aria-label={i18n.t(
                    expanded
                      ? "ui:traceWaterfall.collapse"
                      : "ui:traceWaterfall.expand",
                    { name: spanName },
                  )}
                  className={sx(
                    styles.chevron,
                    controlSquares.xs,
                    focusRing.ring,
                    focusRing.ringInset,
                  )}
                  onClick={() => group.toggle(span.id)}
                  type="button"
                >
                  <ChevronRight
                    aria-hidden
                    className={sx(
                      disclosureChevron.base,
                      expanded && disclosureChevron.openQuarter,
                    )}
                    size={14}
                  />
                </button>
              ) : (
                <span aria-hidden className={sx(styles.chevronSpacer)} />
              )}
              <button
                // Host: only a waterfall that keeps a selection has pressed
                // rows; without one, `aria-pressed="false"` on every row would
                // announce a toggle that does nothing.
                aria-pressed={selected === undefined ? undefined : isSelected}
                className={cx(
                  sx(
                    styles.selectButton,
                    controlHeights.xs,
                    isSelected && styles.selectButtonSelected,
                    focusRing.ring,
                    focusRing.ringInset,
                  ),
                  themeTargetClassName("trace-waterfall-span"),
                )}
                data-trace-span-name="true"
                onClick={() => onSelectSpan?.(span.id)}
                onKeyDown={(event) => handleRowKeyDown(event, index)}
                ref={(element) => {
                  if (element) {
                    rowRefs.current.set(span.id, element);
                  } else {
                    rowRefs.current.delete(span.id);
                  }
                }}
                type="button"
              >
                <span className={sx(styles.name)}>{span.name}</span>
                {span.meta ? (
                  <span className={sx(styles.meta)}>{span.meta}</span>
                ) : null}
              </button>
            </div>
            <div
              {...themeSlotProps("trace-waterfall", "track")}
              aria-hidden
              className={sx(styles.track)}
            >
              <span
                className={sx(
                  styles.bar,
                  barStatusStyles[status],
                  status !== "error" && span.tone && barToneStyles[span.tone],
                )}
                data-trace-bar="true"
                style={{
                  insetInlineStart: `${startPercent}%`,
                  inlineSize: `${widthPercent}%`,
                }}
              />
              {markerPercent === null ? null : (
                <span
                  className={sx(styles.marker)}
                  data-trace-marker="true"
                  style={{ insetInlineStart: `${markerPercent}%` }}
                />
              )}
            </div>
            <span
              {...themeSlotProps("trace-waterfall", "duration")}
              className={sx(styles.duration)}
            >
              {span.trailing}
              <span>{formatDuration(span.durationMs)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
