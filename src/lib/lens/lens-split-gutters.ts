/**
 * Lens paints its page with a native Electron `WebContentsView` stacked above
 * the renderer, so any panel edge it shares with a neighbouring Dockview view
 * is hidden: both the one-pixel split separator and the inner half of the 4px
 * resize sash live inside the view the native surface covers. The renderer
 * therefore reserves a gutter on those edges and keeps the native view out of
 * it.
 */
export type LensSplitGutterEdge = "top" | "right" | "bottom" | "left";

export type LensSplitViewOrientation = "horizontal" | "vertical";

/**
 * One level of the Dockview split-view chain that contains the Lens group,
 * from its own leaf view outward through every nested grid branch.
 */
export type LensSplitViewPlacement = {
  orientation: LensSplitViewOrientation | null;
  hasPrecedingView: boolean;
  hasFollowingView: boolean;
};

/**
 * Paired with the `--lens-split-gutter` rules in `src/globals.css`, which
 * reserve the sash half-width (Dockview hardcodes a 4px sash centred on the
 * boundary) on each tagged edge.
 */
export const LENS_SPLIT_GUTTERS_ATTRIBUTE = "data-lens-split-gutters";

const EDGE_ORDER: readonly LensSplitGutterEdge[] = [
  "top",
  "right",
  "bottom",
  "left",
];

const EDGES_BY_ORIENTATION: Record<
  LensSplitViewOrientation,
  readonly [LensSplitGutterEdge, LensSplitGutterEdge]
> = {
  horizontal: ["left", "right"],
  vertical: ["top", "bottom"],
};

/**
 * Merge every split-view level the Lens group sits in into the set of edges
 * that need a gutter. Walking the whole chain matters because a nested grid
 * branch can place a boundary on an edge the innermost split view knows
 * nothing about (a Lens stacked vertically inside a right-hand column still
 * shares that column's left boundary).
 */
export function resolveLensSplitGutterEdges(
  placements: readonly LensSplitViewPlacement[],
): LensSplitGutterEdge[] {
  const edges = new Set<LensSplitGutterEdge>();
  for (const placement of placements) {
    if (!placement.orientation) {
      continue;
    }
    const [startEdge, endEdge] = EDGES_BY_ORIENTATION[placement.orientation];
    if (placement.hasPrecedingView) {
      edges.add(startEdge);
    }
    if (placement.hasFollowingView) {
      edges.add(endEdge);
    }
  }
  return EDGE_ORDER.filter((edge) => edges.has(edge));
}

/**
 * Serialize edges for the `data-lens-split-gutters` attribute. CSS matches
 * individual edges with the `~=` whitespace-list operator.
 */
export function formatLensSplitGutterEdges(
  edges: readonly LensSplitGutterEdge[],
): string {
  return edges.join(" ");
}
