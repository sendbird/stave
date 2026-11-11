import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const tarsSettingsStyles = stylex.create({
  form: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 },
  tabs: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 },
  tabList: { flexShrink: 0, paddingInline: vars["--aui-space-16"] },
  panel: { flex: 1, minHeight: 0, minWidth: 0, overflowY: "auto", padding: vars["--aui-space-16"] },
  stack: { display: "flex", flexDirection: "column", gap: vars["--aui-space-20"], minWidth: 0 },
  footer: { display: "flex", justifyContent: "flex-end", flexShrink: 0, padding: vars["--aui-space-16"] },
  error: { margin: 0, paddingInline: vars["--aui-space-16"] },
  heading: { margin: 0, fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"] },
});
