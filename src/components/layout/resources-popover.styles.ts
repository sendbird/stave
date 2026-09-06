import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

export const resourceStyles = stylex.create({
  usageBar: {
    display: "grid",
    gap: 6,
  },
  usageBarHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: vars.fontSizeCaption,
  },
  usageBarLabel: {
    color: vars.colorTextMuted,
  },
  usageBarDetail: {
    fontFamily: vars.fontMono,
    color: vars.colorText,
  },
  usageBarTrack: {
    height: 8,
    width: "100%",
    overflow: "hidden",
    borderRadius: vars.radiusFull,
    backgroundColor: vars.colorSurfaceTint,
  },
  usageBarFill: {
    height: "100%",
    borderRadius: vars.radiusFull,
    transitionProperty: "width, background-color",
    transitionDuration: "300ms",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  tooltipAnchor: {
    display: "inline-flex",
  },
  trigger: {
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
      ":active": vars.colorText,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
  },
  triggerBar: {
    height: 24,
    gap: 6,
    borderRadius: 0,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeCaption,
  },
  triggerRail: {
    borderRadius: vars.radiusControl,
    padding: 0,
  },
  triggerRailCollapsed: {
    width: 40,
    height: 40,
  },
  triggerRailExpanded: {
    width: 36,
    height: 36,
  },
  triggerIcon: {
    width: 16,
    height: 16,
  },
  popover: {
    width: "20rem",
    gap: 0,
    overflow: "hidden",
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurface,
    padding: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: vars.colorBorder,
    paddingInline: vars.space12,
    paddingBlock: 10,
  },
  headerTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
  },
  headerIcon: {
    width: 14,
    height: 14,
    color: vars.colorTextMuted,
  },
  headerTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  refreshButton: {
    width: 28,
    height: 28,
    padding: 0,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
      ":active": vars.colorText,
    },
  },
  refreshIcon: {
    width: 14,
    height: 14,
  },
  refreshIconSpinning: {
    animationName: spin,
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
  },
  body: {
    maxHeight: "24rem",
    overflowY: "auto",
    padding: vars.space12,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: vars.space8,
    paddingBlock: vars.space24,
    textAlign: "center",
  },
  emptyIcon: {
    width: 32,
    height: 32,
    color: vars.colorTextPlaceholder,
  },
  emptyCopy: {
    marginBlock: 0,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextSubtle,
  },
  stack: {
    display: "grid",
    gap: vars.space16,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: vars.space8,
  },
  summaryTile: {
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorderSubtle,
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: 10,
    paddingBlock: vars.space8,
    textAlign: "center",
  },
  summaryTileIconRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.space4,
  },
  summaryTileIcon: {
    width: 12,
    height: 12,
    color: vars.colorTextMuted,
  },
  summaryTileValue: {
    marginBlockStart: vars.space4,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    color: vars.colorText,
  },
  summaryTileLabel: {
    fontSize: "0.625rem",
    color: vars.colorTextMuted,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    columnGap: vars.space12,
    rowGap: vars.space4,
    fontSize: vars.fontSizeCaption,
  },
  detailKey: {
    color: vars.colorTextSubtle,
  },
  detailValue: {
    textAlign: "right",
    fontFamily: vars.fontMono,
    color: vars.colorTextSubtle,
  },
  detailValueStrong: {
    textAlign: "right",
    fontFamily: vars.fontMono,
    color: vars.colorText,
  },
  detailValuePlain: {
    textAlign: "right",
    fontFamily: vars.fontMono,
  },
  detailValueDanger: {
    color: vars.colorDangerText,
  },
  detailValueWarning: {
    color: vars.colorWarningText,
  },
  detailValueMuted: {
    color: vars.colorTextSubtle,
  },
  truncated: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  group: {
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorderSubtle,
    paddingBlockStart: vars.space12,
  },
  groupHead: {
    marginBlockEnd: vars.space8,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupTitle: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorTextMuted,
  },
  groupMeta: {
    fontFamily: vars.fontMono,
    fontSize: "0.625rem",
    color: vars.colorTextSubtle,
  },
  groupTitleBlock: {
    marginBlockEnd: vars.space8,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorTextMuted,
  },
  processHead: {
    marginBlockEnd: vars.space8,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  processHeadIcon: {
    width: 12,
    height: 12,
    color: vars.colorTextMuted,
  },
  processList: {
    display: "grid",
    gap: vars.space4,
  },
  processRow: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    borderRadius: vars.radiusControl,
    paddingInline: vars.space8,
    paddingBlock: 6,
    fontSize: vars.fontSizeCaption,
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
  },
  processDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: vars.radiusFull,
  },
  processName: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars.colorText,
  },
  processMemory: {
    fontFamily: vars.fontMono,
    color: vars.colorTextMuted,
  },
  processCpu: {
    fontFamily: vars.fontMono,
    color: vars.colorTextSubtle,
  },
  externalRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: vars.fontSizeCaption,
  },
  externalRowSpaced: {
    marginBlockStart: vars.space4,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: vars.fontSizeCaption,
  },
  externalKey: {
    color: vars.colorTextSubtle,
  },
  externalValue: {
    fontFamily: vars.fontMono,
    color: vars.colorTextSubtle,
  },
});

/** Pressure ramp for the usage bars: healthy, watch, saturated. */
export const usageRampStyles = stylex.create({
  healthy: { backgroundColor: vars.colorSuccess },
  watch: { backgroundColor: vars.colorWarning },
  saturated: { backgroundColor: vars.colorDanger },
});

/** Process-type pills; `other` covers Electron types with no assigned hue. */
export const processTypeStyles = stylex.create({
  Browser: { backgroundColor: vars.colorInfo },
  Tab: { backgroundColor: vars.colorSuccess },
  GPU: { backgroundColor: vars.chart4 },
  Utility: { backgroundColor: vars.colorWarning },
  other: { backgroundColor: vars.colorTextMuted },
});
