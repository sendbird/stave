import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const goalStatusStyles = stylex.create({
  strip: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: vars["--ads-space-12"],
    paddingBlock: 10,
  },
  stripCompact: {
    borderRadius: vars["--ads-radius-control"],
    paddingInline: 10,
    paddingBlock: vars["--ads-space-8"],
  },
  toneSuccess: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-success-border"]} 30%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-success-border"]} 8%, transparent)`,
    color: vars["--ads-color-success-text"],
  },
  toneWarning: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-warning-border"]} 40%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-warning"]} 12%, transparent)`,
    color: vars["--ads-color-warning-text"],
  },
  // "No verdict yet" is not a state worth a color: the strip stays on the
  // neutral surface until success or warning has something to say.
  toneDefault: {
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
    color: vars["--ads-color-text-muted"],
  },
  header: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    rowGap: 6,
  },
  badge: {
    height: 20,
    gap: vars["--ads-space-4"],
    paddingInline: 6,
    fontSize: vars["--ads-font-size-micro"],
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
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  meta: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  progressTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 70%, transparent)`,
  },
  progressFill: {
    height: "100%",
    borderRadius: vars["--ads-radius-full"],
    transitionProperty: "width",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  progressFillSuccess: { backgroundColor: vars["--ads-color-success-border"] },
  progressFillWarning: { backgroundColor: vars["--ads-color-warning"] },
  progressFillDefault: { backgroundColor: vars["--ads-color-text-muted"] },
});
