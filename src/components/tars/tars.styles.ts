import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { transcriptMeasure } from "@/components/ai-elements/transcript-measure.stylex";

export const tarsStyles = stylex.create({
  /** Korean wraps between words through the AUI line-break policy (`textWrap.keepAll`, applied with this root). */
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, color: vars["--aui-color-text"], backgroundColor: vars["--aui-color-canvas"] },
  workspace: { display: "flex", minHeight: 0, minWidth: 0, flex: 1, overflow: "hidden" },
  chat: { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, flex: 1 },
  composer: { flexShrink: 0, width: "100%", marginInline: "auto", maxWidth: { default: `calc(${transcriptMeasure["--stave-transcript-column"]} + 2 * ${vars["--aui-space-12"]})`, "@media (min-width: 640px)": `calc(${transcriptMeasure["--stave-transcript-column"]} + 2 * ${vars["--aui-space-20"]})` }, paddingInline: { default: vars["--aui-space-12"], "@media (min-width: 640px)": vars["--aui-space-20"] }, paddingBlock: vars["--aui-space-12"] },
  settingsBody: { display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", gap: vars["--aui-space-16"], padding: vars["--aui-space-16"] },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0 },
  exchange: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], paddingBlock: vars["--aui-space-12"], minWidth: 0 },
  author: { margin: 0, marginBottom: vars["--aui-space-8"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  text: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  field: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, fontSize: vars["--aui-font-size-caption"] },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"] },
  error: { color: vars["--aui-color-danger-text"], overflowWrap: "anywhere" },
  errorBar: { color: vars["--aui-color-danger-text"], overflowWrap: "anywhere", paddingInline: vars["--aui-space-20"], flexShrink: 0 },
  full: { width: "100%" },
  messageText: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  actionRecord: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: vars["--aui-space-8"], margin: 0, paddingBlock: vars["--aui-space-4"], minWidth: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  recordTitle: { color: vars["--aui-color-text"], minWidth: 0 },
  /** A decorative mark (the record arrow): the AUI #809 fourth, faint ink, never load-bearing. */
  glyph: { color: vars["--aui-color-text-faint"] },
  receipts: { margin: 0, paddingInlineStart: vars["--aui-space-20"], display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], overflowWrap: "anywhere" },
});
