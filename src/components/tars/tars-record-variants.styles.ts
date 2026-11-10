import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The record design options (`TarsRecordStyle`), layered over the default
 * tint row (`tars-record.styles`). Each option defines the same parts so the
 * row and the list can compose whichever one is active; an empty part keeps
 * the default. Spacing stays on the 4px grid: rows sit 4px apart inside a run,
 * a run sits 8px from the prose around it (the exchange's own gap).
 */

/** A: no surface. The mark sits on the prose's leading edge and the run reads as quiet margin notes. */
export const tarsRecordQuiet = stylex.create({
  list: { backgroundColor: "transparent", borderRadius: 0, rowGap: vars["--aui-space-2"] },
  item: { borderBlockStartWidth: 0 },
  row: { minBlockSize: vars["--aui-control-height-2xs"], paddingBlock: vars["--aui-space-2"], paddingInline: 0 },
  markSlot: {},
  main: {},
  lead: { marginInlineEnd: vars["--aui-space-4"] },
  subject: { color: vars["--aui-color-text-muted"] },
  detail: {},
});

/**
 * B: a run of records on one bordered card, the surface and radius of the
 * agent run's result card. What was done leads in semibold with where it came
 * from beside it; the work's title takes its own line, so a long title wraps
 * without pushing the outcome off the first line.
 */
export const tarsRecordCard = stylex.create({
  list: {
    rowGap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-12"],
    backgroundColor: vars["--aui-color-surface"], borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-border-subtle"],
  },
  item: { borderBlockStartWidth: 0 },
  row: { paddingInline: 0, minBlockSize: vars["--aui-control-height-xs"], fontSize: vars["--aui-font-size-body"] },
  markSlot: {},
  main: { display: "flex", flexDirection: "column", rowGap: vars["--aui-space-2"] },
  lead: { marginInlineEnd: 0, fontWeight: vars["--aui-font-weight-semibold"] },
  subject: { color: vars["--aui-color-text"] },
  detail: {},
});

/** C: a vertical rail. A dot per record on one line through the run, and each record's own time at the trailing edge. */
export const tarsRecordRail = stylex.create({
  list: { backgroundColor: "transparent", borderRadius: 0 },
  item: { position: "relative", borderBlockStartWidth: 0 },
  row: { paddingInline: 0, minBlockSize: vars["--aui-control-height-xs"] },
  /** A fixed slot, so the rail runs through every dot's centre whatever the glyph. */
  markSlot: { inlineSize: vars["--aui-space-16"] },
  main: {},
  lead: { marginInlineEnd: vars["--aui-space-4"] },
  subject: { color: vars["--aui-color-text-muted"] },
  detail: {},
});

/** Where the rail's dot sits: the row's top pad plus half a text line. */
const DOT_CENTER = `calc(${vars["--aui-space-4"]} + ${vars["--aui-line-height-control"]} / 2)`;
/** The rail stops this far from each dot's centre (half the 8px dot plus a 2px gap). */
const DOT_CLEARANCE = `calc(${vars["--aui-space-4"]} + ${vars["--aui-space-2"]})`;
/** Whether the rail row is hovered or holds focus, so a later row's time can appear (always on a touch screen). */
const RAIL_REVEAL = "--tars-record-reveal";

export const tarsRecordRailParts = stylex.create({
  row: { [RAIL_REVEAL]: { default: 0, ":hover": 1, ":focus-within": 1, "@media (hover: none)": 1 } },
  /** The rail's segment from the row above down to this row's dot. */
  above: {
    position: "absolute", insetInlineStart: `calc(${vars["--aui-space-8"]} - ${vars["--aui-border-width-hairline"]} / 2)`, insetBlockStart: 0,
    inlineSize: vars["--aui-border-width-hairline"], blockSize: `calc(${DOT_CENTER} - ${DOT_CLEARANCE})`,
    backgroundColor: vars["--aui-color-border-strong"], pointerEvents: "none",
  },
  /** The segment from this row's dot down to the row below. */
  below: {
    position: "absolute", insetInlineStart: `calc(${vars["--aui-space-8"]} - ${vars["--aui-border-width-hairline"]} / 2)`,
    insetBlockStart: `calc(${DOT_CENTER} + ${DOT_CLEARANCE})`, insetBlockEnd: 0,
    inlineSize: vars["--aui-border-width-hairline"], backgroundColor: vars["--aui-color-border-strong"], pointerEvents: "none",
  },
  dot: { display: "inline-flex", alignItems: "center", justifyContent: "center" },
  /** The record's own time: machine-made, so tabular figures in the quiet register. */
  time: {
    color: vars["--aui-color-text-subtle"], fontSize: vars["--aui-font-size-caption"], fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
  },
  /** After a run's first row, a time shows while its row is hovered or focused: a run of records is seconds apart, so repeating it is noise. */
  timeLater: {
    opacity: `var(${RAIL_REVEAL}, 1)`,
    transitionProperty: { default: "opacity", "@media (prefers-reduced-motion: reduce)": "none" },
    transitionDuration: vars["--aui-motion-duration-quick"], transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
});
