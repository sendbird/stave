import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The conversation's text sizes, from the chat font size setting (the one the
 * task chat reads). The conversation column publishes it as `--tars-text-size`
 * (`useTarsTextScale`); a message drawn outside that column falls back to the
 * setting's default, 16px.
 */
export const TARS_TEXT_SIZE = "--tars-text-size";
const TEXT = `var(${TARS_TEXT_SIZE}, ${vars["--aui-font-size-lead"]})`;
/** Status lines and failure text: 14px beside 16px messages, never under the caption tier. */
const SECONDARY = `max(${vars["--aui-font-size-caption"]}, calc(${TEXT} * 0.875))`;
/** Times and file details: 12px beside 16px messages, never under the micro tier. */
const CAPTION = `max(${vars["--aui-font-size-micro"]}, calc(${TEXT} * 0.75))`;

/**
 * An exchange publishes whether it is hovered or holds focus, so its time can
 * appear without a descendant selector StyleX cannot express. A touch screen
 * has no hover, so there the time always shows.
 */
const REVEAL = "--tars-message-reveal";
/** An exchange's top padding; its time sits in it, just above the message it belongs to. */
const EXCHANGE_PAD = vars["--aui-space-8"];

export const tarsMessageStyles = stylex.create({
  /**
   * One message and everything it caused. In-turn rows sit 8px apart; with the
   * transcript's 12px gap, two exchanges sit 28px apart, the same rhythm as
   * the task chat's turns.
   */
  exchange: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    paddingBlock: EXCHANGE_PAD,
    minWidth: 0,
    [REVEAL]: {
      default: 0,
      ":hover": 1,
      ":focus-within": 1,
      "@media (hover: none)": 1,
    },
  },
  /**
   * The exchange's time, out of the flow so showing it never moves a line:
   * it sits in the gap above the message, on the side of whoever wrote it.
   */
  time: {
    position: "absolute",
    insetBlockEnd: `calc(100% - ${EXCHANGE_PAD})`,
    maxWidth: "100%",
    paddingBlockEnd: vars["--aui-space-2"],
    color: vars["--aui-color-text-muted"],
    fontSize: CAPTION,
    lineHeight: vars["--aui-line-height-caption"],
    whiteSpace: "nowrap",
    opacity: `var(${REVEAL}, 1)`,
    transitionProperty: { default: "opacity", "@media (prefers-reduced-motion: reduce)": "none" },
    transitionDuration: vars["--aui-motion-duration-quick"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  timeEnd: { insetInlineEnd: 0 },
  timeStart: { insetInlineStart: 0 },
  /**
   * The user's bubble ends on the column's trailing edge and is only as wide
   * as its words, up to most of the row, so a long message still leaves the
   * leading side open and the two sides never read as one block.
   */
  userColumn: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: vars["--aui-space-4"], minWidth: 0, width: "100%" },
  userBubble: { minWidth: 0, width: "fit-content", maxWidth: "88%" },
  messageText: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  /** What came with the message, above its bubble on the same side: its files, then the working-changes choice. */
  fileList: {
    display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: vars["--aui-space-4"], maxWidth: "88%", minWidth: 0,
    margin: 0, padding: 0, listStyle: "none",
  },
  fileItem: { display: "flex", minWidth: 0, maxWidth: "100%" },
  /** A chip never grows past the column; a long name ends in an ellipsis. */
  chip: { maxInlineSize: "min(100%, 20rem)" },
  fileIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0 },
  /** A picked image's own pixels, the size of a small control, in the composer's chip. */
  thumbnail: {
    display: "block", flexShrink: 0, width: vars["--aui-control-height-2xs"], height: vars["--aui-control-height-2xs"],
    borderRadius: vars["--aui-radius-mark"], objectFit: "cover", backgroundColor: vars["--aui-color-surface-tint"],
  },
  /** The composer's picked files, between the words and the controls, like the task composer's. */
  composerFiles: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"], minWidth: 0 },
  /** Where Tars's reply will be: what the message is doing now, one quiet line. */
  status: {
    display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, minHeight: vars["--aui-control-height-2xs"],
    margin: 0, color: vars["--aui-color-text-muted"], fontSize: SECONDARY, lineHeight: vars["--aui-line-height-control"],
  },
  statusLabel: { minWidth: 0, overflowWrap: "anywhere" },
  cancelIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0 },
  /** A failure in the conversation: the AUI notice at the conversation's secondary size, compact enough to sit between messages. */
  notice: { paddingBlock: vars["--aui-space-12"], paddingInline: vars["--aui-space-16"], gap: vars["--aui-space-8"] },
  noticeTitle: { fontSize: SECONDARY },
  noticeBody: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], fontSize: SECONDARY, color: vars["--aui-color-text-muted"] },
  noticeText: { margin: 0 },
  actionIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0 },
  /**
   * The composer's working-changes toggle as a borderless icon button, like
   * Attach files and the task composer's own toolbar buttons
   * (`controlChrome.triggerQuiet` drops the border and fill; this drops the
   * raised shadow and mutes the glyph until hovered).
   */
  toggleQuiet: {
    boxShadow: "none",
    color: { default: vars["--aui-color-text-muted"], "@media (hover: hover)": { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] } },
  },
  /** On: the selected fill under an accent glyph, so it reads as on without becoming a second Send. */
  toggleQuietPressed: {
    boxShadow: "none",
    borderWidth: 0,
    backgroundColor: vars["--aui-color-selection-fill"],
    color: vars["--aui-color-accent"],
  },
});
