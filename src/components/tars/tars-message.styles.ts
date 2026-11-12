import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";

/**
 * The conversation's type scale (`chat-type.stylex.ts`), which the Tars column
 * sets from the chat font size setting the task chat also reads
 * (`useTarsTextScale`). Status lines and failures take `secondary`; times and
 * file details `meta`. A message drawn outside that column reads the scale at
 * the setting's default, 16px.
 */
const SECONDARY = chatType["--chat-type-secondary"];
const SECONDARY_LEADING = chatType["--chat-type-secondary-leading"];
const META = chatType["--chat-type-meta"];
const META_LEADING = chatType["--chat-type-meta-leading"];

/**
 * An exchange publishes whether it is hovered or holds focus, so the time
 * beside its bubble (`tarsTranscriptStyles.edgeTime`) can appear without a
 * descendant selector StyleX cannot express. A touch screen has no hover, so
 * there the time always shows.
 */
const REVEAL = "--tars-message-reveal";
/** An exchange's block padding. */
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
  /** A chip's name and its size and type, on the scale's secondary and meta steps (AUI sets fixed 14px and 12px). */
  chipName: { fontSize: SECONDARY, lineHeight: SECONDARY_LEADING },
  chipMeta: { fontSize: META, lineHeight: META_LEADING },
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
    margin: 0, color: vars["--aui-color-text-muted"], fontSize: SECONDARY, lineHeight: SECONDARY_LEADING,
  },
  /** The rail's 16px mark slot (`tarsRecordStyles.markSlot`): the words start on the records' text column. */
  statusMark: { display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, inlineSize: vars["--aui-space-16"] },
  statusLabel: { minWidth: 0, overflowWrap: "anywhere" },
  cancelIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0 },
  /** A failure in the conversation: the AUI notice at the conversation's secondary size, compact enough to sit between messages. */
  notice: { paddingBlock: vars["--aui-space-12"], paddingInline: vars["--aui-space-16"], gap: vars["--aui-space-8"] },
  noticeTitle: { fontSize: SECONDARY, lineHeight: SECONDARY_LEADING },
  noticeBody: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], fontSize: SECONDARY, lineHeight: SECONDARY_LEADING, color: vars["--aui-color-text-muted"] },
  noticeText: { margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
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
