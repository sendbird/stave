import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const statusTrayStyles = stylex.create({
  row: { display: "flex", flexShrink: 0, alignItems: "center", gap: vars["--aui-space-4"] },
  /**
   * Chrome only. The box comes from AUI `size="icon-sm"` (`controlSquares.sm`,
   * 32 on both axes), which is the `sm` rung the shelf lane puts every other
   * control on — the old 24px literal was the reason the folded tray sat
   * shorter than the controls it replaced.
   */
  trigger: { borderRadius: vars["--aui-radius-control"], borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: "transparent", backgroundColor: "transparent", padding: 0, color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] } },
  triggerHover: { backgroundColor: { default: "transparent", ":hover": vars["--aui-color-surface-tint"] } },
  icon: { inlineSize: vars["--aui-control-icon-size-md"], blockSize: vars["--aui-control-icon-size-md"], flexShrink: 0 },
});
