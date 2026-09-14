import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const toolStyles = stylex.create({
  root: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
  },
  badgeMuted: { color: vars["--ads-color-text-muted"] },
  badgeSuccess: { color: vars["--ads-color-success"] },
  badgeError: { color: vars["--ads-color-danger"] },
  badgeIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },

  header: {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: "0.875em",
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  headerOpen: {
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border"],
  },
  headerName: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  headerIcon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
  headerMeta: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  statusText: {
    fontSize: "0.75em",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  statusMuted: { color: vars["--ads-color-text-muted"] },
  statusSuccess: { color: vars["--ads-color-success"] },
  statusError: { color: vars["--ads-color-danger"] },
  chevron: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
  },
  chevronOpen: { transform: "rotate(180deg)" },

  content: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },

  ioBlock: {
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    padding: vars["--ads-space-8"],
  },
  ioInput: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 20%, transparent)`,
  },
  ioOutput: {
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 40%, transparent)`,
  },
  ioLabel: {
    marginBottom: vars["--ads-space-4"],
    fontSize: "0.75em",
    textTransform: "uppercase",
    color: vars["--ads-color-text-muted"],
  },
  banner: { marginBottom: vars["--ads-space-8"] },
  pre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    color: vars["--ads-color-text-muted"],
  },
  errorText: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    color: vars["--ads-color-danger"],
  },
  outputPre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    fontSize: "0.875em",
  },
  noOutput: { color: vars["--ads-color-text-muted"] },

  groupList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    padding: vars["--ads-space-8"],
  },
});
