import * as stylex from "@stylexjs/stylex";

import { vars } from "../../ads/tokens/tokens.stylex";

export const latestRunStyles = stylex.create({
  root: {
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  emptyCopy: {
    color: vars.colorTextMuted,
    fontSize: 11,
    marginBlock: 0,
    marginBlockStart: 6,
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  meta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    columnGap: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    fontSize: 11,
    marginBlockStart: vars.space8,
    rowGap: vars.space4,
  },
  summary: {
    display: "-webkit-box",
    fontSize: 11,
    lineHeight: vars.lineHeightControl,
    marginBlockEnd: 0,
    marginBlockStart: vars.space8,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  summaryError: { color: vars.colorDangerText },
  summaryDefault: { color: vars.colorText },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBlockStart: vars.space12,
  },
  actionButton: {
    blockSize: 32,
    fontSize: vars.fontSizeCaption,
    gap: 6,
  },
  actionButtonQuiet: {
    blockSize: 32,
    fontSize: vars.fontSizeCaption,
    paddingInline: 10,
  },
  actionIcon: { blockSize: 14, inlineSize: 14 },
});
