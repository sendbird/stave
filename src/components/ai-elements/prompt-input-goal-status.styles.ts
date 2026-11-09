import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const goalStatusStyles = stylex.create({
  strip: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: vars["--aui-space-12"],
    paddingBlock: 10,
  },
  stripCompact: {
    borderRadius: vars["--aui-radius-control"],
    paddingInline: 10,
    paddingBlock: vars["--aui-space-8"],
  },
  toneSuccess: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-success-border"]} 30%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-success-border"]} 8%, transparent)`,
    color: vars["--aui-color-success-text"],
  },
  toneWarning: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-warning-border"]} 40%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-warning"]} 12%, transparent)`,
    color: vars["--aui-color-warning-text"],
  },
  // "No verdict yet" is not a state worth a color: the strip stays on the
  // neutral surface until success or warning has something to say.
  toneDefault: {
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface"],
    color: vars["--aui-color-text-muted"],
  },
  header: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    rowGap: 6,
  },
  badge: {
    height: 20,
    gap: vars["--aui-space-4"],
    paddingInline: 6,
    fontSize: vars["--aui-font-size-micro"],
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  badgeIcon: { width: 12, height: 12 },
  objective: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  meta: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text-muted"],
  },
  progressTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 70%, transparent)`,
  },
  progressFill: {
    height: "100%",
    borderRadius: vars["--aui-radius-full"],
    transitionProperty: "width",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  progressFillSuccess: { backgroundColor: vars["--aui-color-success-border"] },
  progressFillWarning: { backgroundColor: vars["--aui-color-warning"] },
  progressFillDefault: { backgroundColor: vars["--aui-color-text-muted"] },
});
