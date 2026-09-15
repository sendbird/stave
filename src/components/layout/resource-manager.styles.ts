import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const managerStyles = stylex.create({
  section: { display: "grid", gap: 10 },
  toolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  muted: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  list: { overflowY: "auto", minHeight: 0, maxHeight: "min(52vh, 32rem)", borderBlockWidth: 1, borderBlockStyle: "solid", borderBlockColor: vars["--ads-color-border"] },
  row: { display: "flex", alignItems: "center", gap: 10, paddingBlock: 10, paddingInline: 4, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border"] },
  identity: { flex: 1, minWidth: 0, display: "grid", gap: 4 },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  value: { fontFamily: vars["--ads-font-mono"], fontSize: vars["--ads-font-size-caption"], whiteSpace: "nowrap" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  dialog: { width: "min(64rem, calc(100vw - 2rem))", maxWidth: "calc(100vw - 2rem)", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 12 },
  filters: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  search: { flex: 1, minWidth: 180 },
  name: { fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  message: { fontSize: vars["--ads-font-size-caption"], overflowWrap: "anywhere" },
  summary: { cursor: "pointer", paddingBlock: 10, fontWeight: 500 },
  groupName: { display: "inline-block", maxWidth: "calc(100% - 7rem)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" },
  group: { paddingBlock: 4, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border"] },
  detail: { display: "grid", gap: 6, paddingInlineStart: 14, paddingBlock: 8 },
  process: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: vars["--ads-font-size-caption"] },
});
