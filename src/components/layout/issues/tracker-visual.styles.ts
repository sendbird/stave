import * as stylex from "@stylexjs/stylex";
import { vars } from "../../aui/tokens/tokens.stylex";

/** Semantic tracker facts are translated to AUI visual roles only in the UI. */
export const priorityToneStyles = stylex.create({
  danger: { color: vars["--aui-color-danger-text"] },
  warning: { color: vars["--aui-color-warning-text"] },
  neutral: { color: vars["--aui-color-text"] },
  muted: { color: vars["--aui-color-text-muted"] },
  subtle: { color: vars["--aui-color-text-subtle"] },
});
export const labelColorStyles = stylex.create({
  neutral: { backgroundColor: vars["--aui-color-text-muted"] },
  accent: { backgroundColor: vars["--aui-color-accent"] },
  info: { backgroundColor: vars["--aui-color-info"] },
  warning: { backgroundColor: vars["--aui-color-warning"] },
  warm: { backgroundColor: "var(--muse)" },
  success: { backgroundColor: vars["--aui-color-success"] },
  danger: { backgroundColor: vars["--aui-color-danger"] },
});
export const trackerVisualStyles = stylex.create({
  icon: { width: 14, height: 14, flexShrink: 0 },
  priorityIcon: { width: 16, height: 16 },
  count: { fontVariantNumeric: "tabular-nums", color: vars["--aui-color-text-muted"] },
});
