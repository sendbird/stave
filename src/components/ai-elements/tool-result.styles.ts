import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const toolResultStyles = stylex.create({
  statusIcon: {
    width: "1.05em",
    height: "1.05em",
    flexShrink: 0,
  },
  statusIconMuted: { color: vars.colorTextMuted },
  statusIconSuccess: { color: vars.colorSuccess },
  statusIconError: { color: vars.colorDanger },
  statusIconCancelled: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
  },

  statusTextRunning: { color: vars.colorTextMuted },
  statusTextSuccess: { color: vars.colorSuccess },
  statusTextError: { color: vars.colorDanger },
  statusTextCancelled: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
  },

  action: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    borderRadius: vars.radiusControl,
    paddingInline: "0.5em",
    paddingBlock: "0.25em",
    fontSize: "0.75em",
    fontWeight: vars.fontWeightMedium,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars.colorCanvasSubtle} 60%, transparent)`,
    },
  },
  actionIcon: { width: "1.05em", height: "1.05em" },

  outputBlock: {
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 40%, transparent)`,
  },
  outputLabel: {
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    paddingInline: "0.6em",
    paddingBlock: "0.35em",
    fontSize: "0.7em",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: vars.colorTextMuted,
  },
  outputBanner: { margin: "0.5em" },
  outputScroll: {
    overflow: "auto",
    padding: "0.6em",
  },
  outputPre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: vars.fontMono,
    fontSize: "0.8em",
    lineHeight: "1.625",
    overflowWrap: "anywhere",
  },
  outputPreMuted: { color: vars.colorTextMuted },
  outputPreError: { color: vars.colorDanger },
  outputEmpty: {
    fontSize: "0.8em",
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
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
    fontWeight: vars.fontWeightMedium,
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
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurface,
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
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: vars.colorBorder,
  },
  kindIcon: { color: vars.colorTextMuted },
  headerTitle: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars.fontWeightMedium,
  },
  headerTool: {
    flexShrink: 0,
    fontFamily: vars.fontMono,
    fontSize: "0.8em",
    color: vars.colorTextMuted,
  },
  headerMeta: {
    flexShrink: 0,
    fontSize: "0.8em",
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
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
