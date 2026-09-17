export interface SparklineGeometry {
  /** `d` for the trend stroke. */
  line: string;
  /** `d` for the fill below the stroke, closed on the baseline. */
  area: string;
  min: number;
  max: number;
}

/**
 * Geometry for a single-series trend strip.
 *
 * The band is scaled to the series' own min/max rather than to zero: these are
 * memory and CPU readings whose interesting movement is a few percent of a
 * large base, and a zero baseline would flatten every one of them into the same
 * straight line. That is only defensible because the strip carries no axis and
 * never stands in for the value — the number above it does — so it is read as
 * "which way, how jagged", not "how much".
 */
export function sparklineGeometry(
  values: readonly number[],
  options: { width: number; height: number; strokeInset?: number },
): SparklineGeometry | null {
  if (values.length < 2) return null;
  const { width, height } = options;
  if (!(width > 0) || !(height > 0)) return null;
  const inset = options.strokeInset ?? 1;
  const top = inset;
  const bottom = Math.max(top, height - inset);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const x = (index: number) => (index / (values.length - 1)) * width;
  // A flat series sits on the middle of the band; dividing by a zero span would
  // otherwise pin it to the top edge and read as a permanent maximum.
  const y = (value: number) =>
    span === 0
      ? (top + bottom) / 2
      : bottom - ((value - min) / span) * (bottom - top);
  const points = values.map(
    (value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`,
  );
  const line = `M${points.join(" L")}`;
  const area = `${line} L${width.toFixed(2)},${height.toFixed(2)} L0,${height.toFixed(2)} Z`;
  return { line, area, min, max };
}
