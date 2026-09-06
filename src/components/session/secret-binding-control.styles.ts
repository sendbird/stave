import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const secretBindingControlStyles = stylex.create({
  content: {
    width: 320,
  },
  label: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  labelIcon: {
    height: 14,
    width: 14,
  },
  empty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
    paddingBlock: vars.space12,
    paddingInline: vars.space8,
  },
  item: {
    alignItems: "flex-start",
    gap: vars.space8,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: vars.fontSizeBody,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemEnvVar: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
    lineHeight: "1rem",
    paddingBlock: vars.space2,
    paddingInline: vars.space4,
  },
  itemPreview: {
    color: vars.colorTextMuted,
    display: "block",
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footnote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    lineHeight: "1rem",
    paddingBlock: vars.space8,
    paddingInline: vars.space8,
  },
});
