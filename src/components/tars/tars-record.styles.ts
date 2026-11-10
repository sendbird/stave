import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Each row is its own container: in a narrow column (a phone, the side view, the pinned tray) the outcome takes its own line under the text. */
const NARROW = "@container (max-width: 30rem)";

/**
 * A Tars record: what an action, a control or a piece of work came to, as one
 * tint row. It follows the AUI #809 A4 tool-call row (`ToolRun` `well`): the
 * status mark first, what was done in full ink, then where it came from and
 * its outcome, on a recessed wash instead of a perimeter. A run of records
 * shares one wash and separates its rows with the list's own hairline, so a
 * column of them reads as one log block apart from Tars's prose, never as a
 * stack of cards or as indented text.
 */
export const tarsRecordStyles = stylex.create({
  /** The wash: one per run of records. */
  list: {
    display: "grid", minWidth: 0, margin: 0, padding: 0, listStyle: "none",
    backgroundColor: vars["--aui-color-overlay-hover"], borderRadius: vars["--aui-radius-control"],
  },
  /** The list owns the line between rows, so N rows draw N-1 lines. */
  item: {
    minWidth: 0,
    borderBlockStartWidth: { default: vars["--aui-border-width-hairline"], ":first-child": 0 },
    borderBlockStartStyle: "solid", borderBlockStartColor: vars["--aui-color-border-subtle"],
  },
  /**
   * Mark, then the text, then the outcome at the trailing edge. Narrow, the
   * outcome wraps under the text instead of squeezing it.
   */
  row: {
    display: "flex", alignItems: "flex-start", columnGap: vars["--aui-space-8"], inlineSize: "100%", minWidth: 0, boxSizing: "border-box",
    // Size containment gives the row no width of its own, so it always takes its parent's: a block list item or a flex panel row.
    containerType: "inline-size",
    minBlockSize: vars["--aui-control-height-sm"], paddingBlock: vars["--aui-space-4"], paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], color: vars["--aui-color-text"],
  },
  /** The mark sits in a box one text line tall, so it stays on the first line however far the text wraps. */
  markSlot: { display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, blockSize: vars["--aui-line-height-control"] },
  body: { display: "flex", flexDirection: "column", rowGap: vars["--aui-space-2"], flex: 1, minWidth: 0 },
  /** What was done and to which work; the outcome follows on the same line while it fits. */
  line: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], minWidth: 0 },
  /** What was done and to what, as one run of text, so a long title wraps word by word after its verb. */
  main: { flex: { default: "1 1 14rem", [NARROW]: "1 1 100%" }, minWidth: 0, overflowWrap: "anywhere" },
  lead: { color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"], marginInlineEnd: vars["--aui-space-8"] },
  subject: { color: vars["--aui-color-text"] },
  /** Where it came from and its outcome: meta in the quiet register, then the outcome word in its tone. */
  trail: {
    display: "inline-flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], flexShrink: 0, minWidth: 0,
    marginInlineStart: { default: "auto", [NARROW]: 0 },
  },
  meta: { minWidth: 0, color: vars["--aui-color-text-subtle"], overflowWrap: "anywhere" },
  status: { fontWeight: vars["--aui-font-weight-medium"], whiteSpace: "nowrap" },
  /** Applied is the expected outcome: the check carries it, so its word stays quiet and the exceptions are what the eye catches. */
  statusApplied: { color: vars["--aui-color-text-muted"], fontWeight: vars["--aui-font-weight-regular"] },
  statusPending: { color: vars["--aui-color-text-muted"] },
  statusRunning: { color: vars["--aui-color-info-text"] },
  statusRefused: { color: vars["--aui-color-warning-text"] },
  statusFailed: { color: vars["--aui-color-danger-text"] },
  /** A reason or what followed: its own line in readable ink, never a red tail on the first line. */
  detail: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  /** A follow-on line with its own mark (words waiting for a busy run). */
  sub: { display: "flex", alignItems: "flex-start", columnGap: vars["--aui-space-4"], minWidth: 0, color: vars["--aui-color-text-muted"] },
  subText: { display: "inline-flex", flexWrap: "wrap", columnGap: vars["--aui-space-4"], minWidth: 0, overflowWrap: "anywhere" },
  /** A diagnostic in the tool's own words, shown as written. */
  diagnostic: { display: "block", minWidth: 0, fontFamily: vars["--aui-font-mono"], fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  /** Controls ride the outcome's place at the trailing edge, centred on the line so a 24px button does not drop the row's baseline. */
  actions: { display: "inline-flex", flexWrap: "wrap", alignItems: "center", alignSelf: "center", gap: vars["--aui-space-4"], minWidth: 0 },
});
