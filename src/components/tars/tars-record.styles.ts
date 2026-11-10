import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";

/**
 * Record text takes the conversation scale's secondary step
 * (`chat-type.stylex.ts`, set by the conversation column from the chat font
 * size setting): 14px beside 16px messages, 18px beside 20px ones. Outside the
 * column (the side view) the scale's default, 16px messages, applies.
 */
const RECORD_TEXT = chatType["--chat-type-secondary"];
/** Times: the scale's meta step, 12px beside 16px messages, the same as a message's own time. */
const RECORD_TIME = chatType["--chat-type-meta"];
/** Each row is its own container: in a narrow column the values take their own row under what was done, beside the outcome. */
const NARROW = "@container (max-width: 30rem)";
/** A relative line height, so a larger chat font keeps its leading. */
const RECORD_LEADING = "1.5";
/**
 * One text line of the row. Every part of a row's first line is a box this
 * tall that centres what it holds (the mark, the actor's glyph, a chip, the
 * outcome, the smaller time), and the parts align at the line's top. So they
 * share one centre line whatever their own size or font, and it stays the
 * first line's when the sentence or the chips wrap.
 */
const LINE = "1lh";

/** The rail's line runs through the middle of this slot, so every mark sits on it whatever its glyph. */
const MARK_SLOT = vars["--aui-space-16"];
/** Where a row's mark sits: the row's top pad plus half its first line. */
const MARK_CENTER = `calc(${vars["--aui-space-4"]} + 0.5lh)`;
/** The rail stops this far from each mark's centre: half the 14px glyph plus a 3px gap. */
const MARK_CLEARANCE = `calc(${vars["--aui-space-8"]} + ${vars["--aui-space-2"]})`;
/** Whether the row is hovered or holds focus, so a later row's time can appear (always on a touch screen). */
const REVEAL = "--tars-record-reveal";

/**
 * A Tars record on the transcript's timeline rail: what an action, a control
 * or a piece of work came to. Each row's state mark sits on one hairline that
 * runs through a run of records, so the run reads as a log beside Tars's
 * prose without a surface of its own. What was done leads, the values it was
 * done to follow as chips, and the outcome and time sit at the trailing edge.
 */
export const tarsRecordStyles = stylex.create({
  /** One run of records. It owns the type, so the rail's segments measure the rows' lines. */
  list: {
    display: "grid", minWidth: 0, margin: 0, padding: 0, listStyle: "none",
    fontSize: RECORD_TEXT, lineHeight: RECORD_LEADING,
  },
  /** A run that stands between exchanges pads like an exchange (`tarsMessageStyles.exchange`), so the transcript has one gap between entries. */
  listStandalone: { paddingBlock: vars["--aui-space-8"] },
  item: { position: "relative", minWidth: 0 },
  /**
   * Mark, then the text, then the outcome at the trailing edge. Narrow, the
   * outcome wraps under the text instead of squeezing it.
   */
  row: {
    display: "flex", alignItems: "flex-start", columnGap: vars["--aui-space-8"], inlineSize: "100%", minWidth: 0, boxSizing: "border-box",
    // Size containment gives the row no width of its own, so it always takes its parent's: a block list item or a flex panel row.
    containerType: "inline-size",
    paddingBlock: vars["--aui-space-4"], paddingInline: 0,
    fontSize: RECORD_TEXT, lineHeight: RECORD_LEADING, color: vars["--aui-color-text"],
    [REVEAL]: { default: 0, ":hover": 1, ":focus-within": 1, "@media (hover: none)": 1 },
  },
  /** The mark sits in a box one text line tall, so it stays on the first line however far the text wraps. */
  markSlot: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    inlineSize: MARK_SLOT, blockSize: LINE,
  },
  /** The rail's segment from the row above down to this row's mark. */
  railAbove: {
    position: "absolute", insetInlineStart: `calc(${MARK_SLOT} / 2 - ${vars["--aui-border-width-hairline"]} / 2)`, insetBlockStart: 0,
    inlineSize: vars["--aui-border-width-hairline"], blockSize: `calc(${MARK_CENTER} - ${MARK_CLEARANCE})`,
    backgroundColor: vars["--aui-color-border-strong"], pointerEvents: "none",
  },
  /** The segment from this row's mark down to the row below. */
  railBelow: {
    position: "absolute", insetInlineStart: `calc(${MARK_SLOT} / 2 - ${vars["--aui-border-width-hairline"]} / 2)`,
    insetBlockStart: `calc(${MARK_CENTER} + ${MARK_CLEARANCE})`, insetBlockEnd: 0,
    inlineSize: vars["--aui-border-width-hairline"], backgroundColor: vars["--aui-color-border-strong"], pointerEvents: "none",
  },
  body: { display: "flex", flexDirection: "column", rowGap: vars["--aui-space-2"], flex: 1, minWidth: 0 },
  /**
   * What was done and to what; the outcome follows on the same line while it
   * fits. In a narrow column (a phone, the side view) the line becomes two
   * rows: what was done with the outcome at its trailing edge, then the
   * values across the whole width. Only the chips wrap; the outcome never
   * drops to a line of its own.
   */
  line: {
    display: { default: "flex", [NARROW]: "grid" }, flexWrap: "wrap", alignItems: "flex-start",
    gridTemplateColumns: { default: null, [NARROW]: "minmax(0, 1fr) auto" },
    columnGap: vars["--aui-space-8"], rowGap: { default: vars["--aui-space-2"], [NARROW]: vars["--aui-space-4"] }, minWidth: 0,
  },
  /** Who did it, what was done, then its values as chips; a long sentence wraps word by word, a chip wraps whole. Narrow, its two parts become the line's own rows. */
  main: {
    display: { default: "flex", [NARROW]: "contents" }, flexWrap: "wrap", alignItems: "flex-start", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"],
    flex: "1 1 14rem", minWidth: 0,
  },
  /** Who did it and what was done: part of the main run when wide, the narrow line's first cell. */
  text: {
    display: { default: "contents", [NARROW]: "flex" }, flexWrap: "wrap", alignItems: "flex-start", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"],
    minWidth: 0, gridColumn: { default: null, [NARROW]: "1" }, gridRow: { default: null, [NARROW]: "1" },
  },
  /** The values: chips in the main run when wide, the narrow line's full-width second row. */
  values: {
    display: { default: "contents", [NARROW]: "flex" }, flexWrap: "wrap", alignItems: "flex-start", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"],
    minWidth: 0, gridColumn: { default: null, [NARROW]: "1 / -1" }, gridRow: { default: null, [NARROW]: "2" },
  },
  lead: { minWidth: 0, color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"], overflowWrap: "anywhere" },
  subject: { minWidth: 0, color: vars["--aui-color-text"], overflowWrap: "anywhere" },
  /**
   * Who did it: a person for the user's own control, Tars's mark for what Tars
   * did. It stays inline, so a long sentence wraps after it, in a box as tall
   * as the text line and set on the line's top, which centres the glyph on the
   * line without leaning on a font's own baseline.
   */
  actor: {
    display: "inline-flex", alignItems: "center", verticalAlign: "top", flexShrink: 0,
    inlineSize: "1em", blockSize: LINE, marginInlineEnd: vars["--aui-space-8"], color: vars["--aui-color-text-muted"],
  },
  actorTars: { color: vars["--aui-color-accent"] },
  actorIcon: { inlineSize: "100%", blockSize: "1em" },
  /** The outcome and the time at the trailing edge; narrow, the first row's second cell. */
  trail: {
    display: "inline-flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], flexShrink: 0, minWidth: 0,
    minBlockSize: LINE,
    marginInlineStart: { default: "auto", [NARROW]: 0 }, gridColumn: { default: null, [NARROW]: "2" }, gridRow: { default: null, [NARROW]: "1" },
  },
  status: { fontWeight: vars["--aui-font-weight-medium"], whiteSpace: "nowrap" },
  /** Applied is the expected outcome: the check carries it, so its word stays quiet and the exceptions are what the eye catches. */
  statusApplied: { color: vars["--aui-color-text-muted"], fontWeight: vars["--aui-font-weight-regular"] },
  statusPending: { color: vars["--aui-color-text-muted"] },
  statusRunning: { color: vars["--aui-color-info-text"] },
  statusRefused: { color: vars["--aui-color-warning-text"] },
  statusFailed: { color: vars["--aui-color-danger-text"] },
  /** The record's own time: machine-made, so tabular figures in the quiet register. */
  time: { color: vars["--aui-color-text-subtle"], fontSize: RECORD_TIME, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  /** After a run's first row, a time shows while its row is hovered or focused: a run of records is seconds apart, so repeating it is noise. */
  timeLater: {
    opacity: `var(${REVEAL}, 1)`,
    transitionProperty: { default: "opacity", "@media (prefers-reduced-motion: reduce)": "none" },
    transitionDuration: vars["--aui-motion-duration-quick"], transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /** A reason or what followed: its own line in readable ink, never a red tail on the first line. */
  detail: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  /** A follow-on line with its own mark (words waiting for a busy run). */
  sub: { display: "flex", alignItems: "flex-start", columnGap: vars["--aui-space-4"], minWidth: 0, color: vars["--aui-color-text-muted"] },
  subMark: { display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, blockSize: "1lh" },
  subText: { display: "inline-flex", flexWrap: "wrap", columnGap: vars["--aui-space-4"], minWidth: 0, overflowWrap: "anywhere" },
  /**
   * A record that heads what follows from it (an automatic follow-up and the
   * reply Tars wrote for it): the head row is the reply's origin label, and
   * the rail runs on from its mark down the length of the reply, which sits
   * on the rail's text column. So the two read as one item, never as a record
   * and a separate message.
   */
  thread: { position: "relative", display: "flex", flexDirection: "column", rowGap: vars["--aui-space-2"], minWidth: 0 },
  threadRail: {
    position: "absolute", insetInlineStart: `calc(${MARK_SLOT} / 2 - ${vars["--aui-border-width-hairline"]} / 2)`,
    insetBlockStart: `calc(${MARK_CENTER} + ${MARK_CLEARANCE})`, insetBlockEnd: 0,
    inlineSize: vars["--aui-border-width-hairline"], backgroundColor: vars["--aui-color-border-strong"], pointerEvents: "none",
  },
  /** What the head led to, on the rail's text column, items as close as one exchange's. */
  threadBody: {
    display: "flex", flexDirection: "column", rowGap: vars["--aui-space-8"], minWidth: 0,
    paddingInlineStart: `calc(${MARK_SLOT} + ${vars["--aui-space-8"]})`,
  },
  /** A diagnostic in the tool's own words, shown as written. */
  diagnostic: { display: "block", minWidth: 0, fontFamily: vars["--aui-font-mono"], fontSize: "0.875em", color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  /** Controls ride the outcome's place at the trailing edge, centred on the line in a box no taller than it, so a button never moves the line (it reaches into the row's own padding). */
  actions: { display: "inline-flex", flexWrap: "wrap", alignItems: "center", alignSelf: "center", gap: vars["--aui-space-4"], minWidth: 0, maxBlockSize: LINE },
  /**
   * A value chip (`Badge`) in the row's own type: the chat font size, not the
   * chip's fixed caption, and exactly one text line tall, so its words and its
   * glyph sit on the line's centre and a row of chips keeps the text's rhythm.
   */
  chip: { boxSizing: "border-box", fontSize: "inherit", lineHeight: "inherit", blockSize: LINE, minBlockSize: 0, paddingBlock: 0, maxInlineSize: "100%" },
  chipIcon: { flexShrink: 0, inlineSize: "0.9em", blockSize: "0.9em" },
  /** The chip's text ellipsizes inside it; the full value is in its tooltip. */
  chipText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  /**
   * A work chip that opens the work: a host-sized Button (whose own chrome is
   * the quiet trigger) drawn as an outlined pill in the row's type, with the
   * open glyph and a hover fill, so it reads as the one value that acts. A
   * plain value chip has no border, pointer or hover fill.
   */
  chipButton: {
    display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], maxInlineSize: "100%", minWidth: 0,
    boxSizing: "border-box", blockSize: LINE, minBlockSize: 0, paddingBlock: 0, paddingInline: vars["--aui-space-8"], borderRadius: vars["--aui-radius-full"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid",
    borderColor: { default: vars["--aui-color-border"], ":hover": vars["--aui-color-border-strong"] },
    backgroundColor: { default: vars["--aui-color-surface-raised"], ":hover": vars["--aui-color-overlay-hover"] },
    color: vars["--aui-color-text"], cursor: "pointer",
    fontSize: "inherit", lineHeight: "inherit", fontWeight: vars["--aui-font-weight-medium"],
  },
});

/**
 * A delegation's folded flow (`TarsFlowBlock`) on the same rail as the
 * records beside it: its glyph in the mark column, its words at the record
 * size on the rail's text column, and its live line on that column too. The
 * trigger starts on the column's edge with no leading pad, so its glyph is
 * in the mark column and its box (and hover fill) never leaves the column.
 */
export const tarsFlowRailStyles = stylex.create({
  root: { marginBlockStart: 0, fontSize: RECORD_TEXT, lineHeight: RECORD_LEADING },
  trigger: {
    paddingInlineStart: 0, paddingBlock: vars["--aui-space-4"], minBlockSize: 0,
    fontSize: "inherit", lineHeight: "inherit",
  },
  summaryState: { fontSize: "inherit" },
  live: { paddingInlineStart: `calc(${MARK_SLOT} + ${vars["--aui-space-8"]})`, paddingInlineEnd: 0 },
});
