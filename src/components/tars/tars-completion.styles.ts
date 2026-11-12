import * as stylex from "@stylexjs/stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const tarsCompletionStyles = stylex.create({
  // Fractional glyph metrics keep long tokens inside their line on Linux too.
  overview: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0, textRendering: "geometricPrecision" },
  lead: { margin: 0, minWidth: 0, overflowWrap: "anywhere", whiteSpace: "break-spaces", textRendering: "geometricPrecision", fontSize: vars["--aui-font-size-body"], lineHeight: vars["--aui-line-height-relaxed"], color: vars["--aui-color-text"] },
  meta: { margin: 0, overflowWrap: "anywhere", fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-normal"], color: vars["--aui-color-text-muted"] },
  warnings: { display: "grid", gap: vars["--aui-space-8"], margin: 0, padding: 0, listStyle: "none", color: vars["--aui-color-warning-text"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-normal"] },
  chatText: { fontSize: chatType["--chat-type-secondary"], lineHeight: "1.5" },
  notes: { display: "grid", gap: vars["--aui-space-8"], margin: 0, padding: 0, listStyle: "none", color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-normal"] },
  noteText: { margin: 0 },
  // Keep fractional glyph advances when wrapping, including on Linux with hinted fonts.
  // Preserved line-end spaces wrap inside the text box instead of hanging past it.
  wrap: { minWidth: 0, overflowWrap: "anywhere", whiteSpace: "break-spaces", textRendering: "geometricPrecision" },
  detail: { display: "grid", gap: vars["--aui-space-16"], minWidth: 0, paddingBlockStart: vars["--aui-space-12"] },
  disclosure: { fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-normal"] },
});
