import * as stylex from "@stylexjs/stylex";

import type { UsageStripBreakpoint } from "@/components/layout/status-bar-usage-strip.utils";
import { vars } from "../ads/tokens/tokens.stylex";
import type { StyleXValue } from "../ads/utils/stylex";

/** The usage strip in the status bar: rings, amounts, and the hints behind them. */
export const usageStripStyles = stylex.create({
  // The status bar's left group. It is the container the strip measures, and
  // it clips rather than grows, so the right-hand segments always keep their
  // place and the bar never wraps.
  container: {
    alignItems: "center",
    containerName: "usageStrip",
    containerType: "inline-size",
    display: "flex",
    flexBasis: 0,
    flexGrow: 1,
    gap: 2,
    minWidth: 0,
    overflow: "hidden",
  },
  name: {
    maxWidth: "14rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // One window or cost entry: the tooltip anchor around both forms.
  item: { alignItems: "center", display: "inline-flex", whiteSpace: "nowrap" },
  // The full form sits further from its neighbours than its own parts do, so
  // each ring reads as the start of its own entry.
  full: {
    alignItems: "center",
    gap: vars["--ads-space-4"],
    marginInlineStart: vars["--ads-space-4"],
  },
  percent: {
    color: vars["--ads-color-text"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  // Regular weight under the button's medium, so the figure is what reads first.
  context: {
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-regular"],
  },
  glyph: { display: "block", flexShrink: 0 },
  costGlyph: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: 16,
    width: 16,
  },
  ringTrack: { stroke: vars["--ads-color-overlay-pressed"] },
  ringOk: { stroke: vars["--ads-color-success"] },
  ringWarn: { stroke: vars["--ads-color-warning"] },
  ringDanger: { stroke: vars["--ads-color-danger"] },
  ringHand: { color: vars["--ads-color-text-muted"] },
  ringWedge: { fill: "currentColor", opacity: 0.45 },
  hint: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  hintLine: { fontWeight: vars["--ads-font-weight-regular"] },
});

// One rule per breakpoint step: a container query condition cannot read a
// variable, so the step the estimate picks selects a precompiled rule.
const visibility = stylex.create({
  full24: { display: { default: "none", "@container usageStrip (min-width: 24rem)": "inline-flex" } },
  compact24: { display: { default: "inline-flex", "@container usageStrip (min-width: 24rem)": "none" } },
  full28: { display: { default: "none", "@container usageStrip (min-width: 28rem)": "inline-flex" } },
  compact28: { display: { default: "inline-flex", "@container usageStrip (min-width: 28rem)": "none" } },
  full32: { display: { default: "none", "@container usageStrip (min-width: 32rem)": "inline-flex" } },
  compact32: { display: { default: "inline-flex", "@container usageStrip (min-width: 32rem)": "none" } },
  full36: { display: { default: "none", "@container usageStrip (min-width: 36rem)": "inline-flex" } },
  compact36: { display: { default: "inline-flex", "@container usageStrip (min-width: 36rem)": "none" } },
  full40: { display: { default: "none", "@container usageStrip (min-width: 40rem)": "inline-flex" } },
  compact40: { display: { default: "inline-flex", "@container usageStrip (min-width: 40rem)": "none" } },
  full44: { display: { default: "none", "@container usageStrip (min-width: 44rem)": "inline-flex" } },
  compact44: { display: { default: "inline-flex", "@container usageStrip (min-width: 44rem)": "none" } },
  full48: { display: { default: "none", "@container usageStrip (min-width: 48rem)": "inline-flex" } },
  compact48: { display: { default: "inline-flex", "@container usageStrip (min-width: 48rem)": "none" } },
  full52: { display: { default: "none", "@container usageStrip (min-width: 52rem)": "inline-flex" } },
  compact52: { display: { default: "inline-flex", "@container usageStrip (min-width: 52rem)": "none" } },
  full56: { display: { default: "none", "@container usageStrip (min-width: 56rem)": "inline-flex" } },
  compact56: { display: { default: "inline-flex", "@container usageStrip (min-width: 56rem)": "none" } },
  full60: { display: { default: "none", "@container usageStrip (min-width: 60rem)": "inline-flex" } },
  compact60: { display: { default: "inline-flex", "@container usageStrip (min-width: 60rem)": "none" } },
  full64: { display: { default: "none", "@container usageStrip (min-width: 64rem)": "inline-flex" } },
  compact64: { display: { default: "inline-flex", "@container usageStrip (min-width: 64rem)": "none" } },
  full68: { display: { default: "none", "@container usageStrip (min-width: 68rem)": "inline-flex" } },
  compact68: { display: { default: "inline-flex", "@container usageStrip (min-width: 68rem)": "none" } },
  full72: { display: { default: "none", "@container usageStrip (min-width: 72rem)": "inline-flex" } },
  compact72: { display: { default: "inline-flex", "@container usageStrip (min-width: 72rem)": "none" } },
  full76: { display: { default: "none", "@container usageStrip (min-width: 76rem)": "inline-flex" } },
  compact76: { display: { default: "inline-flex", "@container usageStrip (min-width: 76rem)": "none" } },
  full80: { display: { default: "none", "@container usageStrip (min-width: 80rem)": "inline-flex" } },
  compact80: { display: { default: "inline-flex", "@container usageStrip (min-width: 80rem)": "none" } },
  full84: { display: { default: "none", "@container usageStrip (min-width: 84rem)": "inline-flex" } },
  compact84: { display: { default: "inline-flex", "@container usageStrip (min-width: 84rem)": "none" } },
  full88: { display: { default: "none", "@container usageStrip (min-width: 88rem)": "inline-flex" } },
  compact88: { display: { default: "inline-flex", "@container usageStrip (min-width: 88rem)": "none" } },
  full92: { display: { default: "none", "@container usageStrip (min-width: 92rem)": "inline-flex" } },
  compact92: { display: { default: "inline-flex", "@container usageStrip (min-width: 92rem)": "none" } },
  full96: { display: { default: "none", "@container usageStrip (min-width: 96rem)": "inline-flex" } },
  compact96: { display: { default: "inline-flex", "@container usageStrip (min-width: 96rem)": "none" } },
  full100: { display: { default: "none", "@container usageStrip (min-width: 100rem)": "inline-flex" } },
  compact100: { display: { default: "inline-flex", "@container usageStrip (min-width: 100rem)": "none" } },
  full104: { display: { default: "none", "@container usageStrip (min-width: 104rem)": "inline-flex" } },
  compact104: { display: { default: "inline-flex", "@container usageStrip (min-width: 104rem)": "none" } },
  full108: { display: { default: "none", "@container usageStrip (min-width: 108rem)": "inline-flex" } },
  compact108: { display: { default: "inline-flex", "@container usageStrip (min-width: 108rem)": "none" } },
  full112: { display: { default: "none", "@container usageStrip (min-width: 112rem)": "inline-flex" } },
  compact112: { display: { default: "inline-flex", "@container usageStrip (min-width: 112rem)": "none" } },
  full116: { display: { default: "none", "@container usageStrip (min-width: 116rem)": "inline-flex" } },
  compact116: { display: { default: "inline-flex", "@container usageStrip (min-width: 116rem)": "none" } },
  full120: { display: { default: "none", "@container usageStrip (min-width: 120rem)": "inline-flex" } },
  compact120: { display: { default: "inline-flex", "@container usageStrip (min-width: 120rem)": "none" } },
  full136: { display: { default: "none", "@container usageStrip (min-width: 136rem)": "inline-flex" } },
  compact136: { display: { default: "inline-flex", "@container usageStrip (min-width: 136rem)": "none" } },
  full152: { display: { default: "none", "@container usageStrip (min-width: 152rem)": "inline-flex" } },
  compact152: { display: { default: "inline-flex", "@container usageStrip (min-width: 152rem)": "none" } },
  fullNever: { display: "none" },
  compactAlways: { display: "inline-flex" },
});

type Visibility = { full: StyleXValue; compact: StyleXValue };

const VISIBILITY_BY_BREAKPOINT: Record<UsageStripBreakpoint, Visibility> = {
  24: { full: visibility.full24, compact: visibility.compact24 },
  28: { full: visibility.full28, compact: visibility.compact28 },
  32: { full: visibility.full32, compact: visibility.compact32 },
  36: { full: visibility.full36, compact: visibility.compact36 },
  40: { full: visibility.full40, compact: visibility.compact40 },
  44: { full: visibility.full44, compact: visibility.compact44 },
  48: { full: visibility.full48, compact: visibility.compact48 },
  52: { full: visibility.full52, compact: visibility.compact52 },
  56: { full: visibility.full56, compact: visibility.compact56 },
  60: { full: visibility.full60, compact: visibility.compact60 },
  64: { full: visibility.full64, compact: visibility.compact64 },
  68: { full: visibility.full68, compact: visibility.compact68 },
  72: { full: visibility.full72, compact: visibility.compact72 },
  76: { full: visibility.full76, compact: visibility.compact76 },
  80: { full: visibility.full80, compact: visibility.compact80 },
  84: { full: visibility.full84, compact: visibility.compact84 },
  88: { full: visibility.full88, compact: visibility.compact88 },
  92: { full: visibility.full92, compact: visibility.compact92 },
  96: { full: visibility.full96, compact: visibility.compact96 },
  100: { full: visibility.full100, compact: visibility.compact100 },
  104: { full: visibility.full104, compact: visibility.compact104 },
  108: { full: visibility.full108, compact: visibility.compact108 },
  112: { full: visibility.full112, compact: visibility.compact112 },
  116: { full: visibility.full116, compact: visibility.compact116 },
  120: { full: visibility.full120, compact: visibility.compact120 },
  136: { full: visibility.full136, compact: visibility.compact136 },
  152: { full: visibility.full152, compact: visibility.compact152 },
  never: { full: visibility.fullNever, compact: visibility.compactAlways },
};

/** Which form shows at the current container width, for the chosen step. */
export function usageStripVisibility(breakpoint: UsageStripBreakpoint): Visibility {
  return VISIBILITY_BY_BREAKPOINT[breakpoint];
}
