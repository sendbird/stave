import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";

/**
 * Card text reads the conversation's type scale (`chat-type.stylex.ts`), set
 * by the conversation column from the chat font size setting: the title and
 * the effect take `body`, secondary lines (the work, rows, notes) take
 * `secondary`, as the record rail beside the card does (14px beside 16px
 * messages). Outside the column (the side view) the scale's default applies.
 */
const TEXT = chatType["--chat-type-body"];
const TEXT_LEADING = chatType["--chat-type-body-leading"];
const SECONDARY = chatType["--chat-type-secondary"];
const LEADING = chatType["--chat-type-secondary-leading"];

/**
 * A decision card follows the AUI #809 scoped permission request (`Approval`
 * with `scopes`): a bounded ring + raised card the person acts on. It leads
 * with what will happen (the title, the work, the effect), shows the words or
 * the request it carries only when it has them, and keeps where it runs
 * behind a Details disclosure. Once answered or invalid it folds to one line.
 * The component itself is not used: a Tars decision has no grant scope, no
 * Deny (Not now leaves it waiting) and key choices.
 */
export const tarsDecisionStyles = stylex.create({
  card: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0, margin: 0,
    padding: vars["--aui-space-16"], boxSizing: "border-box",
    backgroundColor: vars["--aui-color-surface"], boxShadow: vars["--aui-elevation-raised"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"], color: vars["--aui-color-text"],
    fontSize: SECONDARY, lineHeight: LEADING,
  },
  detail: { margin: 0, minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: SECONDARY, lineHeight: LEADING, overflowWrap: "anywhere" },
  option: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-4"], minWidth: 0 },
  /** Labels are short but may wrap at narrow widths; AUI keeps the control's minimum height and chrome. */
  optionButton: { justifyContent: "flex-start", maxWidth: "100%", minWidth: 0, paddingBlock: vars["--aui-space-4"], textAlign: "start", whiteSpace: "normal" },
  optionLabel: { minWidth: 0, overflowWrap: "anywhere" },
  keys: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], flexShrink: 0 },
  /** What it does to which work, then a tag only when it says something the buttons do not (it can't be undone, the work is still being checked). Narrow, the tags wrap under the heading. */
  confirmHeader: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-8"], minWidth: 0 },
  icon: { flexShrink: 0 },
  heading: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: vars["--aui-space-4"], flex: "1 1 14rem", minWidth: 0 },
  title: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: TEXT, fontWeight: vars["--aui-font-weight-medium"], lineHeight: TEXT_LEADING, overflowWrap: "anywhere" },
  /** The work the decision is about: a question's "About …" line, a confirmation's work chip. */
  subtitle: { margin: 0, maxWidth: "100%", minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: SECONDARY, lineHeight: LEADING, overflowWrap: "anywhere" },
  tags: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-4"], flex: "0 1 auto", minWidth: 0, marginInlineStart: "auto" },
  /** What will happen, in the messages' own size: the sentence the decision turns on. */
  effect: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: TEXT, lineHeight: TEXT_LEADING, overflowWrap: "anywhere" },
  /** What the decision carries (the request, the answers, the words), under its label. */
  payload: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, margin: 0 },
  payloadLabel: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: SECONDARY, lineHeight: LEADING },
  /** Words and answers as written, keeping their line breaks. */
  payloadText: { margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontSize: SECONDARY, lineHeight: LEADING, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  /**
   * A tool request in the code register: mono, wrapped at the card's edge
   * (never a sideways scroll that hides part of what runs), its line breaks
   * kept, in the card's recessed well (`agentSurface.well` owns its fill and
   * padding).
   */
  command: {
    margin: 0, minWidth: 0, color: vars["--aui-color-text"], fontFamily: vars["--aui-font-mono"], fontSize: SECONDARY,
    lineHeight: LEADING, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
  },
  commandCode: { fontFamily: "inherit", fontSize: "inherit" },
  /** Under a request cut to fit: that it was cut, and the task that shows it whole. */
  truncation: {
    display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"],
    color: vars["--aui-color-warning-text"], fontSize: SECONDARY, lineHeight: LEADING, whiteSpace: "normal",
  },
  /** Where the decision runs, folded: a quiet disclosure row whose words sit at the card's secondary size. */
  details: { fontSize: SECONDARY },
  /** The trigger keeps its hover fill by reaching that fill's padding past the card's content edge, so its glyph lines up with the text above. */
  detailsTrigger: { marginInlineStart: `calc(${vars["--aui-space-8"]} * -1)`, fontSize: "inherit", lineHeight: LEADING },
  /** Label left, value right in the disclosure's well (`inlineDisclosure.body` owns its fill and padding). */
  rows: { margin: 0, display: "grid", gap: vars["--aui-space-4"] },
  row: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-2"], minWidth: 0 },
  rowLabel: { flex: "0 0 7rem", minWidth: 0, margin: 0, color: vars["--aui-color-text-muted"], fontSize: SECONDARY, lineHeight: LEADING },
  rowValue: { flex: "1 1 12rem", minWidth: 0, margin: 0, color: vars["--aui-color-text"], fontSize: SECONDARY, lineHeight: LEADING, overflowWrap: "anywhere" },
  /** The question's options at the card's secondary size; each row's own layout is the shared question row's. */
  options: { fontSize: SECONDARY },
  footer: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: vars["--aui-space-8"], minWidth: 0 },
  footerActions: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: vars["--aui-space-8"], marginInlineStart: "auto", minWidth: 0 },
  footerOptions: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  /** A refused attempt under the options, as an in-context alert in the card's type. */
  attempt: { fontSize: SECONDARY },
  attemptText: { fontSize: "inherit" },
  error: { margin: 0, color: vars["--aui-color-danger-text"], fontSize: SECONDARY, overflowWrap: "anywhere" },
});
