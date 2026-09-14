import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const statusTrayStyles = stylex.create({
  row: { display: "flex", flexShrink: 0, alignItems: "center", gap: vars["--ads-space-4"] },
  /**
   * Chrome only. The box comes from ADS `size="icon-sm"` (`controlSquares.sm`,
   * 32 on both axes), which is the `sm` rung the shelf lane puts every other
   * control on — the old 24px literal was the reason the folded tray sat
   * shorter than the controls it replaced.
   */
  trigger: { borderRadius: vars["--ads-radius-control"], borderWidth: vars["--ads-border-width-hairline"], borderStyle: "solid", borderColor: "transparent", backgroundColor: "transparent", padding: 0, color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] } },
  triggerHover: { backgroundColor: { default: "transparent", ":hover": vars["--ads-color-surface-tint"] } },
  icon: { inlineSize: vars["--ads-control-icon-size-md"], blockSize: vars["--ads-control-icon-size-md"], flexShrink: 0 },
});
