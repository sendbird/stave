import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const entryCardStyles = stylex.create({
  root: {
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurface,
  },
  rootAttention: {
    borderColor: vars.colorDangerBorder,
  },
  header: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 80rem)": "row",
    },
    gap: vars.space12,
    padding: vars.space12,
    alignItems: {
      default: null,
      "@media (min-width: 80rem)": "flex-start",
    },
    justifyContent: {
      default: null,
      "@media (min-width: 80rem)": "space-between",
    },
  },
  summaryButton: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    alignItems: "flex-start",
    gap: vars.space8,
    textAlign: "left",
    background: "none",
    borderStyle: "none",
    padding: 0,
    cursor: "pointer",
    color: "inherit",
    font: "inherit",
  },
  chevron: {
    marginTop: 2,
    display: "flex",
    width: 16,
    height: 16,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    color: vars.colorTextMuted,
  },
  chevronIcon: {
    width: 16,
    height: 16,
  },
  summaryBody: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: vars.space4,
  },
  titleRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space8,
  },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  runningBadge: {
    borderRadius: vars.radiusMark,
    paddingInline: vars.space8,
    paddingBlock: 0,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorAccent,
  },
  attention: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space4,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorDangerText,
  },
  attentionIcon: {
    width: 12,
    height: 12,
  },
  metaText: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  triggerRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space4,
    paddingTop: 2,
  },
  triggerLabel: {
    fontSize: vars.fontSizeMicro,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: vars.colorTextMuted,
  },
  triggerBadge: {
    borderRadius: vars.radiusFull,
    paddingInline: vars.space8,
    paddingBlock: 0,
    fontSize: vars.fontSizeMicro,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space4,
  },
  iconButton: {
    width: 32,
    height: 32,
  },
  actionButtonTall: {
    height: 32,
  },
  icon: {
    width: 14,
    height: 14,
  },
  iconFlipped: {
    width: 14,
    height: 14,
    transform: "rotate(180deg)",
  },
  destructiveButton: {
    width: 32,
    height: 32,
    color: {
      default: vars.colorDangerText,
      ":hover": vars.colorDangerText,
    },
  },
  body: {
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    padding: vars.space12,
  },
});
