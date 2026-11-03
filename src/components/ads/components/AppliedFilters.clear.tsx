import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { type ControlScale, controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { themeTargetClassName } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

/**
 * The one "Clear all" a filter row draws. `AppliedFilters` draws it after its
 * chips; `FilterBar` owns its own so that a toolbar of plain selects — which
 * has no chips — can offer one too. Both must be the same quiet
 * text action, so the look lives here once. Internal: not exported from the
 * package index.
 */
export function FilterClearAll({
  children,
  onClick,
  size,
}: {
  children: React.ReactNode;
  onClick: () => void;
  size: ControlScale;
}) {
  return (
    <button
      className={cx(
        sx(styles.clearAll, focusRing.ring, controlHeights[size]),
        themeTargetClassName("applied-filters-clear"),
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

const styles = stylex.create({
  clearAll: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
        ":active": vars["--ads-color-overlay-pressed"],
      },
    },
    borderRadius: vars["--ads-radius-control"],
    borderWidth: 0,
    color: {
      default: vars["--ads-color-text-muted"],
      "@media (hover: hover)": {
        default: vars["--ads-color-text-muted"],
        ":hover": vars["--ads-color-text"],
      },
    },
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
    whiteSpace: "nowrap",
  },
});
