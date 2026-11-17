import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Clear controls in the tray, the instructions field's default action and the suggestion chips above the composer. */
export const tarsClearStyles = stylex.create({
  /** A lane's own controls under its header: what it leaves out on the start side, Clear on the end. */
  laneTools: {
    display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"],
    minWidth: 0, paddingInline: vars["--aui-space-12"], paddingBlockEnd: vars["--aui-space-4"],
  },
  laneNote: { flex: "1 1 10rem", minWidth: 0, margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], overflowWrap: "anywhere" },
  laneError: { flex: "1 1 100%", color: vars["--aui-color-danger-text"] },
  laneActions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-4"], marginInlineStart: "auto", minWidth: 0 },
  /** The instructions field's label line: the label, then the default action on the end. */
  fieldHead: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  /** Short chips in a wrapping row above the composer, on the composer's own column. */
  chips: {
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, margin: 0,
    paddingInline: 0, paddingBlockStart: 0, paddingBlockEnd: vars["--aui-space-8"], listStyle: "none",
  },
  chipItem: { maxWidth: "100%", minWidth: 0 },
  chipButton: { maxWidth: "100%", minWidth: 0 },
  chipLabel: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});
