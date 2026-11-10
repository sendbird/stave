import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";

/** Each row is its own container: in a narrow column (a phone, the side view, the pinned tray) the outcome takes its own line under the text. */
const NARROW = "@container (max-width: 30rem)";

/**
 * Record text takes the conversation scale's secondary step
 * (`chat-type.stylex.ts`, set by the conversation column from the chat font
 * size setting): 14px beside 16px messages, 18px beside 20px ones. Outside the
 * column (the side view) the scale's default, 16px messages, applies.
 */
const RECORD_TEXT = chatType["--chat-type-secondary"];
/** Times: the scale's meta step, 12px beside 16px messages, the same as a message's own time. */
const RECORD_TIME = chatType["--chat-type-meta"];
/** A relative line height, so a larger chat font keeps its leading. */
const RECORD_LEADING = "1.5";

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
    inlineSize: MARK_SLOT, blockSize: "1lh",
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
  /** What was done and to what; the outcome follows on the same line while it fits. */
  line: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], minWidth: 0 },
  /** Who did it, what was done, then its values as chips; a long sentence wraps word by word, a chip wraps whole. */
  main: {
    display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"],
    flex: { default: "1 1 14rem", [NARROW]: "1 1 100%" }, minWidth: 0,
  },
  lead: { minWidth: 0, color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"], overflowWrap: "anywhere" },
  subject: { minWidth: 0, color: vars["--aui-color-text"], overflowWrap: "anywhere" },
  /** Who did it: a person for the user's own control, Tars's mark for what Tars did. */
  actor: {
    display: "inline-flex", alignItems: "center", verticalAlign: "-0.125em", flexShrink: 0,
    inlineSize: "1em", blockSize: "1em", marginInlineEnd: vars["--aui-space-8"], color: vars["--aui-color-text-muted"],
  },
  actorTars: { color: vars["--aui-color-accent"] },
  actorIcon: { inlineSize: "100%", blockSize: "100%" },
  /** The outcome and the time at the trailing edge. */
  trail: {
    display: "inline-flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], flexShrink: 0, minWidth: 0,
    marginInlineStart: { default: "auto", [NARROW]: 0 },
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
  /** A diagnostic in the tool's own words, shown as written. */
  diagnostic: { display: "block", minWidth: 0, fontFamily: vars["--aui-font-mono"], fontSize: "0.875em", color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  /** Controls ride the outcome's place at the trailing edge, centred on the line so a button does not drop the row's baseline. */
  actions: { display: "inline-flex", flexWrap: "wrap", alignItems: "center", alignSelf: "center", gap: vars["--aui-space-4"], minWidth: 0 },
  /**
   * A value chip (`Badge`) in the row's own type: the chat font size, not the
   * chip's fixed caption, and no taller than the line, so a row of chips keeps
   * the text's rhythm.
   */
  chip: { fontSize: "inherit", lineHeight: vars["--aui-line-height-tight"], minBlockSize: 0, paddingBlock: 0, maxInlineSize: "100%" },
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
    blockSize: "auto", minBlockSize: 0, paddingBlock: 0, paddingInline: vars["--aui-space-8"], borderRadius: vars["--aui-radius-full"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid",
    borderColor: { default: vars["--aui-color-border"], ":hover": vars["--aui-color-border-strong"] },
    backgroundColor: { default: vars["--aui-color-surface-raised"], ":hover": vars["--aui-color-overlay-hover"] },
    color: vars["--aui-color-text"], cursor: "pointer",
    fontSize: "inherit", lineHeight: vars["--aui-line-height-tight"], fontWeight: vars["--aui-font-weight-medium"],
  },
});
