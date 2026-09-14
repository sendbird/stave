import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Flat open-task list under a workspace row in the project sidebar. */
export const workspaceProgressTaskTreeStyles = stylex.create({
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    listStyleType: "none",
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-2"],
    marginInlineStart: vars["--ads-space-20"],
    minWidth: 0,
    paddingInline: 0,
  },
  loadingRow: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    minHeight: 32,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
  },
  row: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text"], ":hover": vars["--ads-color-text"] },
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    minHeight: 32,
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
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
  statusIcon: { height: vars["--ads-control-icon-size-sm"], width: vars["--ads-control-icon-size-sm"] },
  providerMark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  providerIcon: { height: vars["--ads-control-icon-size-sm"], width: vars["--ads-control-icon-size-sm"] },
  accent: { color: vars["--ads-color-accent"] },
});

/** Status tone for the trailing mark; keyed by `FleetTaskStatus`. */
export const workspaceProgressStatusToneStyles = stylex.create({
  "waiting-input": { color: vars["--ads-color-warning-text"] },
  "waiting-approval": { color: vars["--ads-color-warning-text"] },
  error: { color: vars["--ads-color-danger-text"] },
  running: { color: vars["--ads-color-accent"] },
  idle: { color: vars["--ads-color-text-muted"] },
});
