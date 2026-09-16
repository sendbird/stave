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
    fontSize: vars["--ads-font-size-caption"],
  },
  usageBarLabel: {
    color: vars["--ads-color-text-muted"],
  },
  usageBarDetail: {
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text"],
  },
  usageBarTrack: {
    height: 8,
    width: "100%",
    overflow: "hidden",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-surface-tint"],
  },
  usageBarFill: {
    height: "100%",
    borderRadius: vars["--ads-radius-full"],
    // `transition.bar` + `motionDurationEmphasis` at the call site; the fill is
    // absolutely sized inside a fixed track, so the width transition is not a
    // layout animation, but it is spatial and now goes instant under reduce.
  },
  tooltipAnchor: {
    display: "inline-flex",
  },
  trigger: {
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
      ":active": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
  },
  triggerBar: {
    height: 24,
    gap: 6,
    // Hoverable target: the overlay wash needs the control radius.
    borderRadius: vars["--ads-radius-control"],
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
  },
  triggerRail: {
    borderRadius: vars["--ads-radius-control"],
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
  /**
   * Withholds the focus ring on a trigger that was restored focus after a
   * pointer-opened dialog closed. Composed after `focusRing.ring` inside the
   * Button, so it wins on every outline property it restates.
   */
  triggerRingSuppressed: {
    outlineColor: { default: "transparent", ":focus-visible": "transparent" },
    outlineStyle: { default: "none", ":focus-visible": "none" },
    outlineWidth: { default: 0, ":focus-visible": 0 },
  },
  triggerIcon: {
    width: 16,
    height: 16,
  },
  popover: {
    // Logical + viewport-clamped, so the popup cannot render wider than the
    // window it is anchored in (matching the notifications panel).
    inlineSize: "min(30rem, calc(100vw - 1rem))",
    maxInlineSize: "calc(100vw - 1rem)",
    gap: 0,
    overflow: "hidden",
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
    padding: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border"],
    paddingInline: 0,
    paddingBlockStart: 0,
    paddingBlockEnd: 8,
  },
  headerTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    // Same header contract as the notifications popup: the title column
    // shrinks (`min-inline-size: 0` defeats the flex item's `auto` minimum),
    // the trailing action does not.
    flexGrow: 1,
    flexShrink: 1,
    minInlineSize: 0,
  },
  headerIcon: {
    width: 14,
    height: 14,
    color: vars["--ads-color-text-muted"],
  },
  headerTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  refreshButton: {
    flexShrink: 0,
    width: 28,
    height: 28,
    padding: 0,
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
      ":active": vars["--ads-color-text"],
    },
  },
  refreshIcon: {
    width: 14,
    height: 14,
  },
  refreshIconSpinning: {
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
  },
  body: {
    maxHeight: "calc(85vh - 9rem)",
    minHeight: 0,
    overflowY: "auto",
    padding: 0,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-24"],
    textAlign: "center",
  },
  emptyIcon: {
    width: 32,
    height: 32,
    color: vars["--ads-color-text-placeholder"],
  },
  emptyCopy: {
    marginBlock: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-subtle"],
  },
  stack: {
    display: "grid",
    gap: vars["--ads-space-16"],
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: vars["--ads-space-8"],
  },
  summaryTile: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-subtle"],
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: 10,
    paddingBlock: vars["--ads-space-8"],
    textAlign: "center",
  },
  summaryTileIconRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars["--ads-space-4"],
  },
  summaryTileIcon: {
    width: 12,
    height: 12,
    color: vars["--ads-color-text-muted"],
  },
  summaryTileValue: {
    marginBlockStart: vars["--ads-space-4"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  summaryTileLabel: {
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    columnGap: vars["--ads-space-12"],
    rowGap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
  },
  detailKey: {
    color: vars["--ads-color-text-subtle"],
  },
  detailValue: {
    textAlign: "right",
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text-subtle"],
  },
  detailValueStrong: {
    textAlign: "right",
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text"],
  },
  detailValuePlain: {
    textAlign: "right",
    fontFamily: vars["--ads-font-mono"],
  },
  detailValueDanger: {
    color: vars["--ads-color-danger-text"],
  },
  detailValueWarning: {
    color: vars["--ads-color-warning-text"],
  },
  detailValueMuted: {
    color: vars["--ads-color-text-subtle"],
  },
  truncated: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  group: {
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    paddingBlockStart: vars["--ads-space-12"],
  },
  groupHead: {
    marginBlockEnd: vars["--ads-space-8"],
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupTitle: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  groupMeta: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-subtle"],
  },
  groupTitleBlock: {
    marginBlockEnd: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  storageActions: {
    display: "flex",
    gap: vars["--ads-space-8"],
    marginBlockStart: vars["--ads-space-8"],
  },
  storageMessage: {
    marginBlockStart: vars["--ads-space-8"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-subtle"],
  },
  processHead: {
    marginBlockEnd: vars["--ads-space-8"],
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  processHeadIcon: {
    width: 12,
    height: 12,
    color: vars["--ads-color-text-muted"],
  },
  processList: {
    display: "grid",
    gap: vars["--ads-space-4"],
  },
  processRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 6,
    fontSize: vars["--ads-font-size-caption"],
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  processDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: vars["--ads-radius-full"],
  },
  processName: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--ads-color-text"],
  },
  processMemory: {
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text-muted"],
  },
  processCpu: {
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text-subtle"],
  },
  externalRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: vars["--ads-font-size-caption"],
  },
  externalRowSpaced: {
    marginBlockStart: vars["--ads-space-4"],
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: vars["--ads-font-size-caption"],
  },
  externalKey: {
    color: vars["--ads-color-text-subtle"],
  },
  externalValue: {
    fontFamily: vars["--ads-font-mono"],
    color: vars["--ads-color-text-subtle"],
  },
});

/** Pressure ramp for the usage bars: healthy, watch, saturated. */
export const usageRampStyles = stylex.create({
  healthy: { backgroundColor: vars["--ads-color-success"] },
  watch: { backgroundColor: vars["--ads-color-warning"] },
  saturated: { backgroundColor: vars["--ads-color-danger"] },
});

/** Process-type pills; `other` covers Electron types with no assigned hue. */
export const processTypeStyles = stylex.create({
  Browser: { backgroundColor: vars["--ads-color-info"] },
  Tab: { backgroundColor: vars["--ads-color-success"] },
  GPU: { backgroundColor: vars["--ads-chart-4"] },
  Utility: { backgroundColor: vars["--ads-color-warning"] },
  other: { backgroundColor: vars["--ads-color-text-muted"] },
});
