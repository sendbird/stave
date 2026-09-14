import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/** Chrome for the status-bar usage segment and its detail popover. */
export const statusBarUsageStyles = stylex.create({
  /** Vertical rhythm groups; replaces the former `space-y-*` stacks. */
  stackTight: { display: "flex", flexDirection: "column", gap: 6 },
  stackSnug: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  stack: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },

  windowHead: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    minWidth: 0,
  },
  windowLabel: {
    color: vars["--ads-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  windowValue: {
    color: vars["--ads-color-text-subtle"],
    flexShrink: 0,
    fontFamily: vars["--ads-font-mono"],
  },
  meterTrack: {
    backgroundColor: vars["--ads-color-overlay-pressed"],
    borderRadius: vars["--ads-radius-full"],
    height: 6,
    overflow: "hidden",
  },
  meterFill: { borderRadius: vars["--ads-radius-full"], height: "100%" },

  toneOk: { backgroundColor: vars["--ads-color-success"] },
  toneWarn: { backgroundColor: vars["--ads-color-warning"] },
  toneDanger: { backgroundColor: vars["--ads-color-danger"] },
  toneUnknown: { backgroundColor: vars["--ads-color-text-subtle"] },

  note: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  noteFaint: { color: vars["--ads-color-text-subtle"], fontSize: vars["--ads-font-size-micro"] },
  bucketTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  bucketPlan: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-regular"],
    marginInlineStart: vars["--ads-space-4"],
  },
  amountRow: {
    alignItems: "center",
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    justifyContent: "space-between",
  },
  amountLabel: { color: vars["--ads-color-text-muted"] },
  amountValue: { color: vars["--ads-color-text-subtle"], fontFamily: vars["--ads-font-mono"] },

  trigger: {
    // Radius from the token, not `0`: this is a hoverable control, and a square
    // hover wash in a rounded chrome strip reads as a rendering artefact.
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    // `transparent`, never `null` — `null` unsets `background-color` and the
    // UA's `buttonface` shows through as an opaque grey slab (see
    // `right-rail.styles.ts`).
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    fontSize: vars["--ads-font-size-caption"],
    gap: 6,
    height: 24,
    paddingInline: vars["--ads-space-8"],
  },
  triggerDot: {
    borderRadius: vars["--ads-radius-full"],
    display: "inline-block",
    height: 6,
    width: 6,
  },
  triggerMono: { fontFamily: vars["--ads-font-mono"] },

  popover: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    gap: 0,
    overflow: "hidden",
    padding: 0,
    width: 288,
  },
  popoverHeader: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
  },
  popoverTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  refreshButton: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    height: 28,
    padding: 0,
    width: 28,
  },
  refreshIcon: { height: vars["--ads-control-icon-size-sm"], width: vars["--ads-control-icon-size-sm"] },
  refreshIconSpinning: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "linear",
  },
  popoverBody: { padding: vars["--ads-space-12"] },
});
