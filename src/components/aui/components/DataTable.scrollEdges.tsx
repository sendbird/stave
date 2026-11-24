import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { scrollEdgeShade } from "../recipes/scroll-edge-shade";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import {
  type InlineScrollEdges,
  useInlineScrollEdges,
} from "../utils/scroll-edges";
import { sx } from "../utils/stylex";
import type { DataTablePinnedExtents } from "./DataTable.pinning";

/** The table inside the frame resizes (rows, a resized column) while the frame stays put. */
const observeTable = (frame: HTMLElement) => {
  const table = frame.querySelector("table");
  return table ? [table] : [];
};

/** Which inline edges of the scroll frame have columns past them. */
export function useDataTableScrollEdges({
  direction,
  scrollRef,
}: {
  direction: "ltr" | "rtl";
  scrollRef: React.RefObject<HTMLDivElement | null>;
}): InlineScrollEdges {
  return useInlineScrollEdges({ direction, observe: observeTable, scrollRef });
}

/**
 * The scroll cue on a table wider than its frame: the end edge at first, both
 * once scrolled, only the start at the far end, neither when the table fits.
 *
 * Drawn over the frame as its sibling, not inside it — the frame is the box
 * that scrolls, and a cue inside it would scroll away with the columns it
 * points at. A pinned column is part of what the reader always sees, so the
 * band stands at the pinned column's inner edge, where the other columns slide
 * under it, rather than at the frame's.
 */
export function DataTableScrollEdgeShadows({
  edges,
  frame,
  pinnedInset,
}: {
  edges: InlineScrollEdges;
  /** Matches the frame's hairline; a frameless table has none to sit inside. */
  frame: boolean;
  pinnedInset: DataTablePinnedExtents;
}) {
  return (
    <div
      aria-hidden
      className={sx(styles.layer, !frame && styles.layerFrameless)}
    >
      <span
        className={sx(
          scrollEdgeShade.band,
          scrollEdgeShade.start,
          transition.fade,
          edges.start && scrollEdgeShade.visible,
        )}
        data-scroll-edge="start"
        style={{ insetInlineStart: pinnedInset.leading }}
      />
      <span
        className={sx(
          scrollEdgeShade.band,
          scrollEdgeShade.end,
          transition.fade,
          edges.end && scrollEdgeShade.visible,
        )}
        data-scroll-edge="end"
        style={{ insetInlineEnd: pinnedInset.trailing }}
      />
    </div>
  );
}

/**
 * The box that holds the scroll frame and its cue. One grid cell, so the frame
 * keeps its own sizing: in the default grid root it is just the frame's row;
 * under `fillHeight` it becomes the flex item that grows, and the frame
 * stretches to fill it.
 */
export const frameHostStyles = stylex.create({
  host: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    minInlineSize: 0,
    position: "relative",
  },
  fill: {
    flexBasis: 0,
    flexGrow: 1,
    gridTemplateRows: "minmax(0, 1fr)",
    minBlockSize: 0,
  },
});

const styles = stylex.create({
  /*
   * Covers the frame exactly, inside its hairline, and clips to its rounded
   * corners. `zIndexSticky` with later DOM order puts it over the sticky header
   * and pinned cells, and under in-surface panels (`zIndexPanel`).
   */
  layer: {
    borderColor: "transparent",
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
    zIndex: vars["--aui-z-index-sticky"],
  },
  layerFrameless: {
    borderRadius: 0,
    borderWidth: 0,
  },
});
