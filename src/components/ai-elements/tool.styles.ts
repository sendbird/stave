import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const toolStyles = stylex.create({
  root: {
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurface,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
  },
  badgeMuted: { color: vars.colorTextMuted },
  badgeSuccess: { color: vars.colorSuccess },
  badgeError: { color: vars.colorDanger },
  badgeIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
  },

  header: {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: "0.875em",
    fontWeight: vars.fontWeightSemibold,
  },
  headerOpen: {
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: vars.colorBorder,
  },
  headerName: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  headerIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
  },
  headerMeta: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space8,
  },
  statusText: {
    fontSize: "0.75em",
    fontWeight: vars.fontWeightMedium,
  },
  statusMuted: { color: vars.colorTextMuted },
  statusSuccess: { color: vars.colorSuccess },
  statusError: { color: vars.colorDanger },
  chevron: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
  },
  chevronOpen: { transform: "rotate(180deg)" },

  content: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },

  ioBlock: {
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    padding: vars.space8,
  },
  ioInput: {
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 20%, transparent)`,
  },
  ioOutput: {
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 40%, transparent)`,
  },
  ioLabel: {
    marginBottom: vars.space4,
    fontSize: "0.75em",
    textTransform: "uppercase",
    color: vars.colorTextMuted,
  },
  banner: { marginBottom: vars.space8 },
  pre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    color: vars.colorTextMuted,
  },
  errorText: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    color: vars.colorDanger,
  },
  outputPre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    fontSize: "0.875em",
  },
  noOutput: { color: vars.colorTextMuted },

  groupList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    padding: vars.space8,
  },
});
