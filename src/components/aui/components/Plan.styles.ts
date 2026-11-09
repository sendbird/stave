import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/** Styles for `Plan.tsx` — the step list (the schedule has its own file). */
const TITLE_LINE = `calc(${vars["--aui-font-size-body"]} * ${vars["--aui-line-height-tight"]})`;

export const planStyles = stylex.create({
  // `titleHidden`: the title row is read, not drawn.
  headerOffscreen: {
    blockSize: 1,
    clipPath: "inset(50%)",
    inlineSize: 1,
    margin: -1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
  },
  root: {
    gap: vars["--aui-space-8"],
  },
  // `inset="flush"`: title and top-level steps on the host's content edge.
  flush: {
    paddingInline: 0,
  },
  header: {
    // Matches `agentSurface.row`'s inline padding so the plan title sits in the
    // same column as the step titles below it.
    paddingInline: vars["--aui-space-8"],
  },
  // Host: the count and the caller's `actions` share the header's end.
  headerEnd: {
    alignItems: "baseline",
    display: "inline-flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    // §3: medium for a row/section title. Semibold is the page-title weight.
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  empty: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  step: {
    // The track is centred in the row's `minBlockSize`, the items align to the
    // track's top. `alignItems: start` alone left a one-line step — 19px of
    // content in a 32px box — sitting 4px from the top and 9px from the
    // bottom; the same construction Citation's row uses.
    alignContent: "center",
    alignItems: "start",
    columnGap: vars["--aui-space-12"],
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    rowGap: 0,
  },
  substep: {
    // No rule and no radius; the inset (or the parent's spine) is the whole
    // containment. Tighter block padding keeps a nested run denser than the
    // top-level rows it belongs to.
    paddingBlock: vars["--aui-space-4"],
    paddingInline: 0,
  },
  markCell: {
    alignItems: "center",
    blockSize: TITLE_LINE,
    display: "inline-flex",
    gridColumn: "1",
    gridRow: "1",
    justifyContent: "center",
  },
  /**
   * The visible status word for the one attention state. Tertiary type size,
   * medium weight, colour from `agentStatusWord` — no fill, no border, no dot,
   * exactly the one-colored-word anatomy `ToolRun` uses for the same job. It
   * sits *inside* the title cell so it wraps with the sentence it annotates
   * rather than fighting the machine value in column 3 for the row's width.
   */
  statusWord: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    marginInlineStart: vars["--aui-space-8"],
    whiteSpace: "nowrap",
  },
  stepTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    gridColumn: "2",
    gridRow: "1",
    lineHeight: vars["--aui-line-height-tight"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  metaCell: {
    alignItems: "center",
    blockSize: TITLE_LINE,
    display: "inline-flex",
    gridColumn: "3",
    gridRow: "1",
    whiteSpace: "nowrap",
  },
  detail: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    gridColumn: "2 / -1",
    gridRow: "2",
    lineHeight: vars["--aui-line-height-normal"],
    marginBlockStart: vars["--aui-space-4"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  substepList: {
    display: "grid",
    gridColumn: "2 / -1",
    gridRow: "3",
    listStyle: "none",
    margin: 0,
    marginBlockStart: vars["--aui-space-4"],
    minInlineSize: 0,
    padding: 0,
  },
  substepRail: {
    backgroundColor: `color-mix(in oklab, ${vars["--aui-color-surface-tint"]} 72%, transparent)`,
    borderRadius: vars["--aui-radius-control"],
    gap: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
});
