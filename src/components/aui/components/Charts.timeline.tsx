import { useState } from "react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { dataMark } from "../recipes/data-mark";
import { focusRing } from "../recipes/focus-ring";
import { vars } from "../tokens/tokens.stylex";
import { percentOf } from "../utils/chart-math";
import { useElementWidth } from "../utils/element-width";
import { timeAxisStyles } from "./Charts.timeAxis.styles";
import { styles } from "./Charts.timeline.styles";
import {
  TIMELINE_DAY_MS,
  toneInk,
  TONE_WORD,
  ms,
  dayFormat,
  inTimeDomain,
  stepTicks,
  thinTicks,
  timeFormat,
  timeTicks,
  duration,
  type TimelineTone,
} from "./Charts.timeline.utils";
import { sx } from "../utils/stylex";
import { ChartCard } from "./Charts.card";
import {
  chartOtherLabel,
  chartPalette,
  CHART_PALETTE_SIZE,
} from "./Charts.config";
import type { ChartFrameProps } from "./Charts.states";
import {
  TIMELINE_STATUS_WORD,
  TimelineLanes,
  type TimelineHandoff,
  type TimelineItemStatus,
  type TimelineRow,
} from "./Charts.timelineLanes";
import { VisuallyHidden } from "./VisuallyHidden";

export type {
  TimelineHandoff,
  TimelineItemStatus,
  TimelineRow,
} from "./Charts.timelineLanes";

export type { TimelineTone } from "./Charts.timeline.utils";

/** One bar on the time axis: a task, an incident window, a job run. */
export type TimelineItem = {
  /** Identity color group (a team, a workstream); takes a palette slot. */
  group?: string;
  id: string;
  label: string;
  /** Lanes: a short machine value at the bar's end ("2/4"). */ meta?: string;
  /** Lanes: what the task is doing — tone, glyph, legend word. */ status?: TimelineItemStatus;
  /** Completed share 0–1, drawn as a darker fill inside the bar. */
  progress?: number;
  /** Row the bar sits on; defaults to one row per item. */
  row?: string;
  /** A status instead of a group color (blocked, done). Wins over `group`. */
  tone?: TimelineTone;
  /** ISO date/datetime, epoch ms, or Date. */
  end: Date | number | string;
  start: Date | number | string;
};

export type TimelineChartProps = Omit<ChartFrameProps, "height"> & {
  /** Header controls beside the title, e.g. a window toggle. */
  actions?: React.ReactNode;
  /** Lanes variant: trailing footer content, e.g. a keyboard hint. */
  footerTrail?: React.ReactNode;
  /** Lanes variant: dashed hand-offs from one bar's end to another's start. */
  handoffs?: readonly TimelineHandoff[];
  /** Lanes variant: content between the plot and the legend, e.g. an attention notice. */
  notice?: React.ReactNode;
  /** Lanes variant: rich lane labels, matched to `TimelineItem.row` by `id`. */
  rows?: readonly TimelineRow[];
  /** Lanes variant: the bar drawn with the selection ring. */
  selectedItemId?: string;
  /** Lanes variant: legend words per status, and the hand-off and now words. */
  statusLabels?: Partial<
    Record<TimelineItemStatus | "handoff" | "now", string>
  >;
  /** Lanes variant: a summary line above the plot, e.g. counts per state. */
  summary?: React.ReactNode;
  /** Lanes variant: milliseconds between ticks (default: the bars' day/hour ticks). */
  tickEvery?: number;
  /** Lanes variant: tick words, e.g. "−20m" relative to `now`. */
  tickFormat?: (at: number) => string;
  /**
   * `lanes` (P2 agent-lanes) draws one lane per row with labelled status
   * bars, the axis on top and a "now" tag. @default "bars"
   */
  variant?: "bars" | "lanes";
  /** Axis range; defaults to the items' extent. */
  from?: Date | number | string;
  items: TimelineItem[];
  /** "Now" rule; `true` uses the current time. */
  now?: Date | number | string | boolean;
  onSelectItem?: (item: TimelineItem) => void;
  /** Row label column width in px. @default 140 */
  rowLabelWidth?: number;
  to?: Date | number | string;
};

/**
 * Bars on a time axis — a roadmap, incident windows, job runs, a launch
 * plan. Each bar is an item's start → end on its row; a group takes a palette
 * slot and a `tone` marks status. An optional "now" rule and a progress fill
 * show where a plan stands. Arrow keys move between items; the readout states
 * the item's dates and duration; the table twin lists every item.
 *
 * For traces inside one request use `TraceWaterfall`; for a single
 * lifecycle, `StateTimeline`.
 */
export function TimelineChart({
  actions,
  className,
  footerTrail,
  handoffs,
  notice,
  rows: laneRows,
  selectedItemId,
  statusLabels,
  summary,
  tickEvery,
  tickFormat,
  variant = "bars",
  description,
  empty,
  from,
  icon,
  id,
  items,
  now,
  onSelectItem,
  rowLabelWidth = 140,
  style,
  title,
  to,
  xstyle,
  ...state
}: TimelineChartProps) {
  useTranslation();
  const otherLabel = chartOtherLabel();
  const fallbackLabel = i18n.t("ui:timeline.label");
  const [active, setActive] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const valid = items.filter(
    (item) => Number.isFinite(ms(item.start)) && Number.isFinite(ms(item.end)),
  );
  const starts = valid.map((item) => ms(item.start));
  const ends = valid.map((item) => ms(item.end));
  const lo = from != null ? ms(from) : Math.min(...starts);
  const hi = to != null ? ms(to) : Math.max(...ends);
  const domain: [number, number] = [lo, hi > lo ? hi : lo + TIMELINE_DAY_MS];
  const rows: string[] = [];
  for (const item of valid) {
    const row = item.row ?? item.label;
    if (!rows.includes(row)) rows.push(row);
  }
  const groups: string[] = [];
  for (const item of valid)
    if (item.group && !groups.includes(item.group)) groups.push(item.group);
  // A toned item is drawn in its status ink, so only groups that are drawn in
  // their own ink are named in the legend.
  const tones = (
    ["danger", "warning", "info", "success", "neutral"] as const
  ).filter((tone) => valid.some((item) => item.tone === tone));
  const drawnGroups = groups.filter((group) =>
    valid.some((item) => item.group === group && !item.tone),
  );
  const kept = groups.slice(
    0,
    groups.length > CHART_PALETTE_SIZE
      ? CHART_PALETTE_SIZE - 1
      : CHART_PALETTE_SIZE,
  );
  const inkOf = (item: TimelineItem) => {
    if (item.tone) return toneInk[item.tone];
    if (!item.group) return chartPalette[0]!;
    const slot = kept.indexOf(item.group);
    return slot === -1 ? vars["--aui-color-text-subtle"] : chartPalette[slot]!;
  };
  const nowAt = now === true ? Date.now() : now ? ms(now) : null;
  const describe = (index: number) => {
    const item = valid[index]!;
    const s = ms(item.start);
    const e = ms(item.end);
    const fmt =
      e - s < TIMELINE_DAY_MS
        ? (t: number) => `${dayFormat.format(t)} ${timeFormat.format(t)}`
        : (t: number) => dayFormat.format(t);
    return [
      item.label,
      item.group,
      `${fmt(s)} – ${fmt(e)}`,
      duration(e - s),
      typeof item.progress === "number"
        ? `${Math.round(item.progress * 100)}% done`
        : null,
      item.tone && item.tone !== "neutral" ? item.tone : null,
      item.status
        ? (statusLabels?.[item.status] ?? TIMELINE_STATUS_WORD[item.status])
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = valid.length - 1;
    let next: number | null | undefined;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = active == null ? 0 : Math.min(last, active + 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = active == null ? last : Math.max(0, active - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (
      (event.key === "Enter" || event.key === " ") &&
      active != null &&
      onSelectItem
    ) {
      event.preventDefault();
      onSelectItem(valid[active]!);
      return;
    } else if (event.key === "Escape" && active != null) next = null;
    else return;
    event.preventDefault();
    setActive(next);
  };
  const shown = hover ?? active;
  const [trackRef, trackWidth] = useElementWidth<HTMLDivElement>(600);
  // Keep every nth tick so labels never collide: ~72px per label.
  const plotWidth = Math.max(60, trackWidth - rowLabelWidth);
  const ticks = thinTicks(timeTicks(domain[0], domain[1]), 72, plotWidth);
  const table = {
    columns: [
      i18n.t("ui:timeline.column.item"),
      i18n.t("ui:timeline.column.row"),
      i18n.t("ui:timeline.column.start"),
      i18n.t("ui:timeline.column.end"),
      i18n.t("ui:timeline.column.duration"),
    ],
    rows: valid.map((item) => [
      item.label,
      item.row ?? item.label,
      new Date(ms(item.start)).toISOString().slice(0, 16).replace("T", " "),
      new Date(ms(item.end)).toISOString().slice(0, 16).replace("T", " "),
      duration(ms(item.end) - ms(item.start)),
    ]),
  };
  if (variant === "lanes") {
    const laneTicks: Array<{ at: number; label: string }> =
      tickEvery != null && tickEvery > 0
        ? stepTicks(domain[0], domain[1], tickEvery).map((t) => ({
            at: t,
            label: tickFormat ? tickFormat(t) : timeFormat.format(t),
          }))
        : ticks.map((tick) => ({
            at: tick.at,
            label: tickFormat ? tickFormat(tick.at) : tick.label,
          }));
    const items = valid.map((item) => ({
      end: ms(item.end),
      id: item.id,
      label: item.label,
      meta: item.meta,
      row: item.row,
      start: ms(item.start),
      status: item.status,
    }));
    const select = onSelectItem
      ? (itemId: string) =>
          valid.filter((item) => item.id === itemId).forEach(onSelectItem)
      : undefined;
    return (
      <ChartCard
        {...state}
        actions={actions}
        className={className}
        description={description}
        descriptionPlacement="inline"
        empty={empty ?? valid.length === 0}
        icon={icon}
        id={id}
        style={style}
        table={table}
        title={title}
        xstyle={xstyle}
      >
        <TimelineLanes
          activeIndex={active}
          describe={describe}
          domain={domain}
          footerTrail={footerTrail}
          handoffLabel={
            statusLabels?.handoff ?? i18n.t("ui:timeline.handoff")
          }
          handoffs={handoffs ?? []}
          items={items}
          label={typeof title === "string" ? title : fallbackLabel}
          notice={notice}
          now={nowAt}
          nowLabel={statusLabels?.now ?? i18n.t("ui:timeline.now")}
          onBlur={() => setActive(null)}
          onHover={setHover}
          onKeyDown={onKeyDown}
          onSelectItem={select}
          rows={laneRows ?? rows.map((row) => ({ id: row, label: row }))}
          selectedItemId={selectedItemId}
          statusLabels={{ ...TIMELINE_STATUS_WORD, ...statusLabels }}
          summary={summary}
          ticks={laneTicks}
        />
      </ChartCard>
    );
  }
  return (
    <ChartCard
      {...state}
      actions={actions}
      className={className}
      description={description}
      empty={empty ?? valid.length === 0}
      icon={icon}
      id={id}
      style={style}
      table={table}
      title={title}
      xstyle={xstyle}
    >
      <div className={sx(styles.body)} ref={trackRef}>
        <div
          aria-label={typeof title === "string" ? title : fallbackLabel}
          aria-roledescription={i18n.t("ui:timeline.roleDescription")}
          className={sx(styles.grid, focusRing.ring)}
          data-timeline=""
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setHover(null)}
          role="group"
          style={{
            gridTemplateColumns: `minmax(0, ${rowLabelWidth}px) minmax(0, 1fr)`,
          }}
          tabIndex={0}
        >
          {rows.map((row) => (
            <div aria-hidden className={sx(styles.row)} key={row}>
              <span className={sx(styles.rowLabel)} title={row}>
                {row}
              </span>
              <span className={sx(styles.track)}>
                {ticks.map((tick) => (
                  <span
                    className={sx(timeAxisStyles.gridLine)}
                    key={tick.at}
                    style={{
                      insetInlineStart: `${percentOf(tick.at, domain)}%`,
                    }}
                  />
                ))}
                {valid.map((item, index) =>
                  (item.row ?? item.label) !== row ? null : (
                    <span
                      className={sx(
                        styles.bar,
                        shown === index && dataMark.selected,
                        onSelectItem != null && styles.clickable,
                      )}
                      data-timeline-item={item.id}
                      key={item.id}
                      onClick={
                        onSelectItem ? () => onSelectItem(item) : undefined
                      }
                      onPointerEnter={() => setHover(index)}
                      style={{
                        backgroundColor: `color-mix(in oklab, ${inkOf(item)} 38%, ${vars["--aui-color-surface-raised"]})`,
                        borderInlineStartColor: inkOf(item),
                        inlineSize: `max(4px, ${percentOf(ms(item.end), domain) - percentOf(ms(item.start), domain)}%)`,
                        insetInlineStart: `${percentOf(ms(item.start), domain)}%`,
                      }}
                      title={describe(index)}
                    >
                      {typeof item.progress === "number" ? (
                        <span
                          className={sx(styles.progress)}
                          style={{
                            backgroundColor: inkOf(item),
                            inlineSize: `${Math.max(0, Math.min(1, item.progress)) * 100}%`,
                          }}
                        />
                      ) : null}
                      {item.row != null && item.row !== item.label ? (
                        <span className={sx(styles.barLabel)}>
                          {item.label}
                        </span>
                      ) : null}
                    </span>
                  ),
                )}
                {inTimeDomain(nowAt, domain) ? (
                  <span
                    className={sx(timeAxisStyles.nowRule, styles.now)}
                    data-timeline-now=""
                    style={{ insetInlineStart: `${percentOf(nowAt, domain)}%` }}
                  />
                ) : null}
              </span>
            </div>
          ))}
          <div aria-hidden className={sx(styles.row)}>
            <span />
            <span className={sx(styles.ticks)}>
              {ticks.map((tick, index) => (
                <span
                  className={sx(styles.tick)}
                  key={tick.at}
                  style={
                    // A label that would run past the plot's end (≈6.5px a
                    // glyph at 11px) is end-anchored instead of clipped
                    // ("Dec 202" at 390px).
                    index === ticks.length - 1 &&
                    (percentOf(tick.at, domain) / 100) * plotWidth +
                      tick.label.length * 6.5 >
                      plotWidth
                      ? { insetInlineEnd: 0 }
                      : { insetInlineStart: `${percentOf(tick.at, domain)}%` }
                  }
                >
                  {tick.label}
                </span>
              ))}
            </span>
          </div>
          <VisuallyHidden aria-live="polite" data-chart-readout="">
            {active != null ? describe(active) : ""}
          </VisuallyHidden>
        </div>
        <div aria-hidden className={sx(styles.footer)}>
          <span className={sx(styles.readout)} data-timeline-readout="">
            {shown != null ? describe(shown) : "\u00a0"}
          </span>
          {drawnGroups.length || tones.length ? (
            <span className={sx(styles.legend)}>
              {[
                ...kept.filter((group) => drawnGroups.includes(group)),
                ...(drawnGroups.some((group) => !kept.includes(group))
                  ? [otherLabel]
                  : []),
              ].map((group) => (
                <span className={sx(styles.legendItem)} key={group}>
                  <span
                    className={sx(styles.swatch)}
                    style={{
                      backgroundColor:
                        group === otherLabel
                          ? vars["--aui-color-text-subtle"]
                          : chartPalette[kept.indexOf(group)],
                    }}
                  />
                  {group}
                </span>
              ))}
              {tones.map((tone) => (
                <span
                  className={sx(styles.legendItem)}
                  data-timeline-tone={tone}
                  key={tone}
                >
                  <span
                    className={sx(styles.swatch)}
                    style={{ backgroundColor: toneInk[tone] }}
                  />
                  {TONE_WORD[tone]}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </ChartCard>
  );
}
