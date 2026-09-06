import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const confirmationStyles = stylex.create({
  root: {
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 80%, transparent)`,
    padding: "0.625rem",
    fontSize: "0.8125rem",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space8,
  },
  staveIcon: {
    marginTop: vars.space2,
    width: vars.controlIconSizeMd,
    height: vars.controlIconSizeMd,
    flexShrink: 0,
  },
  headerBody: { minWidth: 0, flex: 1 },
  toolName: { fontWeight: vars.fontWeightMedium, color: vars.colorText },
  descriptionClamp: {
    marginTop: vars.space2,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  descriptionWrap: {
    marginTop: vars.space2,
    whiteSpace: "pre-wrap",
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  disabledReason: {
    marginTop: "0.375rem",
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  actionsRow: {
    marginTop: vars.space8,
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  actionComfortable: {
    minHeight: 36,
    paddingInline: vars.space12,
    fontSize: vars.fontSizeCaption,
  },
  actionCompact: {
    height: 28,
    paddingInline: "0.625rem",
    fontSize: vars.fontSizeCaption,
  },
  shortcutHint: {
    marginLeft: "auto",
    fontSize: vars.fontSizeMicro,
    color: `color-mix(in oklch, ${vars.colorTextMuted} 60%, transparent)`,
  },
  shortcutKbd: {
    marginRight: vars.space2,
    height: 16,
    paddingInline: vars.space4,
    fontSize: "0.625rem",
  },
  decisionText: {
    marginTop: "0.375rem",
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
});
