import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { themeProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import {
  rectsSignature,
  toLogical,
  type SkeletonRect,
} from "./Skeleton.measured.geometry";
import { measureSkeleton } from "./Skeleton.measured.measure";
import { SKELETON_CLASS } from "./Skeleton.motion";

/**
 * Sample-measured loading cells for `DataTable` (2026-11-03, S3 follow-up).
 *
 * A text bar per cell kept a text row the same height loading and loaded and
 * nothing else: an avatar or a 24px badge grew each row by 8px when the data
 * landed, a 32px row action by 16px, a wrapping note by a line, and a column
 * without a declared width was sized by its header while loading and by its
 * content once loaded — 36-95px swings measured on the docs harness.
 *
 * When the table has a row to measure — the rows already on screen during a
 * refetch, or the caller's `loadingSample` on a first load — each placeholder
 * cell renders that row's real cell content into an inert, `aria-hidden`,
 * `visibility: hidden` copy. The copy gives the cell, the row and the column
 * the loaded geometry; the `Skeleton.Measured` walk then reads what it laid out
 * and the shared skeleton shapes are drawn over it — a cap band per text line,
 * a circle per avatar, a chip per badge, a block per control.
 */

/** One measured cell: its shapes and the width they were measured at. */
export type SampledCellShapes = { rects: SkeletonRect[]; width: number };

/**
 * Band widths for a repeated sample, cycled by row and column: one sample
 * drawn identically in every row reads as a solid slab. Bands only, never
 * wider than measured; avatars, chips and controls keep their own size.
 */
const BAND_SCALE = [1, 0.8, 0.92, 0.7];

/**
 * Measure every sampled cell under `bodyRef` before paint, and again when the
 * table resizes, a font finishes loading or an image in a sample loads.
 * Returns the shapes per `data-skeleton-cell` key; an unchanged measurement
 * keeps the previous object, so it never re-renders on its own.
 */
export function useSampledCellShapes(
  bodyRef: React.RefObject<HTMLTableSectionElement | null>,
  active: boolean,
): Record<string, SampledCellShapes> {
  const [shapes, setShapes] = React.useState<Record<string, SampledCellShapes>>(
    {},
  );
  const signature = React.useRef("");

  const measure = React.useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const next: Record<string, SampledCellShapes> = {};
    const parts: string[] = [];
    for (const cell of body.querySelectorAll<HTMLElement>(
      "[data-skeleton-cell]",
    )) {
      const ghost = cell.querySelector<HTMLElement>(
        ":scope > [data-skeleton-sample]",
      );
      const key = cell.getAttribute("data-skeleton-cell");
      if (!ghost || key == null) continue;
      // A cell is a handful of nodes; the cap keeps a pathological cell (a
      // long tag list) from drawing hundreds of marks per row.
      const result = measureSkeleton(cell, ghost, { maxRects: 24 });
      const rects = result.rects.filter((rect) => rect.kind !== "frame");
      next[key] = { rects, width: result.size.width };
      parts.push(
        `${key}@${result.size.width.toFixed(1)}:${rectsSignature(rects)}`,
      );
    }
    const nextSignature = parts.join(";");
    if (nextSignature === signature.current) return;
    signature.current = nextSignature;
    setShapes(next);
  }, [bodyRef]);

  // Before paint, every render while loading: the first frame already has its
  // shapes, and a column change re-measures without a dependency list to keep
  // in step. The signature check makes an unchanged pass free of renders.
  React.useLayoutEffect(() => {
    if (active) measure();
    else signature.current = "";
  });

  React.useEffect(() => {
    if (!active) return;
    const body = bodyRef.current;
    const table = body?.closest("table");
    if (!body || !table) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    resize?.observe(table);
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    fonts?.addEventListener("loadingdone", schedule);
    // `load` does not bubble; capture catches every image in the samples.
    body.addEventListener("load", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      fonts?.removeEventListener("loadingdone", schedule);
      body.removeEventListener("load", schedule, true);
    };
  }, [active, bodyRef, measure]);

  return shapes;
}

/**
 * One placeholder cell drawn from a sample: the invisible copy that holds the
 * space, and the shapes measured from it. `varyIndex` cycles the band widths
 * when the same sample fills every row (see `BAND_SCALE`); `align` keeps a
 * shortened band on the column's own edge.
 */
export function DataTableSampledCell({
  align = "start",
  cellKey,
  children,
  direction,
  shapes,
  varyIndex,
}: {
  align?: "center" | "end" | "start";
  cellKey: string;
  children: React.ReactNode;
  direction: "ltr" | "rtl";
  shapes: SampledCellShapes | undefined;
  /** Omit for a real row (a refetch): its own content already varies. */
  varyIndex?: number;
}) {
  const theme = themeProps("skeleton", { variant: "block" });
  const scale =
    varyIndex === undefined ? 1 : BAND_SCALE[varyIndex % BAND_SCALE.length]!;
  return (
    <div className={sx(styles.cell)} data-skeleton-cell={cellKey}>
      <div
        aria-hidden
        className={sx(styles.sample)}
        data-skeleton-sample=""
        inert
      >
        {children}
      </div>
      {shapes ? (
        <div aria-hidden className={sx(styles.layer)}>
          {shapes.rects.map((rect, index) => {
            const box = toLogical(rect, shapes.width, direction);
            const factor = rect.kind === "band" ? scale : 1;
            const inlineSize = box.inlineSize * factor;
            const slack = box.inlineSize - inlineSize;
            const offset =
              align === "end" ? slack : align === "center" ? slack / 2 : 0;
            return (
              <span
                {...theme}
                className={cx(sx(styles.mark), SKELETON_CLASS, theme.className)}
                key={index}
                style={{
                  blockSize: box.blockSize,
                  borderRadius: rect.kind === "frame" ? undefined : rect.radius,
                  inlineSize,
                  insetBlockStart: box.blockStart,
                  insetInlineStart: box.inlineStart + offset,
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  // The box the shapes are measured against and positioned in. A block in
  // the cell's own flow, so the cell's alignment and vertical centring apply
  // to it exactly as they do to the loaded content.
  cell: {
    minInlineSize: 0,
    position: "relative",
  },
  // `display: contents`: the sample's content lays out in the cell as the
  // loaded content will. `visibility` and `pointer-events` inherit through.
  sample: {
    display: "contents",
    pointerEvents: "none",
    userSelect: "none",
    visibility: "hidden",
  },
  layer: {
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  mark: {
    boxSizing: "border-box",
    display: "block",
    position: "absolute",
  },
});
