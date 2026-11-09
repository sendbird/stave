import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { transcriptMeasure } from "@/components/ai-elements/transcript-measure.stylex";

export const tarsStyles = stylex.create({
  /** Korean wraps between words through the AUI line-break policy (`textWrap.keepAll`, applied with this root). */
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, color: vars["--aui-color-text"], backgroundColor: vars["--aui-color-canvas"], fontSize: vars["--aui-font-size-body"], lineHeight: vars["--aui-line-height-prose"] },
  workspace: { display: "flex", minHeight: 0, minWidth: 0, flex: 1, overflow: "hidden" },
  chat: { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, flex: 1 },
  /** A size container, so the composer's controls follow its own width, not the window's (the tray and side view take room). */
  composer: { containerType: "inline-size", containerName: "tars-composer", flexShrink: 0, width: "100%", marginInline: "auto", maxWidth: { default: `calc(${transcriptMeasure["--stave-transcript-column"]} + 2 * ${vars["--aui-space-12"]})`, "@media (min-width: 640px)": `calc(${transcriptMeasure["--stave-transcript-column"]} + 2 * ${vars["--aui-space-20"]})` }, paddingInline: { default: vars["--aui-space-12"], "@media (min-width: 640px)": vars["--aui-space-20"] }, paddingBlock: vars["--aui-space-12"] },
  settingsBody: { display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", gap: vars["--aui-space-16"], padding: vars["--aui-space-16"] },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0 },
  exchange: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], paddingBlock: vars["--aui-space-12"], minWidth: 0 },
  /** Tars's name and mark over its reply: the reply's side reads as Tars's at any width, without a bubble. Row size (13px), like the rest of the conversation's meta text. */
  author: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"], margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-control"] },
  authorMark: { flexShrink: 0, width: "1.25em", height: "1.25em" },
  /**
   * The user's bubble ends on the column's trailing edge and is only as wide
   * as its words, up to most of the row, so a long message still leaves the
   * leading side open and the two sides never read as one block.
   */
  userBubble: { minWidth: 0, width: "fit-content", maxWidth: "88%" },
  /** The time and state of the user's message follow its bubble on the trailing side. */
  metaUser: { justifyContent: "flex-end" },
  workingChangesToggle: { minWidth: 0 },
  /** Icon-only once the composer is narrow; the accessible name is unchanged. */
  workingChangesLabel: { display: { default: "inline", "@container tars-composer (max-width: 28rem)": "none" }, whiteSpace: "nowrap" },
  toggleIcon: { width: "1em", height: "1em" },
  text: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], overflowWrap: "anywhere" },
  field: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, fontSize: vars["--aui-font-size-body"] },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"] },
  error: { color: vars["--aui-color-danger-text"], overflowWrap: "anywhere" },
  errorBar: { color: vars["--aui-color-danger-text"], overflowWrap: "anywhere", paddingInline: vars["--aui-space-20"], flexShrink: 0 },
  full: { width: "100%" },
  messageText: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  actionRecord: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: vars["--aui-space-8"], margin: 0, paddingBlock: vars["--aui-space-4"], minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], overflowWrap: "anywhere" },
  recordTitle: { color: vars["--aui-color-text"], minWidth: 0 },
  /** A decorative mark (the record arrow): the AUI #809 fourth, faint ink, never load-bearing. */
  glyph: { color: vars["--aui-color-text-faint"] },
  receipts: { margin: 0, paddingInlineStart: vars["--aui-space-20"], display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], overflowWrap: "anywhere" },
});
