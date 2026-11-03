import * as stylex from "@stylexjs/stylex";
import { m } from "motion/react";
import { useId, useRef } from "react";
import type * as React from "react";

import { toggleGroupStyles as track } from "@/components/ads/components/ToggleGroup";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { RadioGroupRoot, RadioRoot } from "@/components/ads/headless/radio-group";
import { controlChrome } from "@/components/ads/recipes/control-chrome";
import { controlHeights } from "@/components/ads/recipes/control-metrics";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { springSmooth, vars } from "@/components/ads/tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "@/components/ads/utils/stylex";
import { CountBadge } from "./CountBadge";

export type SegmentedControlOption<Value> = {
  value: Value;
  /** A string when `iconOnly`, because it becomes the segment's name and tooltip. */
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** A neutral count beside the label, read as part of the segment's name. */
  count?: number;
  disabled?: boolean;
  /** A hover hint for the segment; the label stays its accessible name. */
  title?: string;
  testId?: string;
};

export type SegmentedControlProps<Value> = {
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly SegmentedControlOption<Value>[];
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** `compact` (32px track) for chrome rows; `regular` (36px) beside 36px controls. Items are 28px in both. */
  density?: "compact" | "regular";
  disabled?: boolean;
  /** Stretch across the container; segments share the width equally. */
  fullWidth?: boolean;
  /** Icon squares with the label as tooltip and name (labels must be strings). */
  iconOnly?: boolean;
  /**
   * Keep focus where it is when a segment is pressed with a pointer, for a
   * scope switch under a search field the reader is still typing in.
   */
  keepFocusOnPointer?: boolean;
  testId?: string;
} & XstyleProp;

/**
 * Pick exactly one of two to six short options: a view, a scope, a filter.
 *
 * Drawn with the ADS ToggleGroup's track, gliding chip and 28px item, with
 * single-choice semantics: a `radiogroup` with one Tab stop, arrow keys that
 * move and select (wrapping at the ends, skipping disabled options), Home and
 * End, and no way to clear the choice. Values keep the caller's type,
 * including `undefined` for a "default" option, because the radios are keyed
 * by index.
 */
export function SegmentedControl<Value>({
  density = "compact",
  disabled = false,
  fullWidth = false,
  iconOnly = false,
  keepFocusOnPointer = false,
  onValueChange,
  options,
  testId,
  value,
  xstyle,
  ...aria
}: SegmentedControlProps<Value>) {
  const indicatorId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => Object.is(option.value, value));

  const select = (index: number) => {
    const option = options[index];
    if (!option || option.disabled || index === selectedIndex) return;
    onValueChange(option.value);
  };

  // Base UI's radio group roves with the arrow keys but leaves Home and End
  // off, which a segmented choice of more than two needs.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Home" && event.key !== "End") return;
    const enabled = options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled);
    const target = event.key === "Home" ? enabled[0] : enabled[enabled.length - 1];
    if (!target || disabled) return;
    event.preventDefault();
    select(target.index);
    rootRef.current
      ?.querySelectorAll<HTMLElement>('[role="radio"]')
      [target.index]?.focus();
  };

  return (
    <RadioGroupRoot
      {...aria}
      ref={rootRef}
      data-testid={testId}
      disabled={disabled}
      value={selectedIndex < 0 ? null : selectedIndex}
      onValueChange={(index: unknown) => {
        if (typeof index === "number") select(index);
      }}
      onKeyDown={onKeyDown}
      onMouseDown={keepFocusOnPointer ? (event) => event.preventDefault() : undefined}
      className={sx(
        track.group,
        density === "compact" ? track.groupCompact : track.groupRegular,
        track.groupHorizontal,
        styles.group,
        fullWidth && styles.groupFull,
        iconOnly && track.groupIconOnly,
        xstyle,
      )}
    >
      {options.map((option, index) => {
        const checked = index === selectedIndex;
        const name = typeof option.label === "string" ? option.label : undefined;
        const radio = (
          <RadioRoot
            key={String(index)}
            value={index}
            disabled={option.disabled}
            title={iconOnly ? undefined : option.title}
            aria-label={iconOnly ? name : undefined}
            data-testid={option.testId}
            className={(state) =>
              cx(
                sx(
                  track.item,
                  transition.colors,
                  controlHeights.xs,
                  density === "compact" ? track.itemCompact : track.itemRegular,
                  focusRing.ring,
                  fullWidth && styles.itemFull,
                  iconOnly && track.itemIconOnly,
                  state.checked && track.itemPressed,
                  state.disabled && track.itemDisabled,
                  state.disabled && controlChrome.disabled,
                ),
              ) ?? ""
            }
          >
            {checked ? (
              <m.span
                aria-hidden
                className={sx(track.indicator)}
                layout
                layoutId={indicatorId}
                transition={springSmooth}
              />
            ) : null}
            {option.icon ? (
              <span
                className={sx(track.icon, density === "compact" ? track.iconCompact : track.iconRegular)}
                data-ads-control-icon-slot
              >
                {option.icon}
              </span>
            ) : null}
            {iconOnly && option.icon ? null : (
              <span className={sx(track.itemLabel, styles.label)}>
                <span className={sx(styles.labelText)}>{option.label}</span>
                {option.count === undefined ? null : <CountBadge count={option.count} tone="neutral" />}
              </span>
            )}
          </RadioRoot>
        );
        return iconOnly && name ? (
          <Tooltip content={option.title ?? name} key={String(index)}>
            {radio}
          </Tooltip>
        ) : (
          radio
        );
      })}
    </RadioGroupRoot>
  );
}

const styles = stylex.create({
  // Never wider than its container; a long Korean row wraps onto a second
  // track line instead of overflowing the toolbar it sits in.
  group: { maxInlineSize: "100%", minInlineSize: 0 },
  groupFull: { display: "flex", inlineSize: "100%" },
  itemFull: { flexBasis: 0, flexGrow: 1, minInlineSize: 0 },
  label: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  labelText: { minInlineSize: 0, overflow: "hidden", textOverflow: "ellipsis" },
});
