import * as stylex from "@stylexjs/stylex";
import { vars } from "../../ads/tokens/tokens.stylex";

/** Semantic tracker facts are translated to ADS visual roles only in the UI. */
export const priorityToneStyles = stylex.create({
  danger: { color: vars.colorDangerText },
  warning: { color: vars.colorWarningText },
  default: { color: vars.colorText },
  muted: { color: vars.colorTextMuted },
  subtle: { color: vars.colorTextSubtle },
});
export const labelColorStyles = stylex.create({
  neutral: { backgroundColor: vars.colorTextMuted },
  accent: { backgroundColor: vars.colorAccent },
  info: { backgroundColor: vars.colorInfo },
  warning: { backgroundColor: vars.colorWarning },
  warm: { backgroundColor: "var(--muse)" },
  success: { backgroundColor: vars.colorSuccess },
  danger: { backgroundColor: vars.colorDanger },
});
export const trackerVisualStyles = stylex.create({
  icon: { width: 14, height: 14, flexShrink: 0 },
  priorityIcon: { width: 16, height: 16 },
  count: { fontVariantNumeric: "tabular-nums", color: vars.colorTextMuted },
});
