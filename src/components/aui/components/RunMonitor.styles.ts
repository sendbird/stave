import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * RunMonitor stylesheet (card, panel and recap) (#809 · G1 · A3, 2026-11-07).
 *
 * Host copy: the type steps are restated on the host's names — upstream's
 * 13px `fontSizeBody` is `fontSizeRow` here and its 14px `fontSizeProse` is
 * this repository's `fontSizeBody` — and the block at the end is host-only.
 *
 * A run is a BOUNDED OBJECT on the tray, so it lifts (`elevationLift`, A3) on
 * the shared ring hairline rather than resting flat like a section panel. Its
 * insides are the agent family's wells: a recessed tint for "what is happening
 * now" and for the decision the run is waiting on, never a nested bordered box.
 */
export const runStyles = stylex.create({
  card: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-lift"],
    boxSizing: "border-box",
    color: vars["--aui-color-text"],
    display: "grid",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlockEnd: vars["--aui-space-8"],
    paddingBlockStart: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  panel: {
    gap: 0,
    overflow: "hidden",
    padding: 0,
  },
  // Host: titles and meta wrap (below), so the tag sits on the first line.
  head: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  headPanel: {
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  // The state word never gives way: the title beside it wraps instead.
  badge: {
    flexShrink: 0,
  },
  tile: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-raised"],
    blockSize: 28,
    borderRadius: vars["--aui-radius-control"],
    boxShadow: `inset 0 0 0 ${vars["--aui-border-width-hairline"]} ${vars["--aui-color-ring"]}, ${vars["--aui-elevation-raised"]}`,
    color: vars["--aui-color-text-muted"],
    display: "grid",
    flexShrink: 0,
    inlineSize: 28,
    placeItems: "center",
  },
  id: {
    display: "grid",
    flex: "1 1 auto",
    minInlineSize: 0,
  },
  // Wraps rather than truncating (upstream since F1/F7; the host already did):
  // in a side rail the badge beside it left "Refresh onboardin…", and the
  // run's name is what the card is for. Host: `meta` wraps too.
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-control"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    overflowWrap: "anywhere",
  },
  clock: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  well: {
    backgroundColor: vars["--aui-color-overlay-hover"],
    borderRadius: vars["--aui-radius-control"],
  },
  now: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--aui-font-size-row"],
    gap: vars["--aui-space-8"],
    minBlockSize: vars["--aui-control-height-md"],
    paddingInlineEnd: vars["--aui-space-12"],
    paddingInlineStart: vars["--aui-space-8"],
  },
  nowMark: {
    color: vars["--aui-color-info"],
    display: "inline-flex",
  },
  nowText: {
    flex: "1 1 auto",
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  progressRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    paddingBlockEnd: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  strip: {
    display: "flex",
    flex: "1 1 auto",
    gap: vars["--aui-space-2"],
    blockSize: 4,
    minInlineSize: 0,
  },
  segment: {
    backgroundColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-full"],
    flex: "1 1 0",
  },
  segmentDone: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-info"]} 45%, transparent)`,
  },
  segmentNow: {
    backgroundColor: vars["--aui-color-info"],
  },
  steps: {
    display: "grid",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  step: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-8"],
    display: "grid",
    fontSize: vars["--aui-font-size-caption"],
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    lineHeight: vars["--aui-line-height-tight"],
    minBlockSize: vars["--aui-control-height-xs"],
    borderBlockStartColor: {
      default: vars["--aui-color-border-subtle"],
      ":first-child": "transparent",
    },
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
  },
  stepLabel: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stepTool: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
    marginInlineStart: vars["--aui-space-4"],
  },
  markDone: { color: vars["--aui-color-success-text"], display: "inline-flex" },
  markFailed: {
    color: vars["--aui-color-danger-text"],
    display: "inline-flex",
  },
  markLive: { color: vars["--aui-color-info"], display: "inline-flex" },
  ask: {
    display: "grid",
    fontSize: vars["--aui-font-size-row"],
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-12"],
  },
  askTitle: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
  askText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  facts: {
    columnGap: vars["--aui-space-12"],
    display: "grid",
    fontSize: vars["--aui-font-size-caption"],
    gridTemplateColumns: "auto minmax(0, 1fr)",
    margin: 0,
    rowGap: vars["--aui-space-2"],
  },
  factLabel: {
    color: vars["--aui-color-text-muted"],
  },
  factValue: {
    fontFamily: vars["--aui-font-mono"],
    margin: 0,
    overflowWrap: "anywhere",
    textAlign: "end",
  },
  foot: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    paddingBlockStart: vars["--aui-space-2"],
  },
  spacer: {
    flex: "1 1 auto",
  },
  body: {
    borderBlockStartColor: vars["--aui-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  steer: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderBlockStartColor: vars["--aui-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    display: "grid",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
    paddingBlockEnd: vars["--aui-space-12"],
    paddingBlockStart: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  // On a card the steer band runs edge to edge under the footer.
  steerCard: {
    marginBlockEnd: `calc(-1 * ${vars["--aui-space-8"]})`,
    marginInline: `calc(-1 * ${vars["--aui-space-12"]})`,
  },
  recap: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
  },
  recapBody: {
    display: "grid",
    flex: "1 1 auto",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  recapResult: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-row"],
    lineHeight: vars["--aui-line-height-control"],
    overflowWrap: "anywhere",
  },
  // ---- host additions (see PROVENANCE) ------------------------------------
  /** The labelled strip (`progress.segments`) is a list; reset its chrome. */
  stripList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  /** A stage that stopped short (blocked, cancelled): the warning hue. */
  segmentStopped: {
    backgroundColor: vars["--aui-color-warning"],
  },
  /** A settled current step (paused, blocked) draws its state, not a spinner. */
  nowMarkSettled: {
    color: "inherit",
    display: "inline-flex",
  },
  /** Card body under the header: stacks host rows on the card's own gap. */
  cardBody: {
    display: "grid",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
});
