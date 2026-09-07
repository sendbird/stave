import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Per-provider model visibility switchboard in the Selector Models card. */
export const modelVisibilityStyles = stylex.create({
  emptyPanel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space12,
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  panelHead: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  panelSummary: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  resetButton: {
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    blockSize: vars.controlHeightSm,
    paddingInline: vars.space8,
  },
  resetIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  list: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    maxBlockSize: 320,
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  listItem: {
    alignItems: "center",
    borderTopColor: {
      default: vars.colorBorder,
      ":first-child": "transparent",
    },
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars.borderWidthHairline,
      ":first-child": 0,
    },
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    minBlockSize: vars.space48,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  rowMain: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  rowIcon: {
    flexShrink: 0,
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  rowLabelWrap: {
    minInlineSize: 0,
  },
  rowLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowKey: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowBadge: {
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
  },
  rowSwitch: {
    flexShrink: 0,
  },
  tabsList: {
    inlineSize: "100%",
  },
  tabsTrigger: {
    gap: vars.space8,
    minBlockSize: vars.controlHeight,
  },
  tabIcon: {
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  tabsContent: {
    paddingBlockStart: vars.space4,
  },
  titleResetButton: {
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    blockSize: vars.controlHeightSm,
    paddingInline: vars.space8,
  },
});
