import * as stylex from "@stylexjs/stylex";
import { useEffect, useState, useSyncExternalStore } from "react";

import { metric } from "../recipes/metric";
import { vars } from "../tokens/tokens.stylex";
import { themeSlotProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import { Badge } from "./Badge";
import type { ChartFreshness, ChartHeadline } from "./Charts.options";
import { getIntlLocale, i18n } from "@/i18n";
import { formatTimeAgo } from "@/i18n/format";
import { RelativeTime } from "./RelativeTime";
import { Skeleton } from "./Skeleton";
import { SKELETON_ARRIVE_CLASS, useSkeletonArrival } from "./Skeleton.motion";

/**
 * The point a following headline shows instead of its own figure. `note` says
 * what kind of reading it is when that is not a final one ("In progress",
 * "Projected"), so the card's largest number never loses that context.
 */
export type ChartHeadlineMoment = {
  label: string;
  note?: string;
  value: number | null;
};

/**
 * The active point, held outside React state: the chart writes it on every
 * hovered or keyboard-active point and only the readout re-renders. Keeping it
 * out of the chart's state is what stops a scrub from rebuilding the plot.
 */
export type ChartMomentStore = {
  get: () => ChartHeadlineMoment | null;
  set: (moment: ChartHeadlineMoment | null) => void;
  subscribe: (listener: () => void) => () => void;
};

function createMomentStore(): ChartMomentStore {
  let current: ChartHeadlineMoment | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (moment) => {
      if (
        moment === current ||
        (moment &&
          current &&
          moment.label === current.label &&
          moment.value === current.value &&
          moment.note === current.note)
      )
        return;
      current = moment;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One store per chart instance. */
export function useMomentStore() {
  const [store] = useState(createMomentStore);
  return store;
}

const noMoment = () => null;
const noSubscription = () => () => {};

/**
 * `headline`: the card's figure under its title. While a point is active it
 * shows that point's value and label, and the delta steps aside — a hovered
 * reading is never paired with the period's change. A following headline
 * always keeps its caption line, so the plot below never moves on hover.
 */
export function ChartHeadlineReadout({
  formatValue,
  headline,
  loading = false,
  store,
}: {
  formatValue: (value: number) => string;
  headline: ChartHeadline;
  /** The data is in flight: hold the figure's place with a skeleton. */
  loading?: boolean;
  store?: ChartMomentStore | null;
}) {
  const follows = store != null && headline.follow !== false;
  const moment = useSyncExternalStore(
    follows ? store.subscribe : noSubscription,
    follows ? store.get : noMoment,
    noMoment,
  );
  const scrubbing = moment != null;
  const arriving = useSkeletonArrival(loading);
  const tone = headline.deltaTone ?? "neutral";
  const caption = scrubbing
    ? moment.note
      ? `${moment.label} · ${moment.note}`
      : moment.label
    : headline.caption;
  return (
    <div className={sx(styles.root)} data-chart-headline="">
      <div className={sx(styles.figureRow)}>
        {loading ? (
          // The figure's own type around a text skeleton: the row keeps the
          // value's line box (a fixed 28px bar left it 3-4px short).
          <span className={sx(metric.display, styles.value)}>
            <Skeleton as="span" variant="text" width="3.5em" />
          </span>
        ) : (
          <span
            className={cx(
              sx(metric.display, styles.value),
              arriving && SKELETON_ARRIVE_CLASS,
            )}
            data-chart-headline-value=""
            {...themeSlotProps("chart", "value")}
          >
            {scrubbing
              ? moment.value == null
                ? "—"
                : formatValue(moment.value)
              : headline.value}
          </span>
        )}
        {headline.delta != null && loading ? (
          <Skeleton as="span" variant="chip" width="3em" />
        ) : null}
        {headline.delta != null && !scrubbing && !loading ? (
          <Badge
            className={arriving ? SKELETON_ARRIVE_CLASS : undefined}
            tone={tone}
            variant={tone === "neutral" ? "outlined" : "soft"}
          >
            {headline.delta}
          </Badge>
        ) : null}
      </div>
      {caption != null || follows ? (
        <span
          className={sx(styles.caption)}
          data-chart-headline-moment={scrubbing ? "" : undefined}
        >
          {caption ?? " "}
        </span>
      ) : null}
    </div>
  );
}

/**
 * `PieChart centerTotal`: the total in the donut's hole, swapped for a slice's
 * value and label while that slice is hovered (the same store the headline
 * uses, so only this readout re-renders).
 */
export function DonutCenter({
  caption,
  formatValue,
  store,
  total,
}: {
  caption: string;
  formatValue: (value: number) => string;
  store: ChartMomentStore;
  total: number;
}) {
  const moment = useSyncExternalStore(store.subscribe, store.get, noMoment);
  return (
    <div className={sx(styles.center)} data-chart-donut-center="">
      <span className={sx(metric.display, styles.centerValue)}>
        {moment
          ? moment.value == null
            ? "—"
            : formatValue(moment.value)
          : formatValue(total)}
      </span>
      <span className={sx(styles.caption)}>
        {moment ? moment.label : caption}
      </span>
    </div>
  );
}

const styles = stylex.create({
  root: { display: "grid", gap: vars["--aui-space-2"] },
  figureRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    minBlockSize: "1.75rem",
  },
  // The display number (`metric.display`, composed at the call sites): tabular
  // digits, so the figure holds still while the pointer scrubs it, and no
  // tracking (the -0.01em here was the last one on a number; §5 retired it).
  value: {
    color: vars["--aui-color-text"],
  },
  center: {
    alignItems: "center",
    display: "grid",
    justifyItems: "center",
    maxInlineSize: "60%",
    textAlign: "center",
  },
  // A donut's centre figure is the chart's headline: `metric.display`, at the
  // call site (20px until 2026-11-16).
  centerValue: {
    color: vars["--aui-color-text"],
  },
  caption: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

/**
 * `freshness`: when the data was last updated, in the header's quiet ink, and
 * a warning badge once it is older than `staleAfter`. The age is computed at
 * render, so a chart that re-renders on new data keeps it current.
 */
export function ChartFreshnessNote({
  freshness,
}: {
  freshness: ChartFreshness;
}) {
  const at = new Date(freshness.updatedAt);
  // Its own clock: the age and the Stale badge advance even when no new data
  // arrives — a stopped feed is exactly what this note exists to reveal.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const updated = new Date(freshness.updatedAt).getTime();
    const untilStale =
      freshness.staleAfter == null
        ? Number.POSITIVE_INFINITY
        : updated + freshness.staleAfter - Date.now();
    const stale =
      untilStale > 0 && Number.isFinite(untilStale)
        ? setTimeout(() => setNow(Date.now()), untilStale + 50)
        : undefined;
    return () => {
      clearInterval(tick);
      if (stale) clearTimeout(stale);
    };
  }, [freshness.updatedAt, freshness.staleAfter]);
  const age = now - at.getTime();
  const stale =
    freshness.staleAfter != null &&
    Number.isFinite(age) &&
    age > freshness.staleAfter;
  return (
    <span
      className={sx(freshStyles.note)}
      data-chart-freshness={stale ? "stale" : "fresh"}
    >
      {stale ? (
        <Badge tone="warning" variant="soft">
          {i18n.t("ui:chart.stale")}
        </Badge>
      ) : null}
      <span>
        {/* One phrase: the time is a word in it, so it keeps the text face. */}
        {i18n.t("ui:chart.updated")}{" "}
        <RelativeTime
          date={at}
          formatRelative={formatTimeAgo}
          locale={getIntlLocale()}
          now={new Date(now)}
          utcLabel={i18n.t("common:time.utc")}
        />
      </span>
    </span>
  );
}

const freshStyles = stylex.create({
  note: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    lineHeight: vars["--aui-line-height-caption"],
    whiteSpace: "nowrap",
  },
});
