/**
 * Matrix readings for `Heatmap` (2026-11-02): row/column normalisation for a
 * confusion matrix or any "share of its row" grid, and the cell flags the
 * diagonal and caller highlights add. Pure; no React.
 */
export type HeatmapNormalize = "column" | "row";

export function matrixReader({
  byKey,
  columns,
  normalize,
  rows,
}: {
  byKey: Map<string, number | null>;
  columns: readonly string[];
  normalize?: HeatmapNormalize;
  rows: readonly string[];
}) {
  const totals = new Map<string, number>();
  if (normalize) {
    for (const row of rows) {
      for (const column of columns) {
        const value = byKey.get(`${row}\0${column}`);
        if (typeof value !== "number") continue;
        const key = normalize === "row" ? row : column;
        totals.set(key, (totals.get(key) ?? 0) + value);
      }
    }
  }
  /** The value colored and printed: the raw value, or its share (0–1). */
  return (row: string, column: string): number | null => {
    const value = byKey.get(`${row}\0${column}`) ?? null;
    if (value === null || !normalize) return value;
    const total = totals.get(normalize === "row" ? row : column) ?? 0;
    return total === 0 ? 0 : value / total;
  };
}

/** Share as a whole percentage ("18%"); tiny nonzero shares read "<1%". */
export function formatShare(share: number) {
  if (share > 0 && share < 0.005) return "<1%";
  return `${Math.round(share * 100)}%`;
}

export const isHighlighted = (
  cells: ReadonlyArray<{ column: string; row: string }> | undefined,
  row: string,
  column: string,
) => Boolean(cells?.some((cell) => cell.row === row && cell.column === column));
