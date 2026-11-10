import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";

/**
 * The summary's text reads the conversation's type scale
 * (`chat-type.stylex.ts`), on the record rail's steps: its title at `body`,
 * its lines at `secondary` (14px beside 16px messages) and its time at `meta`.
 */
const TEXT = chatType["--chat-type-body"];
const LINE_TEXT = chatType["--chat-type-secondary"];
const LINE_LEADING = chatType["--chat-type-secondary-leading"];
const TIME_TEXT = chatType["--chat-type-meta"];
const TIME_LEADING = chatType["--chat-type-meta-leading"];
/** The mark's column, as wide as the record rail's, so the summary's marks line up with the records under it. */
const MARK_SLOT = vars["--aui-space-16"];

/**
 * "While you were away": one stationary panel in the transcript. It is read,
 * not answered, so it has a hairline perimeter and no elevation, unlike a
 * decision card. Each group is a mark and a count over the work it names.
 */
export const tarsAwaySummaryStyles = stylex.create({
  card: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0, margin: 0, boxSizing: "border-box",
    padding: vars["--aui-space-16"],
    // Brought into view, it keeps the transcript's own gap from the edge above it.
    scrollMarginBlockStart: vars["--aui-space-12"],
    backgroundColor: vars["--aui-color-surface-raised"], borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-border"],
    color: vars["--aui-color-text"], fontSize: LINE_TEXT, lineHeight: LINE_LEADING,
  },
  /** The title and its time on the start side, Dismiss on the end; narrow, Dismiss keeps the first line. */
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  heading: { display: "flex", flexDirection: "column", gap: vars["--aui-space-2"], flex: "1 1 auto", minWidth: 0 },
  title: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: TEXT, fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"], overflowWrap: "anywhere" },
  since: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: TIME_TEXT, lineHeight: TIME_LEADING },
  dismiss: { flexShrink: 0 },
  groups: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  /** The mark in its own column; the count and the work it names share the text column. */
  group: { display: "grid", gridTemplateColumns: `${MARK_SLOT} minmax(0, 1fr)`, columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"], minWidth: 0 },
  /** One text line tall, so the mark stays on the count's line. */
  markSlot: { display: "inline-flex", alignItems: "center", justifyContent: "center", inlineSize: MARK_SLOT, blockSize: "1lh" },
  count: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"], overflowWrap: "anywhere" },
  items: { gridColumnStart: 2, display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  /** The work, what became of it, then its link; narrow, they wrap in that order. */
  item: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-2"], minWidth: 0 },
  /** A question that names no work: its own words on one line, in full in its tooltip. */
  question: { flex: "0 1 auto", minWidth: 0, maxInlineSize: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: vars["--aui-color-text"] },
  note: { flexShrink: 0, color: vars["--aui-color-text-muted"], whiteSpace: "nowrap" },
  more: { color: vars["--aui-color-text-muted"] },
  footer: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  jumpIcon: { flexShrink: 0 },
});
