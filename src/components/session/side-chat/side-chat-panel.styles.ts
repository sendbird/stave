import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { transcriptMeasure } from "@/components/ai-elements/transcript-measure.stylex";

export const sideChatStyles = stylex.create({
  // Conversation panels sit just above the composer, aligned to its measure.
  // The overlay passes clicks through; the card keeps its own scroll region.
  card: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 80%, transparent)`,
    borderRadius: vars["--aui-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-overlay"],
    display: "flex",
    flexDirection: "column",
    insetInlineEnd: vars["--aui-space-12"],
    maxHeight: `calc(100% - 2 * ${vars["--aui-space-12"]})`,
    minHeight: 0,
    overflow: "hidden",
    pointerEvents: "auto",
    position: "absolute",
    bottom: vars["--aui-space-12"],
    width: `min(28rem, calc(100% - 2 * ${vars["--aui-space-12"]}))`,
  },
  // Ends on the framed composer's outer edge: the transcript column plus its
  // two 3.125rem wing tracks (`chatInputStyles.measureFramed`), centred in the
  // same surface, or the composer's 16px inset once that measure fills it.
  conversationCard: {
    insetInlineEnd: {
      default: vars["--aui-space-12"],
      "@media (min-width: 40rem)": `max(${vars["--aui-space-16"]}, calc((100% - ${transcriptMeasure["--stave-transcript-column"]} - 2 * 3.125rem) / 2))`,
    },
  },
  reviewCard: {
    bottom: "auto",
    top: vars["--aui-space-12"],
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInlineEnd: vars["--aui-space-8"],
    paddingInlineStart: vars["--aui-space-12"],
  },
  headerIcon: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    height: 16,
    width: 16,
  },
  headerText: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minWidth: 0,
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: "1.25rem",
    margin: 0,
  },
  note: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  body: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: vars["--aui-space-12"],
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  emptyText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  suggestions: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  suggestion: {
    maxWidth: "100%",
  },
  thread: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-20"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  exchange: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  // The conversation's user bubble, so the asked question reads as yours.
  question: {
    alignSelf: "flex-end",
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-panel"],
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    maxWidth: "85%",
    overflowWrap: "anywhere",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    whiteSpace: "pre-wrap",
  },
  status: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    margin: 0,
  },
  reply: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  answer: {
    minWidth: 0,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    marginInlineStart: `calc(-1 * ${vars["--aui-space-8"]})`,
  },
  byline: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginInlineStart: "auto",
  },
  footer: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
    padding: vars["--aui-space-12"],
  },
  composer: {
    alignItems: "flex-end",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  // One row to start, growing with the question up to six rows, then scrolling.
  field: {
    fieldSizing: "content",
    flex: 1,
    maxBlockSize: `calc(6 * ${vars["--aui-line-height-normal"]} * 1em + 2 * ${vars["--aui-space-8"]} + 2 * ${vars["--aui-border-width-hairline"]})`,
    minBlockSize: `calc(${vars["--aui-line-height-normal"]} * 1em + 2 * ${vars["--aui-space-8"]} + 2 * ${vars["--aui-border-width-hairline"]})`,
    minWidth: 0,
    paddingBlock: vars["--aui-space-8"],
    resize: "none",
  },
  hint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
  },
});
