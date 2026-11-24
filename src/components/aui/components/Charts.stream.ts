/**
 * Streaming options shared by the axis charts (`CartesianChartOptions`).
 * A sibling of `Charts.props.ts`, which is at the source-size ceiling.
 */
export type ChartStreamOptions = {
  /**
   * A streaming series: skip the draw-in animation on every update, so each
   * appended point extends the line instead of redrawing it. Pair with
   * `windowSize` for a rolling window. @default false
   */
  live?: boolean;
  /**
   * Keep only the last N points of `data` (and of `comparison` / `range`,
   * aligned by position) — a rolling window over an append-only feed.
   */
  windowSize?: number;
};
