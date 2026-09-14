import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const toolResultStyles = stylex.create({
  statusIcon: {
    width: "1.05em",
    height: "1.05em",
    flexShrink: 0,
  },
  statusIconMuted: { color: vars["--ads-color-text-muted"] },
  statusIconSuccess: { color: vars["--ads-color-success"] },
  statusIconError: { color: vars["--ads-color-danger"] },
  statusIconCancelled: {
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 70%, transparent)`,
  },

  statusTextRunning: { color: vars["--ads-color-text-muted"] },
  statusTextSuccess: { color: vars["--ads-color-success"] },
  statusTextError: { color: vars["--ads-color-danger"] },
  statusTextCancelled: {
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 70%, transparent)`,
  },

  action: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    borderRadius: vars["--ads-radius-control"],
    paddingInline: "0.5em",
    paddingBlock: "0.25em",
    fontSize: "0.75em",
    fontWeight: vars["--ads-font-weight-medium"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas-subtle"]} 60%, transparent)`,
    },
  },
  actionIcon: { width: "1.05em", height: "1.05em" },

  outputBlock: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 40%, transparent)`,
  },
  outputLabel: {
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: "0.6em",
    paddingBlock: "0.35em",
    fontSize: "0.7em",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: vars["--ads-color-text-muted"],
  },
  outputBanner: { margin: "0.5em" },
  outputScroll: {
    overflow: "auto",
    padding: "0.6em",
  },
  outputPre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: vars["--ads-font-mono"],
    fontSize: "0.8em",
    lineHeight: "1.625",
    overflowWrap: "anywhere",
  },
  outputPreMuted: { color: vars["--ads-color-text-muted"] },
  outputPreError: { color: vars["--ads-color-danger"] },
  outputEmpty: {
    fontSize: "0.8em",
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 70%, transparent)`,
  },

  footer: {
    display: "flex",
    alignItems: "center",
    gap: "0.4em",
    paddingTop: "0.5em",
  },
  footerStatus: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35em",
    fontSize: "0.75em",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  footerActions: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.2em",
  },

  body: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",
  },
  bodyPadded: {
    paddingInline: "0.75em",
    paddingBottom: "0.6em",
  },
  headlessRoot: {},

  rootSection: {
    overflow: "hidden",
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
  },
  header: {
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: "0.5em",
    paddingInline: "0.75em",
    paddingBlock: "0.5em",
    fontSize: "0.875em",
    textAlign: "left",
  },
  headerOpen: {
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border"],
  },
  kindIcon: { color: vars["--ads-color-text-muted"] },
  headerTitle: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  headerTool: {
    flexShrink: 0,
    fontFamily: vars["--ads-font-mono"],
    fontSize: "0.8em",
    color: vars["--ads-color-text-muted"],
  },
  headerMeta: {
    flexShrink: 0,
    fontSize: "0.8em",
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 70%, transparent)`,
  },
  headerTrailing: {
    marginLeft: "auto",
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: "0.4em",
  },
  chevron: { width: "1.05em", height: "1.05em" },
  chevronOpen: { transform: "rotate(180deg)" },
  headerBody: { paddingTop: "0.6em" },
});
