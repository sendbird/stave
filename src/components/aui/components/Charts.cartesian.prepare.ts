import { useMemo, useRef } from "react";

import { lttbIndices, toEpoch } from "../utils/chart-transform";
import { foldSeries } from "./Charts.axes";
import type { CartesianChartProps } from "./Charts.props";
import { withEpochTimes } from "./Charts.time";

/*
 * Input preparation for the single-series cartesian forms — pause, window,
 * time filter, fold and thin — split out of `Charts.cartesian.tsx` to keep
 * both under the size ceiling. With none of the options set, the input
 * passes through unchanged.
 */

type Kind = "area" | "bar" | "line";

/**
 * `paused`: the props (data and its position-aligned overlays) as they were
 * when pausing began. Unpaused, the live props pass straight through.
 */
function usePausedInput(input: CartesianChartProps): CartesianChartProps {
  const held = useRef(input);
  if (!input.paused) held.current = input;
  if (!input.paused) return input;
  const { comparison, data, partialFrom, projectedFrom, range } = held.current;
  return { ...input, comparison, data, partialFrom, projectedFrom, range };
}

/** The props with only the rows at `indices`, overlays and index refs kept aligned. */
function pick(
  props: CartesianChartProps,
  indices: number[],
): CartesianChartProps {
  const at = <T>(list: T[] | undefined) =>
    list ? indices.map((index) => list[index]!) : undefined;
  const remap = (ref: number | string | undefined, last: boolean) => {
    if (typeof ref !== "number") return ref;
    const position = last
      ? indices.reduce((found, index, k) => (index <= ref ? k : found), -1)
      : indices.findIndex((index) => index >= ref);
    return position < 0 ? undefined : position;
  };
  return {
    ...props,
    comparison: props.comparison
      ? { ...props.comparison, data: at(props.comparison.data)! }
      : undefined,
    data: indices.map((index) => props.data[index]!),
    partialFrom: remap(props.partialFrom, false),
    projectedFrom: remap(props.projectedFrom, true),
    range: props.range
      ? { ...props.range, data: at(props.range.data)! }
      : undefined,
  };
}

/** `windowSize`: the last N points of data and of the position-aligned overlays. */
export function windowed(props: CartesianChartProps): CartesianChartProps {
  const n = props.windowSize;
  if (!n || n <= 0 || props.data.length <= n) return props;
  const start = props.data.length - n;
  const cut = <T>(list: T[] | undefined) => list?.slice(start, start + n);
  return {
    ...props,
    comparison: props.comparison
      ? { ...props.comparison, data: cut(props.comparison.data)! }
      : undefined,
    data: props.data.slice(start),
    // An unfinished stretch that began before the window covers all of it.
    partialFrom:
      typeof props.partialFrom === "number"
        ? Math.max(0, props.partialFrom - start)
        : props.partialFrom,
    projectedFrom:
      typeof props.projectedFrom === "number"
        ? props.projectedFrom - start
        : props.projectedFrom,
    range: props.range
      ? { ...props.range, data: cut(props.range.data)! }
      : undefined,
  };
}

/** A category ref (label or index) as a whole index into `data`, or null when it names nothing. */
export function refIndex(
  ref: number | string | undefined,
  data: ReadonlyArray<{ label: string }>,
): number | null {
  if (ref == null) return null;
  const index =
    typeof ref === "number"
      ? Math.floor(ref)
      : data.findIndex((point) => point.label === ref);
  return Number.isFinite(index) && index >= 0 && index < data.length
    ? index
    : null;
}

/**
 * Every input transform, in order: pause → window → time filter → fold
 * (bars) → thin. Hook (pause holds a ref); call it once at the top of a form.
 * The transforms are memoised on the inputs they read, so a parent re-render
 * (a linked StatTile, a keyboard step) does not re-thin thousands of points.
 */
export function usePreparedInput(
  input: CartesianChartProps,
  kind: Kind,
): CartesianChartProps {
  const held = usePausedInput(input);
  const {
    comparison,
    data,
    maxItems,
    maxPoints,
    partialFrom,
    projectedFrom,
    range,
    timeAxis,
    windowSize,
  } = held;
  const prepared = useMemo(() => {
    let props: CartesianChartProps = { ...held };
    // A partial label is resolved before rows are dropped or thinned, so the
    // unfinished stretch survives a window, a time filter and LTTB.
    if (typeof props.partialFrom === "string") {
      const index = refIndex(props.partialFrom, props.data);
      props = { ...props, partialFrom: index ?? undefined };
    }
    props = windowed(props);
    if (props.timeAxis && kind !== "bar") {
      const timed = withEpochTimes(
        props.data.map((point, index) => ({ ...point, __index: index })),
      );
      if (timed.length !== props.data.length)
        props = pick(
          props,
          timed.map((row) => row.__index),
        );
      props = {
        ...props,
        data: props.data.map((point) => ({
          ...point,
          time: toEpoch(point.time)!,
        })),
      };
    }
    if (
      kind === "bar" &&
      props.maxItems &&
      props.data.length > props.maxItems
    ) {
      props = { ...props, data: foldSeries(props.data, props.maxItems) };
    }
    if (props.maxPoints && props.data.length > props.maxPoints) {
      // Boundaries are kept so the observed/unfinished hand-over survives; the
      // budget they take comes out of LTTB's, so the total stays at maxPoints.
      const boundaries = [
        refIndex(props.projectedFrom, props.data),
        refIndex(props.partialFrom, props.data),
      ].filter((index): index is number => index != null);
      const budget = Math.max(2, props.maxPoints - boundaries.length);
      const keep = new Set([
        ...lttbIndices(
          props.data.map((point) => point.value),
          budget,
        ),
        ...boundaries,
      ]);
      props = pick(
        props,
        [...keep].sort((a, b) => a - b),
      );
    }
    return {
      comparison: props.comparison,
      data: props.data,
      partialFrom: props.partialFrom,
      projectedFrom: props.projectedFrom,
      range: props.range,
    };
    // `held` is read only for the fields listed; the rest pass through below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    comparison,
    data,
    kind,
    maxItems,
    maxPoints,
    partialFrom,
    projectedFrom,
    range,
    timeAxis,
    windowSize,
  ]);
  return { ...held, ...prepared };
}
