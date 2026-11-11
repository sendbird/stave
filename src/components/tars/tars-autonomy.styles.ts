import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** The autonomy level's summary table, the "never do" rule list and a matched rule's notice on a card. */
export const tarsAutonomyStyles = stylex.create({
  group: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  details: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], margin: 0, paddingBlock: vars["--aui-space-12"] },
  rowTitle: { fontSize: vars["--aui-font-size-row"], fontWeight: vars["--aui-font-weight-medium"] },
  actions: { margin: 0, overflowWrap: "anywhere", fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], color: vars["--aui-color-text-muted"] },
  chevron: { flexShrink: 0 },
  chevronOpen: { transform: "rotate(90deg)" },
  rules: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  rule: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  ruleText: { flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere", fontSize: vars["--aui-font-size-row"] },
  addRow: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  addInput: { flex: "1 1 auto", minWidth: 0 },
  /** The button keeps its whole label; the field beside it takes what is left. */
  addButton: { flexShrink: 0 },
  matches: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], margin: 0, padding: 0, listStyle: "none", overflowWrap: "anywhere" },
});
