import { Check, Flag, X } from "lucide-react";
import * as React from "react";

import { i18n } from "@/i18n";

import { dataMark } from "../recipes/data-mark";
import { focusRing } from "../recipes/focus-ring";
import { liveBreath } from "../recipes/live-breath";
import { percentOf } from "../utils/chart-math";
import { sx } from "../utils/stylex";
import { timeAxisStyles } from "./Charts.timeAxis.styles";
import { inTimeDomain, thinTicks } from "./Charts.timeline.utils";
import { barStatusStyles, styles } from "./Charts.timelineLanes.styles";
import { useLivePhaseLock } from "./Skeleton.motion";
import { AgentGlyphSwap } from "./agent-motion";
import { Loader } from "./Loader";
import { VisuallyHidden } from "./VisuallyHidden";

/** What an agent lane's bar is doing. Drives tone, glyph and legend word. */
export type TimelineItemStatus = "done" | "running" | "attention" | "failed";

/** A lane's label: who works on it, in which model, in which state. */
export type TimelineRow = {
  /** Matches `TimelineItem.row`. */
  id: string;
  /** Spoken and drawn lane name. */
  label: string;
  /** A 24px tile, e.g. the agent's glyph. */
  leading?: React.ReactNode;
  /** Machine line under the name, e.g. the model id. */
  meta?: React.ReactNode;
  /** A state tag beside the name, e.g. "Idle" or "Needs you". */
  status?: React.ReactNode;
};

/** A dashed hand-off from the end of one bar to the start of another. */
export type TimelineHandoff = { from: string; to: string };

export type TimelineLaneItem = {
  id: string;
  label: string;
  /** Short machine value at the bar's end, e.g. "2/4". */
  meta?: string;
  row?: string;
  start: number;
  end: number;
  status?: TimelineItemStatus;
};

export const TIMELINE_STATUS_WORD: Record<TimelineItemStatus, string> = {
  get attention() {
    return i18n.t("ui:timeline.status.attention");
  },
  get done() {
    return i18n.t("ui:timeline.status.done");
  },
  get failed() {
    return i18n.t("ui:timeline.status.failed");
  },
  get running() {
    return i18n.t("ui:timeline.status.running");
  },
};

const STATUS_ORDER: readonly TimelineItemStatus[] = [
  "done",
  "running",
  "attention",
  "failed",
];

export type TimelineLanesProps = {
  activeIndex: number | null;
  describe: (index: number) => string;
  domain: [number, number];
  footerTrail?: React.ReactNode;
  handoffLabel: string;
  handoffs: readonly TimelineHandoff[];
  items: readonly TimelineLaneItem[];
  label: string;
  notice?: React.ReactNode;
  now: number | null;
  nowLabel: string;
  onBlur: () => void;
  onHover: (index: number | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onSelectItem?: (id: string) => void;
  rows: readonly TimelineRow[];
  selectedItemId?: string;
  statusLabels: Record<TimelineItemStatus, string>;
  summary?: React.ReactNode;
  ticks: ReadonlyArray<{ at: number; label: string }>;
};

/**
 * `TimelineChart variant="lanes"` (P2 · agent-lanes): one lane per agent on a
 * shared clock — a labelled bar per task in its status tone and glyph, the
 * axis on top with a "now" rule, and dashed hand-offs between lanes. Running
 * bars spin only while motion is allowed (the `Loader` honours reduced motion).
 */
export function TimelineLanes({
  activeIndex,
  describe,
  domain,
  footerTrail,
  handoffLabel,
  handoffs,
  items,
  label,
  notice,
  now,
  nowLabel,
  onBlur,
  onHover,
  onKeyDown,
  onSelectItem,
  rows,
  selectedItemId,
  statusLabels,
  summary,
  ticks,
}: TimelineLanesProps) {
  const plotRef = React.useRef<HTMLDivElement>(null);
  useLivePhaseLock(items.some((item) => item.status === "running"));
  const [paths, setPaths] = React.useState<string[]>([]);
  const [plotWidth, setPlotWidth] = React.useState(600);
  // Keep tick labels ~52px apart on the track (it is ~70% of the plot),
  // anchored on the last tick so the axis always ends on its newest mark.
  const shownTicks = thinTicks(ticks, 52, plotWidth * 0.7, "end");
  const at = (t: number) => `${percentOf(t, domain)}%`;
  const nowShown = inTimeDomain(now, domain);

  // Hand-offs join two bars in different lanes, so they are measured from the
  // rendered bars rather than derived from row indexes.
  React.useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const measure = () => {
      const box = plot.getBoundingClientRect();
      setPlotWidth(box.width);
      if (handoffs.length === 0) {
        setPaths([]);
        return;
      }
      const rect = (id: string) =>
        plot
          .querySelector<HTMLElement>(
            `[data-timeline-item="${CSS.escape(id)}"]`,
          )
          ?.getBoundingClientRect();
      const next: string[] = [];
      for (const { from, to } of handoffs) {
        const a = rect(from);
        const b = rect(to);
        if (!a || !b) continue;
        const x1 = a.right - box.left;
        const y1 = a.top + a.height / 2 - box.top;
        const x2 = b.left - box.left;
        const y2 = b.top + b.height / 2 - box.top;
        const xm = x2 > x1 + 8 ? x1 + Math.min(16, (x2 - x1) / 2) : x1 + 8;
        next.push(`M ${x1} ${y1} H ${xm} V ${y2} H ${x2}`);
      }
      setPaths(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    return () => observer.disconnect();
  }, [handoffs, items, domain]);

  const present = STATUS_ORDER.filter((status) =>
    items.some((item) => item.status === status),
  );

  return (
    <div className={sx(styles.root)}>
      {summary == null ? null : (
        <div className={sx(styles.summary)}>{summary}</div>
      )}
      {/* Below ~32rem the lanes scroll rather than squeezing every bar shut. */}
      <div className={sx(styles.scroller)}>
        <div
          aria-label={label}
          aria-roledescription={i18n.t("ui:timeline.roleDescription")}
          className={sx(styles.plot, focusRing.ring)}
          data-timeline=""
          data-timeline-variant="lanes"
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onPointerLeave={() => onHover(null)}
          ref={plotRef}
          role="group"
          tabIndex={0}
        >
          <span aria-hidden />
          <div aria-hidden className={sx(styles.axis)}>
            {shownTicks.map((tick) => (
              <span
                className={sx(styles.tick)}
                key={tick.at}
                style={{ insetInlineStart: at(tick.at) }}
              >
                {tick.label}
              </span>
            ))}
            {nowShown ? (
              <span
                className={sx(styles.nowTag)}
                data-timeline-now=""
                style={{ insetInlineStart: at(now) }}
              >
                {nowLabel}
              </span>
            ) : null}
          </div>
          {rows.map((row) => (
            <React.Fragment key={row.id}>
              <div aria-hidden className={sx(styles.who)}>
                {row.leading == null ? null : (
                  <span className={sx(styles.tile)}>{row.leading}</span>
                )}
                <span className={sx(styles.whoText)}>
                  <span className={sx(styles.whoName)}>
                    <span className={sx(styles.ellipsis)}>{row.label}</span>
                    {row.status}
                  </span>
                  {row.meta == null ? null : (
                    <span className={sx(styles.whoMeta)}>{row.meta}</span>
                  )}
                </span>
              </div>
              <div aria-hidden className={sx(styles.lane)}>
                {ticks.map((tick) => (
                  <span
                    className={sx(timeAxisStyles.gridLine)}
                    key={tick.at}
                    style={{ insetInlineStart: at(tick.at) }}
                  />
                ))}
                {items.map((item, index) => {
                  if ((item.row ?? item.label) !== row.id) return null;
                  const status = item.status ?? "done";
                  return (
                    <span
                      className={sx(
                        styles.bar,
                        barStatusStyles[status],
                        (activeIndex === index || selectedItemId === item.id) &&
                          dataMark.selectedCurrent,
                        onSelectItem != null && styles.clickable,
                        // A chart's marks never draw in or tween to a new
                        // span (`Charts.config.ts`, "Entrance motion"): the
                        // plot fades in once and later changes are immediate.
                        // Only a running bar loops: it breathes in place
                        // (the live breath), nothing travels across it.
                        status === "running" && liveBreath.mark,
                      )}
                      data-timeline-item={item.id}
                      data-timeline-status={status}
                      key={item.id}
                      onClick={
                        onSelectItem ? () => onSelectItem(item.id) : undefined
                      }
                      onPointerEnter={() => onHover(index)}
                      style={{
                        inlineSize: `max(24px, ${percentOf(item.end, domain) - percentOf(item.start, domain)}%)`,
                        insetInlineStart: at(item.start),
                      }}
                      title={describe(index)}
                    >
                      <AgentGlyphSwap swapKey={status}>
                        <StatusGlyph status={status} />
                      </AgentGlyphSwap>
                      <span className={sx(styles.ellipsis)}>{item.label}</span>
                      {item.meta ? (
                        <span className={sx(styles.barMeta)}>{item.meta}</span>
                      ) : null}
                    </span>
                  );
                })}
                {nowShown ? (
                  <span
                    className={sx(timeAxisStyles.nowRule, styles.now)}
                    style={{ insetInlineStart: at(now) }}
                  />
                ) : null}
              </div>
            </React.Fragment>
          ))}
          {paths.length ? (
            <svg aria-hidden className={sx(styles.handoffs)}>
              {paths.map((d) => (
                <path
                  d={d}
                  fill="none"
                  key={d}
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                />
              ))}
            </svg>
          ) : null}
          <VisuallyHidden aria-live="polite" data-chart-readout="">
            {activeIndex != null ? describe(activeIndex) : ""}
          </VisuallyHidden>
        </div>
      </div>
      {notice == null ? null : (
        <div className={sx(styles.notice)}>{notice}</div>
      )}
      <div className={sx(styles.footer)}>
        <span aria-hidden className={sx(styles.legend)}>
          {present.map((status) => (
            <span className={sx(styles.legendItem)} key={status}>
              <span className={sx(styles.swatch, barStatusStyles[status])} />
              {statusLabels[status]}
            </span>
          ))}
          {handoffs.length ? (
            <span className={sx(styles.legendItem)}>
              <span className={sx(styles.handoffSwatch)} />
              {handoffLabel}
            </span>
          ) : null}
        </span>
        {footerTrail == null ? null : (
          <span className={sx(styles.footerTrail)}>{footerTrail}</span>
        )}
      </div>
    </div>
  );
}

function StatusGlyph({ status }: { status: TimelineItemStatus }) {
  if (status === "running")
    return (
      <Loader
        aria-hidden
        label={i18n.t("ui:timeline.status.running")}
        size="sm"
        tone="inherit"
      />
    );
  const Icon = status === "done" ? Check : status === "failed" ? X : Flag;
  return (
    <Icon
      aria-hidden
      className={sx(styles.glyph)}
      size={12}
      strokeWidth={2.25}
    />
  );
}
