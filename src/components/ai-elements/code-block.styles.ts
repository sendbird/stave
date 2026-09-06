import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const codeBlockStyles = stylex.create({
  root: {
    marginBlock: vars.space8,
    overflow: "hidden",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
  },
  content: {
    fontFamily: vars.fontMono,
  },
  fallbackPre: {
    overflowX: "auto",
    backgroundColor: "var(--editor)",
    paddingInline: vars.space16,
    paddingBlock: vars.space12,
    fontFamily: vars.fontMono,
    color: "var(--editor-foreground)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars.colorBorder} 70%, transparent)`,
    backgroundColor: "var(--editor-muted)",
    paddingInline: vars.space12,
    paddingBlock: 6,
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    fontSize: "0.875em",
    color: vars.colorTextMuted,
  },
  filename: {
    fontFamily: vars.fontMono,
    fontSize: "0.875em",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: vars.space4,
  },
  copyButton: {
    borderRadius: vars.radiusMark,
    padding: vars.space4,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  copiedIcon: {
    width: 12,
    height: 12,
    color: vars.colorAccent,
  },
  copyIcon: {
    width: 12,
    height: 12,
  },
});
