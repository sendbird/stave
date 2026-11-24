import { useEffect, useRef } from "react";
import { movingAverage, outsideRange } from "../utils/chart-transform";
import { selectHandler } from "./Charts.axes";
import {
  formatDelta,
  keyboardByDefault,
  useChartExplorer,
} from "./Charts.explore";
import { formatChartReadout } from "./Charts.format";
import { useMomentStore } from "./Charts.headline";
import type { ChartActivePoint } from "./Charts.options";
import type { CartesianChartProps } from "./Charts.props";
import { AVERAGE_KEY } from "./Charts.cartesian.marks";
import {
  COMPARISON_KEY,
  comparisonLabel,
  PROJECTED_KEY,
  projectionIndex,
  withComparison,
  withProjection,
} from "./Charts.reference";
import type { ChartTable } from "./Charts.states";
import { logAxis, logSafe, resolveTimeAxis, spanLabelsAt } from "./Charts.time";

export { usePreparedInput, windowed } from "./Charts.cartesian.prepare";

/*
 * The shared engine of the single-series cartesian forms (`AreaChart`,
 * `LineChart`, `BarChart`): rows, table, explorer and the active-point report
 * (input preparation is `Charts.cartesian.prepare.ts`; marks are
 * `Charts.cartesian.marks.tsx`). Split out of `Charts.basic.tsx` on 2026-11-02 so the opt-in
 * capabilities could join without growing that file past the size ceiling.
 * With none of those options set, every function here returns what the
 * previous inline code did.
 */

type Kind = "area" | "bar" | "line";

/** The observed/unfinished split: `projectedFrom` wins, else `partialFrom`. */
function splitOf(props: CartesianChartProps) {
  const projected = projectionIndex(props.data, props.projectedFrom);
  if (projected != null || props.partialFrom == null) {
    return { split: projected, unfinished: "Projected" as const };
  }
  const first =
    typeof props.partialFrom === "number"
      ? Math.floor(props.partialFrom)
      : props.data.findIndex((point) => point.label === props.partialFrom);
  // -1: the whole visible series is still being counted.
  const split = first >= 0 && first < props.data.length ? first - 1 : null;
  return { split, unfinished: "In progress" as const };
}

/** Everything the three forms share: rows, table, explorer, tooltip reading. */
export function useCartesianChart(
  props: CartesianChartProps,
  { kind }: { kind: Kind },
) {
  const comparable = kind !== "bar";
  const { comparison, data, formatValue, tooltip } = props;
  const keyboard = props.keyboard ?? keyboardByDefault(props.title);
  const read = formatValue ?? formatChartReadout;
  const overlay = comparable ? comparison : undefined;
  const { split, unfinished } = splitOf(props);
  const projected = (index: number) => split != null && index > split;
  const log = comparable && props.valueScale === "log";
  // The table, readout and reports keep every true value; only the plotted
  // rows drop what a log scale cannot draw.
  const merged = withComparison(data, overlay);
  const band = comparable ? props.range : undefined;
  const bandAt = (index: number) => {
    const b = band?.data[index];
    return b && typeof b.low === "number" && typeof b.high === "number"
      ? ([b.low, b.high] as [number, number])
      : null;
  };
  const bandName = band?.label ?? "Range";
  const averageSpec = comparable ? props.movingAverage : undefined;
  const averageWindow =
    typeof averageSpec === "object" ? averageSpec.window : averageSpec;
  // Unfinished or projected readings never feed the mean: a half-counted day
  // would drag the average down exactly where a reader looks.
  const averages = averageWindow
    ? movingAverage(
        data.map((point, index) => (projected(index) ? null : point.value)),
        averageWindow,
      )
    : null;
  const averageName =
    (typeof averageSpec === "object" && averageSpec.label) ||
    `${averageWindow}-point average`;
  const outside =
    comparable && props.markOutsideRange && band
      ? outsideRange(
          data.map((point) => point.value),
          band.data,
        )
      : null;
  const signed = comparable && props.signedFill ? (props.baseline ?? 0) : null;
  const sideOf = (value: number | null | undefined) =>
    typeof value !== "number" || signed == null
      ? null
      : value > signed
        ? "Above"
        : value < signed
          ? "Below"
          : "At";
  const spanLabels = spanLabelsAt(
    props.spans,
    data.map((point) => point.label),
    props.timeAxis && comparable
      ? data.map((point) =>
          typeof point.time === "number" ? point.time : null,
        )
      : undefined,
  );
  const time = comparable
    ? resolveTimeAxis(
        props.timeAxis,
        data.map((point) =>
          typeof point.time === "number" ? point.time : null,
        ),
      )
    : null;
  const plotted = withProjection(merged, split).map((row, index) => ({
    ...row,
    ...(band ? { range: bandAt(index) } : null),
    ...(averages ? { [AVERAGE_KEY]: averages[index] } : null),
  }));
  const rows = log
    ? plotted.map((row) => ({
        ...row,
        value: logSafe(row.value) as number,
        ...(PROJECTED_KEY in row
          ? { [PROJECTED_KEY]: logSafe(row[PROJECTED_KEY]) }
          : null),
        ...(COMPARISON_KEY in row
          ? { [COMPARISON_KEY]: logSafe(row[COMPARISON_KEY]) }
          : null),
        ...(AVERAGE_KEY in row
          ? {
              [AVERAGE_KEY]: logSafe(
                (row as Record<string, unknown>)[AVERAGE_KEY],
              ),
            }
          : null),
        ...(band
          ? {
              range:
                row.range && row.range[0] > 0 && row.range[1] > 0
                  ? row.range
                  : null,
            }
          : null),
      }))
    : plotted;
  const previousName = comparisonLabel(overlay);
  const kindOf = (index: number) =>
    projected(index) ? unfinished : "Observed";
  const table: ChartTable = {
    columns: [
      "Category",
      "Value",
      ...(overlay ? [previousName] : []),
      ...(band ? [bandName] : []),
      ...(averages ? [averageName] : []),
      ...(outside ? [`Outside ${bandName.toLowerCase()}`] : []),
      ...(signed != null ? [signed === 0 ? "Sign" : `vs ${read(signed)}`] : []),
      ...(spanLabels ? ["Period"] : []),
      ...(split != null ? ["Kind"] : []),
    ],
    rows: merged.map((row, index) => [
      row.label,
      row.value,
      ...(overlay
        ? [typeof row.previous === "number" ? row.previous : "—"]
        : []),
      ...(band
        ? [
            bandAt(index)
              ? `${read(bandAt(index)![0])} – ${read(bandAt(index)![1])}`
              : "—",
          ]
        : []),
      ...(averages ? [averages[index] ?? "—"] : []),
      ...(outside ? [outside[index] ? "Yes" : "—"] : []),
      ...(signed != null ? [sideOf(row.value) ?? "—"] : []),
      ...(spanLabels ? [spanLabels[index] ?? "—"] : []),
      ...(split != null ? [kindOf(index)] : []),
    ]),
  };
  const select = selectHandler(data, props.onSelectPoint);
  const explorer = useChartExplorer({
    count: data.length,
    onSelect: select.select,
    describe: (index) => {
      const row = merged[index]!;
      const parts = [
        `${row.label}: ${read(row.value)}${projected(index) ? ` (${unfinished.toLowerCase()})` : ""}`,
      ];
      const b = bandAt(index);
      if (b) parts.push(`${bandName} ${read(b[0])} to ${read(b[1])}`);
      if (outside?.[index]) parts.push(`outside ${bandName.toLowerCase()}`);
      const side = sideOf(row.value);
      if (side)
        parts.push(
          signed === 0
            ? `${side.toLowerCase()} zero`
            : `${side.toLowerCase()} ${read(signed!)}`,
        );
      if (spanLabels?.[index]) parts.push(`during ${spanLabels[index]}`);
      if (typeof averages?.[index] === "number")
        parts.push(`${averageName} ${read(averages[index]!)}`);
      if (typeof row.previous === "number") {
        parts.push(
          `${previousName} ${read(row.previous)}`,
          `change ${formatDelta(row.value, row.previous, read)}`,
        );
      }
      return parts.join(", ");
    },
    enabled: keyboard,
  });
  // A `headline` reads the same active point the tooltip does. The point goes
  // to a store the readout subscribes to, never to this hook's state, so a
  // scrub re-renders the figure only; it is tracked whenever a headline exists
  // (whether or not it follows) so toggling `follow` never shows a stale point.
  const momentStore = useMomentStore();
  const tracking = props.headline != null;
  // recharts reports a brushed chart's index within the visible window.
  const brushStart = useRef(
    typeof props.brush === "object" ? (props.brush.startIndex ?? 0) : 0,
  );
  const active = useActivePointReport(
    merged,
    tracking
      ? (point) => {
          momentStore.set(
            point && {
              label: point.label,
              note: projected(point.index) ? unfinished : undefined,
              value: point.value,
            },
          );
          props.onActivePointChange?.(point);
        }
      : props.onActivePointChange,
    explorer.activeIndex,
    props.brush ? () => brushStart.current : undefined,
  );
  const bodyOptions =
    overlay || split != null
      ? {
          ...tooltip,
          comparisonKey: overlay ? COMPARISON_KEY : undefined,
          projectedKey: split != null ? PROJECTED_KEY : undefined,
        }
      : tooltip;
  const values = rows.map((row) => row.value);
  // A log axis has to hold everything drawn on it, not only the observed run.
  const drawnValues = log
    ? rows.flatMap((row) => {
        const record = row as Record<string, unknown>;
        return [
          row.value,
          record[PROJECTED_KEY],
          record[COMPARISON_KEY],
          record[AVERAGE_KEY],
          ...(Array.isArray(row.range) ? row.range : []),
        ] as Array<number | null | undefined>;
      })
    : values;
  const axes = {
    activeIndex: explorer.activeIndex,
    annotations: props.annotations,
    bands: props.bands,
    brush: props.brush,
    labels: data.map((point) => point.label),
    onBrushChange: props.onBrushChange,
    onBrushRange: (startIndex: number) => {
      brushStart.current = startIndex;
    },
    spans: props.spans,
    time,
    times: time
      ? data.map((point) =>
          typeof point.time === "number" ? point.time : null,
        )
      : undefined,
    valueDomain: props.valueDomain,
    valueLog: log ? logAxis(drawnValues) : null,
    formatAxisValue: props.formatAxisValue,
    formatValue,
    referenceLines: props.referenceLines,
    renderTooltip: props.renderTooltip,
    tooltip: bodyOptions,
  };
  // Spread onto the recharts chart: onClick + a pointer cursor, or nothing;
  // plus the hover report when `onActivePointChange` is set.
  const { select: _select, ...clickable } = select;
  const chartSelect = { ...clickable, ...active };
  return {
    averageName,
    averages,
    momentStore: tracking ? momentStore : null,
    axes,
    band,
    bandName,
    chartSelect,
    explorer,
    outside,
    overlay,
    previousName,
    projected,
    rows,
    split,
    table,
    unfinished,
    values,
  };
}

/**
 * Reports the hovered or keyboard-active point to `onActivePointChange` when
 * it — or the value at it — changes. Pointer wins while it is over the plot;
 * leaving the plot falls back to the keyboard point, then to null. Returns the
 * recharts root handlers (empty without a callback).
 */
export function useActivePointReport(
  rows: ReadonlyArray<{ label: string; value?: number | null }>,
  onChange: ((point: ChartActivePoint | null) => void) | undefined,
  keyboardIndex: number | null,
  /** First visible index of a brushed chart (recharts indexes the window). */
  pointerOffset?: () => number,
) {
  const last = useRef<string | undefined>(undefined);
  const pointer = useRef<number | null>(null);
  const shown = useRef<number | null>(null);
  const report = (index: number | null) => {
    shown.current = index;
    if (!onChange) return;
    const row = index == null ? null : rows[index];
    const point = row
      ? {
          index: index!,
          label: row.label,
          value: typeof row.value === "number" ? row.value : null,
        }
      : null;
    const key = point
      ? `${point.index}\u0000${point.label}\u0000${point.value}`
      : "null";
    if (last.current === key) return;
    last.current = key;
    onChange(point);
  };
  const reportRef = useRef(report);
  reportRef.current = report;
  const keyboardRef = useRef(keyboardIndex);
  keyboardRef.current = keyboardIndex;
  useEffect(() => {
    if (pointer.current != null) return;
    if (keyboardIndex != null || last.current !== undefined)
      reportRef.current(keyboardIndex);
  }, [keyboardIndex]);
  // Live data can change the value under a point that stays active.
  useEffect(() => {
    if (last.current !== undefined && shown.current != null)
      reportRef.current(shown.current);
  });
  if (!onChange) return {};
  return {
    onMouseLeave: () => {
      pointer.current = null;
      report(keyboardRef.current);
    },
    onMouseMove: (state: { activeTooltipIndex?: unknown }) => {
      const raw = state?.activeTooltipIndex;
      const index = raw == null ? NaN : Number(raw) + (pointerOffset?.() ?? 0);
      if (Number.isInteger(index)) {
        pointer.current = index;
        report(index);
      }
    },
  };
}

/** The props a form forwards to `ChartFrame` (frame axis only). */
export function frameProps(props: CartesianChartProps) {
  const {
    bands: _bands,
    className,
    color: _color,
    comparison: _comparison,
    curve: _curve,
    data,
    description,
    dots: _dots,
    endLabel: _endLabel,
    formatAxisValue: _formatAxisValue,
    formatValue,
    height,
    highlightLabels: _highlightLabels,
    icon,
    id,
    keyboard: _keyboard,
    live: _live,
    markOutsideRange: _markOutsideRange,
    maxItems: _maxItems,
    maxPoints: _maxPoints,
    movingAverage: _movingAverage,
    onActivePointChange: _onActivePointChange,
    partialFrom: _partialFrom,
    paused,
    signedFill: _signedFill,
    spans: _spans,
    timeAxis: _timeAxis,
    valueScale: _valueScale,
    windowSize: _windowSize,
    annotations: _annotations,
    baseline: _baseline,
    brush: _brush,
    valueDomain: _valueDomain,
    onBrushChange: _onBrushChange,
    onSelectPoint: _onSelectPoint,
    projectedFrom: _projectedFrom,
    range: _range,
    referenceLines: _referenceLines,
    renderTooltip: _renderTooltip,
    style,
    syncId: _syncId,
    tableToggle,
    title,
    tooltip: _tooltip,
    xstyle,
    ...state
  } = props;
  return {
    ...state,
    className,
    description,
    empty: data.length === 0,
    // A streaming chart never performs: its data arrives continuously.
    entrance: _live ? false : state.entrance,
    formatValue,
    height,
    icon,
    id,
    ordered: true,
    paused,
    style,
    tableToggle,
    title,
    xstyle,
  };
}
