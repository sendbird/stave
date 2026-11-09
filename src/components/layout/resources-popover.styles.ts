import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

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
    fontSize: vars["--aui-font-size-caption"],
  },
  usageBarLabel: {
    color: vars["--aui-color-text-muted"],
  },
  usageBarDetail: {
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text"],
  },
  usageBarTrack: {
    height: 8,
    width: "100%",
    overflow: "hidden",
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: vars["--aui-color-track"],
  },
  usageBarFill: {
    height: "100%",
    borderRadius: vars["--aui-radius-full"],
    // `transition.bar` + `motionDurationEmphasis` at the call site; the fill is
    // absolutely sized inside a fixed track, so the width transition is not a
    // layout animation, but it is spatial and now goes instant under reduce.
  },
  tooltipAnchor: {
    display: "inline-flex",
  },
  trigger: {
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
      ":active": vars["--aui-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
      ":active": vars["--aui-color-overlay-pressed"],
    },
  },
  triggerBar: {
    height: 24,
    // The small Button's 32px floor overhung the 24px status bar row.
    minHeight: 24,
    gap: 6,
    // Hoverable target: the overlay wash needs the control radius.
    borderRadius: vars["--aui-radius-control"],
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
  },
  triggerRail: {
    borderRadius: vars["--aui-radius-control"],
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
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface"],
    padding: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--aui-color-border"],
    paddingInline: 0,
    paddingBlockStart: 0,
    paddingBlockEnd: 8,
  },
  headerTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
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
    color: vars["--aui-color-text-muted"],
  },
  headerTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
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
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
      ":active": vars["--aui-color-text"],
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
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-24"],
    textAlign: "center",
  },
  emptyIcon: {
    width: 32,
    height: 32,
    color: vars["--aui-color-text-placeholder"],
  },
  emptyCopy: {
    marginBlock: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  stack: {
    display: "grid",
    gap: vars["--aui-space-16"],
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    columnGap: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
  },
  detailKey: {
    color: vars["--aui-color-text-muted"],
  },
  detailValue: {
    textAlign: "right",
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text-muted"],
  },
  detailValueStrong: {
    textAlign: "right",
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text"],
  },
  detailValuePlain: {
    textAlign: "right",
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
  },
  detailValueDanger: {
    color: vars["--aui-color-danger-text"],
  },
  detailValueWarning: {
    color: vars["--aui-color-warning-text"],
  },
  detailValueMuted: {
    color: vars["--aui-color-text-muted"],
  },
  truncated: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  group: {
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border-subtle"],
    paddingBlockStart: vars["--aui-space-12"],
  },
  groupHead: {
    marginBlockEnd: vars["--aui-space-8"],
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupTitle: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
  },
  groupMeta: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  groupTitleBlock: {
    marginBlockEnd: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
  },
  storageActions: {
    display: "flex",
    gap: vars["--aui-space-8"],
    marginBlockStart: vars["--aui-space-8"],
  },
  storageMessage: {
    marginBlockStart: vars["--aui-space-8"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  processHead: {
    marginBlockEnd: vars["--aui-space-8"],
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  processHeadIcon: {
    width: 12,
    height: 12,
    color: vars["--aui-color-text-muted"],
  },
  processList: {
    display: "grid",
    gap: vars["--aui-space-4"],
  },
  processRow: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 6,
    fontSize: vars["--aui-font-size-caption"],
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
  },
  processDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: vars["--aui-radius-full"],
  },
  processName: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--aui-color-text"],
  },
  processMemory: {
    fontFamily: vars["--aui-font-mono"],
    color: vars["--aui-color-text-muted"],
  },
  processCpu: {
    fontFamily: vars["--aui-font-mono"],
    color: vars["--aui-color-text-muted"],
  },
  externalRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: vars["--aui-font-size-caption"],
  },
  externalRowSpaced: {
    marginBlockStart: vars["--aui-space-4"],
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: vars["--aui-font-size-caption"],
  },
  externalKey: {
    color: vars["--aui-color-text-muted"],
  },
  externalValue: {
    fontFamily: vars["--aui-font-mono"],
    color: vars["--aui-color-text-muted"],
  },
});

/** Process-type pills; `other` covers Electron types with no assigned hue. */
export const processTypeStyles = stylex.create({
  Browser: { backgroundColor: vars["--aui-color-info"] },
  Tab: { backgroundColor: vars["--aui-color-success"] },
  GPU: { backgroundColor: vars["--aui-chart-4"] },
  Utility: { backgroundColor: vars["--aui-color-warning"] },
  other: { backgroundColor: vars["--aui-color-text-muted"] },
});
