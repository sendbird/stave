import type * as React from "react";
import { useState } from "react";

import { i18n, useTranslation } from "@/i18n";

import { controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { themeSlotProps } from "../theming/theme-props";
import { sx } from "../utils/stylex";
import { formatChartReadout } from "./Charts.format";
import type {
  ChartLegendPlacement,
  ChartLegendToggleProps,
} from "./Charts.props";
import { styles } from "./Charts.styles";

/*
 * The chart legend / value list and its placement resolver. Split out of
 * `Charts.tsx` (ATL-76); moved verbatim.
 */
export type LegendSlice = {
  /** Omitted for a single-series value list, where a swatch means nothing. */
  color?: string;
  label: string;
  /** Printed name when it differs from the identity `label` ("Errors (right)"). */
  display?: string;
  /** Extra swatch paint — a series texture (`ChartSeries.pattern`). */
  swatchStyle?: React.CSSProperties;
  /** Pre-formatted share (e.g. "38%"); omitted when share is meaningless. */
  share?: string | null;
  /**
   * How the swatch draws the entity: a dot (bars, slices), a short line (a line
   * or area series), or a dashed / dotted rule (a comparison, a reference
   * line). @default "dot"
   */
  mark?: "dashed" | "dot" | "dotted" | "line";
  /**
   * Omitted for a pure series legend (identity only): a cartesian series has a
   * value per category, so a single number beside its name would be a lie.
   */
  value?: number;
};

export function resolvePlacement(
  legend: ChartLegendPlacement | boolean,
): ChartLegendPlacement | null {
  if (legend === false) {
    return null;
  }
  return legend === true ? "auto" : legend;
}

/**
 * The legend-toggle capability every toggleable chart shares (ATL-56).
 *
 * Legend click is a visibility filter. `hiddenLabels` makes it controlled;
 * otherwise the chart owns the set, seeded by `defaultHiddenLabels`. Toggles
 * appear when the caller asks for them — `onToggleLabel`,
 * `onHiddenLabelsChange`, or a `defaultHiddenLabels` seed (`[]` is enough) —
 * so a chart that never opted in keeps a static legend. Callers keep a slice's
 * color by entity (its original position), so hiding one never repaints the
 * rest.
 */
export function useHiddenLabels({
  defaultHiddenLabels,
  hiddenLabels,
  onHiddenLabelsChange,
  onToggleLabel,
}: ChartLegendToggleProps): {
  hidden: string[];
  toggle?: (label: string) => void;
} {
  const [owned, setOwned] = useState<string[]>(defaultHiddenLabels ?? []);
  const controlled = hiddenLabels !== undefined;
  const hidden = controlled ? hiddenLabels : owned;
  const interactive =
    onToggleLabel != null ||
    onHiddenLabelsChange != null ||
    defaultHiddenLabels !== undefined;
  if (!interactive) return { hidden };
  return {
    hidden,
    toggle: (label) => {
      const next = hidden.includes(label)
        ? hidden.filter((entry) => entry !== label)
        : [...hidden, label];
      if (!controlled) setOwned(next);
      onToggleLabel?.(label);
      onHiddenLabelsChange?.(next);
    },
  };
}

/**
 * Legend / value list paired with a plot. Two forms, one markup: the side form
 * is a value-aligned column (label · value · share), the bottom form is a row
 * of wrapped compact chips that drops the share column. `auto` switches between
 * them on the card's own width via a container query.
 */
export function ChartLegend({
  formatValue = formatChartReadout,
  hiddenLabels = [],
  label = i18n.t("ui:chart.legend"),
  onToggleLabel,
  placement,
  slices,
}: {
  formatValue?: (value: number) => string;
  hiddenLabels?: string[];
  label?: string;
  onToggleLabel?: (label: string) => void;
  placement: ChartLegendPlacement;
  slices: LegendSlice[];
}) {
  useTranslation();
  const top = placement === "top";
  const compact = placement === "bottom" || top;
  const visibleCount = slices.filter(
    (slice) => !hiddenLabels.includes(slice.label),
  ).length;
  const auto = placement === "auto";
  return (
    <ul
      aria-label={label}
      // Safari drops list semantics when `list-style: none` is set; the role
      // puts them back, so the legend is still announced as a list of N.
      role="list"
      {...themeSlotProps("chart", "legend")}
      className={sx(
        styles.legend,
        compact && styles.legendCompact,
        auto && styles.legendAuto,
        top && styles.legendTop,
      )}
    >
      {slices.map((slice, index) => {
        const hidden = hiddenLabels.includes(slice.label);
        const share = hidden ? null : slice.share;
        const rowStyles = [
          styles.legendRow,
          compact && styles.legendRowCompact,
          auto && styles.legendRowAuto,
          hidden && styles.legendRowHidden,
        ] as const;
        const body = (
          <>
            {slice.color ? (
              <span
                aria-hidden
                className={sx(
                  styles.legendSwatch,
                  slice.mark === "line" && styles.legendMarkLine,
                  (slice.mark === "dashed" || slice.mark === "dotted") &&
                    styles.legendMarkRule,
                  slice.mark === "dotted" && styles.legendMarkDotted,
                )}
                style={
                  slice.mark === "dashed" || slice.mark === "dotted"
                    ? { borderColor: slice.color, ...slice.swatchStyle }
                    : { backgroundColor: slice.color, ...slice.swatchStyle }
                }
                {...themeSlotProps("chart", "swatch")}
              />
            ) : null}
            <span
              className={sx(
                styles.legendLabel,
                compact && styles.legendLabelCompact,
                auto && styles.legendLabelAuto,
                top && styles.legendLabelTop,
              )}
              {...themeSlotProps("chart", "legend-label")}
            >
              {slice.display ?? slice.label}
            </span>
            {slice.value === undefined ? null : (
              <span
                className={sx(styles.legendValue)}
                {...themeSlotProps("chart", "legend-value")}
              >
                {formatValue(slice.value)}
              </span>
            )}
            {slice.share === undefined ? null : (
              <span
                className={sx(
                  styles.legendShare,
                  compact && styles.legendShareCompact,
                  auto && styles.legendShareAuto,
                )}
                {...themeSlotProps("chart", "legend-share")}
              >
                {share}
              </span>
            )}
          </>
        );
        return (
          <li className={sx(styles.legendItem)} key={`${slice.label}-${index}`}>
            {onToggleLabel ? (
              <button
                // The last visible entry cannot be hidden: an empty plot is not
                // a filter result a reader asked for. It stays focusable and
                // announced, and says why it does nothing.
                aria-disabled={!hidden && visibleCount <= 1 ? true : undefined}
                aria-pressed={!hidden}
                className={sx(
                  ...rowStyles,
                  transition.colors,
                  styles.legendButton,
                  controlHeights.xs,
                  focusRing.ring,
                )}
                onClick={() => {
                  if (!hidden && visibleCount <= 1) return;
                  onToggleLabel(slice.label);
                }}
                type="button"
              >
                {body}
              </button>
            ) : (
              <span className={sx(...rowStyles)}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
