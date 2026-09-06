import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Nested open-task tree under a workspace row in the project sidebar. */
export const workspaceProgressTaskTreeStyles = stylex.create({
  list: {
    borderInlineStartColor: vars.colorBorderSubtle,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
    listStyleType: "none",
    marginBlock: 0,
    marginBlockStart: vars.space2,
    marginInlineStart: vars.space20,
    minWidth: 0,
    paddingInline: 0,
    paddingInlineStart: vars.space8,
  },
  loadingRow: {
    alignItems: "center",
    borderRadius: vars.radiusControl,
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    minHeight: 32,
    paddingBlock: 6,
    paddingInline: vars.space8,
  },
  row: {
    alignItems: "center",
    borderRadius: vars.radiusControl,
    color: { default: vars.colorText, ":hover": vars.colorText },
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    minHeight: 32,
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars.space8,
    textAlign: "start",
    width: "100%",
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statusSlot: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  statusIcon: { height: vars.controlIconSizeSm, width: vars.controlIconSizeSm },
  providerMark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  providerIcon: { height: vars.controlIconSizeSm, width: vars.controlIconSizeSm },
  accent: { color: vars.colorAccent },
});

/** Status tone for the trailing mark; keyed by `FleetTaskStatus`. */
export const workspaceProgressStatusToneStyles = stylex.create({
  "waiting-input": { color: vars.colorWarningText },
  "waiting-approval": { color: vars.colorWarningText },
  error: { color: vars.colorDangerText },
  running: { color: vars.colorAccent },
  idle: { color: vars.colorTextMuted },
});
