import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import {
  RadioGroupRoot,
  RadioIndicator,
  RadioRoot,
  type RadioGroupRootProps,
} from "../headless/radio-group";
import { controlChrome } from "../recipes/control-chrome";
import { controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { touchTarget } from "../recipes/touch-target";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import {
  FieldGroupLabelRow,
  FieldMessages,
  fieldAnatomy,
  useFieldAnatomy,
} from "./field-anatomy";

export type RadioGroupOption = {
  description?: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
};

export type RadioGroupProps = Omit<
  RadioGroupRootProps,
  "children" | "className"
> & {
  className?: string;
  description?: React.ReactNode;
  /**
   * Validation message for the group ("choose a plan"). Sets `aria-invalid` on
   * the group, renders a `role="alert"` row wired into `aria-describedby`, and
   * moves every option row's resting outline to the danger ramp — the single
   * invalid channel from `field-anatomy.tsx`.
   */
  error?: React.ReactNode;
  label?: React.ReactNode;
  options: RadioGroupOption[];
};

export function RadioGroup({
  className,
  description,
  error,
  label,
  options,
  ...props
}: RadioGroupProps) {
  // The two hand-rolled `useId()`s this used to keep are now the anatomy's:
  // one generator, one naming scheme, and the error id the group never had.
  const anatomy = useFieldAnatomy({ description, error, id: props.id });

  return (
    <div className={cx(sx(fieldAnatomy.field), className)}>
      {label ? (
        <FieldGroupLabelRow
          disabled={props.disabled}
          id={anatomy.labelId}
          required={props.required}
        >
          {label}
        </FieldGroupLabelRow>
      ) : null}
      <RadioGroupRoot
        {...props}
        aria-describedby={anatomy.describedBy}
        aria-invalid={anatomy.invalid}
        aria-labelledby={label ? anatomy.labelId : undefined}
        className={sx(styles.group)}
      >
        {options.map((option) => (
          /*
           * `controlChrome.disabled` lands on the row and ONLY the row. It used
           * to be applied here *and* on the radio, so a disabled option
           * rendered at 0.5 × 0.5 = 0.25 effective opacity — well past
           * legibility. The row is the right single owner because it contains
           * the radio, the label, and the description; a group-level `disabled`
           * has to dim all three, so it is folded in here too.
           */
          <label
            className={sx(
              styles.option,
              transition.control,
              controlHeights.md,
              anatomy.invalid && styles.optionInvalid,
              (option.disabled || props.disabled) && controlChrome.disabled,
            )}
            key={option.value}
          >
            <RadioRoot
              className={(state) =>
                sx(
                  styles.radio,
                  transition.colors,
                  touchTarget.coarse,
                  focusRing.ring,
                  state.checked && styles.radioChecked,
                )
              }
              disabled={option.disabled}
              value={option.value}
            >
              {/*
               * The dot pops in where it was chosen; it does NOT travel from
               * the previous option. It used to: a shared `layoutId` glided it
               * across the list, which reads as one indicator moving through
               * space when the truth is two independent options changing state
               * — and the further apart the options, the longer the eye is
               * pulled away from the one just picked. A gliding indicator is
               * right for `Tabs` and `ToggleGroup`, where a single marker rides
               * a single track; a radio list is not a track.
               *
               * Pop-in is a CSS keyframe, not Motion, for the reason Checkbox
               * records: `initial` is applied during render but `animate` only
               * runs once a feature bundle loads, so a consumer without
               * `AtelierMotionProvider` can be left looking at the initial
               * state. The resting state here IS the visible dot; the
               * animation only replays its arrival (motion ADR §5).
               */}
              <RadioIndicator className={sx(styles.indicator)} />
            </RadioRoot>
            <span className={sx(styles.optionCopy)}>
              <span className={sx(styles.optionLabel)}>{option.label}</span>
              {option.description ? (
                <span className={sx(styles.optionDescription)}>
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </RadioGroupRoot>
      {/*
       * Description and error sit BELOW the options now. The field anatomy
       * paints one message stack in one order after the control, so a radio
       * group and a TextField in the same form put their helper copy in the
       * same place; the description used to render above the options.
       */}
      <FieldMessages
        anatomy={anatomy}
        description={description}
        error={error}
      />
    </div>
  );
}

// The wrapper grid, the group label, and the description/error typography all
// come from `field-anatomy.tsx` now — this file used to carry its own copy of
// all three, which is exactly how a label type step drifts between two controls
// that are meant to read as one system.
/** Dot pop-in. The element's own (unanimated) state is fully visible. */
const dotPop = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0.4)" },
  to: { opacity: 1, transform: "scale(1)" },
});

const styles = stylex.create({
  group: {
    display: "grid",
    gap: vars.space8,
  },
  option: {
    alignItems: "start",
    backgroundColor: {
      default: vars.colorSurfaceRaised,
      // The 6% wash, not an opaque Neutral100 — the same fill every other
      // pointer state in the system takes. See design-direction.md §1.5.
      ":hover": vars.colorOverlayHover,
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    cursor: "pointer",
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: "20px minmax(0, 1fr)",
    // Height comes from the shared control-metrics recipe (`controlHeights.md`,
    // composed at the call site) — same metric as Checkbox, with the recipe's
    // `(pointer: coarse)` 44px touch-target bump.
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  /*
   * Invalid: the resting outline of every row moves to the danger ramp, so the
   * group reads as unanswered at a glance rather than only in the sentence
   * under it. Only the resting color moves — the row's pointer feedback lives
   * on `background-color`, so the error survives hover without a second
   * declaration here.
   */
  optionInvalid: {
    borderColor: vars.colorDangerBorder,
  },
  radio: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorderStrong,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: 20,
    justifyContent: "center",
    // No optical nudge. §5 bans `marginBlockStart: 1` here: the 1px offset was
    // compensating for `optionLabel`'s 14px × 1.35 = 18.9px line box against
    // this 20px control. The label now uses the whole-pixel `lineHeightControl`
    // box (20px), so the grid's `align-items: start` lands both centers on the
    // same line with no nudge at all.
    minBlockSize: 20,
  },
  radioChecked: {
    borderColor: vars.colorAccent,
  },
  indicator: {
    animationDuration: {
      default: vars.motionDurationFast,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    animationName: dotPop,
    animationTimingFunction: vars.motionEaseExpressive,
    backgroundColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
    display: "block",
    inlineSize: 10,
    minBlockSize: 10,
  },
  optionCopy: {
    display: "grid",
    gap: vars.space4,
    minInlineSize: 0,
  },
  optionLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    // §5 weight roles: an option label stops at medium; the dot, the accent
    // border, and the row surface already carry selection.
    fontWeight: vars.fontWeightMedium,
    // Whole-pixel control line box (20px) so the label's first line and the
    // 20px radio share one center — see `radio` above. `lineHeightTight`
    // resolved to 18.9px and forced a 1px optical nudge on the control.
    lineHeight: vars.lineHeightControl,
  },
  optionDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
  },
});

