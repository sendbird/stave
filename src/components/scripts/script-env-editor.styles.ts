import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const envEditorStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  label: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  empty: {
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: vars.space4,
  },
  input: {
    height: 32,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  equals: {
    color: vars.colorTextMuted,
  },
  removeButton: {
    flexShrink: 0,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorDangerText,
    },
  },
  addButton: {
    height: 28,
    gap: vars.space4,
  },
  icon: {
    width: 14,
    height: 14,
  },
});
