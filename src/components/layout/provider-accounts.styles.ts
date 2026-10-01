import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const accountStyles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 },
  field: { flexGrow: 1, flexBasis: 180, minWidth: 120 },
  muted: { color: vars["--ads-color-text-muted"], fontSize: 12, overflowWrap: "anywhere" },
  error: { color: vars["--ads-color-danger-text"], fontSize: 12 },
  profile: { paddingBlock: 8, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border"] },
  terminal: { height: 280, minHeight: 200, overflow: "hidden", position: "relative" },
  picker: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, paddingBlock: 4, fontSize: 12, color: vars["--ads-color-text-muted"] },
  pickerSelect: { width: 240, maxWidth: "100%" },
});
