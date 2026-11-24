import { useEffect, useRef } from "react";

import {
  columnFitFixedLayoutWarnings,
  columnPercentWidthWarnings,
  columnSizingWarnings,
  isDevBuild,
  type DataTableSizingWarning,
  type SizingCheckColumn,
} from "./DataTable.sizing";

function warnOncePerColumn(
  warnings: DataTableSizingWarning[],
  warned: Set<string>,
): void {
  for (const { columnId, message } of warnings) {
    if (warned.has(columnId)) continue;
    warned.add(columnId);
    console.warn(message);
  }
}

/**
 * Runs every `DataTable` column-sizing dev warning: the original grid-track /
 * `size`+`width` / `"fit"`+`wrap` / `minWidth` checks (`columnSizingWarnings`,
 * unchanged — fires once per change to `columns`, not deduped by id), plus
 * the two added alongside it — a percentage `width` without `size`, and
 * `size: "fit"` on a `layout="fixed"` table — each deduped by column id in
 * its own `useRef<Set>` rather than by the effect's `columns` dependency
 * alone, because a caller's `columns` is routinely a fresh array literal
 * every render. Split out of `DataTable.tsx` to keep it under the repo's
 * file-growth ratchet (`bun run check:structure`).
 */
export function useColumnSizingWarnings(
  columns: ReadonlyArray<SizingCheckColumn>,
  layout: "auto" | "fixed",
): void {
  useEffect(() => {
    if (!isDevBuild()) return;
    for (const warning of columnSizingWarnings(columns, layout))
      console.warn(warning);
  }, [columns]);

  const warnedPercentWidth = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isDevBuild()) return;
    warnOncePerColumn(
      columnPercentWidthWarnings(columns),
      warnedPercentWidth.current,
    );
  }, [columns]);

  const warnedFitFixedLayout = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isDevBuild()) return;
    warnOncePerColumn(
      columnFitFixedLayoutWarnings(columns, layout),
      warnedFitFixedLayout.current,
    );
  }, [columns, layout]);
}
