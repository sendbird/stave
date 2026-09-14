import * as stylex from "@stylexjs/stylex";
import { vars } from "../../ads/tokens/tokens.stylex";

/** Semantic tracker facts are translated to ADS visual roles only in the UI. */
export const priorityToneStyles = stylex.create({
  danger: { color: vars["--ads-color-danger-text"] },
  warning: { color: vars["--ads-color-warning-text"] },
  default: { color: vars["--ads-color-text"] },
  muted: { color: vars["--ads-color-text-muted"] },
  subtle: { color: vars["--ads-color-text-subtle"] },
});
export const labelColorStyles = stylex.create({
  neutral: { backgroundColor: vars["--ads-color-text-muted"] },
  accent: { backgroundColor: vars["--ads-color-accent"] },
  info: { backgroundColor: vars["--ads-color-info"] },
  warning: { backgroundColor: vars["--ads-color-warning"] },
  warm: { backgroundColor: "var(--muse)" },
  success: { backgroundColor: vars["--ads-color-success"] },
  danger: { backgroundColor: vars["--ads-color-danger"] },
});
export const trackerVisualStyles = stylex.create({
  icon: { width: 14, height: 14, flexShrink: 0 },
  priorityIcon: { width: 16, height: 16 },
  count: { fontVariantNumeric: "tabular-nums", color: vars["--ads-color-text-muted"] },
});
