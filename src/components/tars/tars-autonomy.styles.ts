import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** The autonomy level's summary table, the "never do" rule list and a matched rule's notice on a card. */
export const tarsAutonomyStyles = stylex.create({
  group: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  /** The row's name leads the actions it lists; both wrap in the narrow settings sheet. */
  when: { width: "36%", verticalAlign: "top", overflowWrap: "anywhere", fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"], fontWeight: vars["--aui-font-weight-medium"] },
  actions: { verticalAlign: "top", overflowWrap: "anywhere", fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  rules: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  rule: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-8"], minWidth: 0 },
  ruleText: { flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere", fontSize: vars["--aui-font-size-row"] },
  addRow: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  addInput: { flex: "1 1 auto", minWidth: 0 },
  /** The button keeps its whole label; the field beside it takes what is left. */
  addButton: { flexShrink: 0 },
  matches: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], margin: 0, padding: 0, listStyle: "none", overflowWrap: "anywhere" },
});
