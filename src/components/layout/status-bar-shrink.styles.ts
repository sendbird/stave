import * as stylex from "@stylexjs/stylex";

import type { ResourceLabelBreakpoint } from "@/components/layout/status-bar-shrink";
import type { StyleXValue } from "../ads/utils/stylex";

/**
 * The bar is the container the right-hand segments measure: the label rule
 * reads the whole bar, not the usage strip, so it cannot be fooled by the
 * room it frees.
 */
export const STATUS_BAR_CONTAINER = "statusBar";

// One rule per step: a container query condition cannot read a variable, so
// the step the estimate picks selects a precompiled rule.
const label = stylex.create({
  at32: { display: { default: "none", "@container statusBar (min-width: 32rem)": "inline" } },
  at36: { display: { default: "none", "@container statusBar (min-width: 36rem)": "inline" } },
  at40: { display: { default: "none", "@container statusBar (min-width: 40rem)": "inline" } },
  at44: { display: { default: "none", "@container statusBar (min-width: 44rem)": "inline" } },
  at48: { display: { default: "none", "@container statusBar (min-width: 48rem)": "inline" } },
  at52: { display: { default: "none", "@container statusBar (min-width: 52rem)": "inline" } },
  at56: { display: { default: "none", "@container statusBar (min-width: 56rem)": "inline" } },
  at60: { display: { default: "none", "@container statusBar (min-width: 60rem)": "inline" } },
  at64: { display: { default: "none", "@container statusBar (min-width: 64rem)": "inline" } },
  at72: { display: { default: "none", "@container statusBar (min-width: 72rem)": "inline" } },
  at80: { display: { default: "none", "@container statusBar (min-width: 80rem)": "inline" } },
  at88: { display: { default: "none", "@container statusBar (min-width: 88rem)": "inline" } },
  at96: { display: { default: "none", "@container statusBar (min-width: 96rem)": "inline" } },
  at112: { display: { default: "none", "@container statusBar (min-width: 112rem)": "inline" } },
  at128: { display: { default: "none", "@container statusBar (min-width: 128rem)": "inline" } },
  always: { display: "inline" },
});

const LABEL_BY_BREAKPOINT: Record<ResourceLabelBreakpoint, StyleXValue> = {
  32: label.at32,
  36: label.at36,
  40: label.at40,
  44: label.at44,
  48: label.at48,
  52: label.at52,
  56: label.at56,
  60: label.at60,
  64: label.at64,
  72: label.at72,
  80: label.at80,
  88: label.at88,
  96: label.at96,
  112: label.at112,
  128: label.at128,
  always: label.always,
};

/** When the Resource Manager label shows, for the step the estimate chose. */
export function resourceLabelVisibility(breakpoint: ResourceLabelBreakpoint): StyleXValue {
  return LABEL_BY_BREAKPOINT[breakpoint];
}
