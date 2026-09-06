import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const statusTrayStyles = stylex.create({
  row: { display: "flex", flexShrink: 0, alignItems: "center", gap: vars.space4 },
  trigger: { width: 24, height: 24, minHeight: 24, borderRadius: vars.radiusControl, borderWidth: 1, borderStyle: "solid", borderColor: "transparent", backgroundColor: "transparent", padding: 0, color: { default: vars.colorTextMuted, ":hover": vars.colorText } },
  triggerHover: { backgroundColor: { default: "transparent", ":hover": vars.colorSurfaceTint } },
  icon: { width: 16, height: 16 },
});
