import * as stylex from "@stylexjs/stylex";
import { ChevronDown } from "lucide-react";
import { useId } from "react";
import type * as React from "react";

import { controlChrome } from "../recipes/control-chrome";
import {
  controlHeightBySize,
  controlIconSizes,
  type ControlScale,
} from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Label } from "./Label";

/** Control height: xs 28px / sm 32px / md 36px (default) / lg 40px. */
export type NativeSelectSize = ControlScale;

export type NativeSelectOption = {
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
};

/**
 * A native `<optgroup>` of options. Pass these in `options` alongside (or
 * instead of) plain options when the list needs section headers — e.g. grouping
 * connection regions by Production / Staging / Test tier.
 *
 * `<optgroup>` is the only grouping primitive a native `<select>` supports, so
 * this stays inside the native control rather than promoting the field to a
 * combobox: no extra dependency, and OS-native keyboard/screen-reader behavior.
 */
export type NativeSelectOptionGroup = {
  disabled?: boolean;
  label: string;
  options: NativeSelectOption[];
};

export type NativeSelectItem = NativeSelectOption | NativeSelectOptionGroup;

function isOptionGroup(
  item: NativeSelectItem,
): item is NativeSelectOptionGroup {
  return Array.isArray((item as NativeSelectOptionGroup).options);
}

export type NativeSelectProps = Omit<
  React.ComponentProps<"select">,
  "children" | "className" | "size"
> & {
  children?: React.ReactNode;
  className?: string;
  /** Render only the select control, for composition inside an existing field label. */
  controlOnly?: boolean;
  controlStyle?: React.CSSProperties;
  description?: React.ReactNode;
  error?: React.ReactNode;
  hideIcon?: boolean;
  label?: React.ReactNode;
  options?: NativeSelectItem[];
  placeholder?: string;
  /** Control height: xs 28px / sm 32px / md 36px (default) / lg 40px. */
  size?: NativeSelectSize;
};

export function NativeSelect({
  children,
  className,
  controlOnly = false,
  controlStyle,
  description,
  disabled,
  error,
  hideIcon = false,
  id,
  label,
  options,
  placeholder,
  required,
  size = "md",
  ...props
}: NativeSelectProps) {
  const generatedId = useId();
  const selectId = id ?? props.name ?? generatedId;
  const descriptionId = description ? `${selectId}-description` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");

  const control = (
    <span
      className={cx(
        sx(styles.controlWrap),
        controlOnly ? className : undefined,
      )}
      style={controlStyle}
    >
      <select
        {...props}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={sx(
          styles.control,
          transition.colors,
          focusRing.borderOnly,
          controlHeightBySize[size],
          sizeStyles[size],
          Boolean(error) && styles.invalid,
          // One state per element (design-direction §2): the select owns the
          // border, so it owns the disabled treatment. `<select>` has no
          // read-only state — a non-editable select is a disabled one.
          disabled && controlChrome.disabledField,
        )}
        disabled={disabled}
        id={selectId}
        required={required}
      >
        {placeholder ? (
          <option disabled value="">
            {placeholder}
          </option>
        ) : null}
        {children ??
          options?.map((item) =>
            isOptionGroup(item) ? (
              <optgroup
                disabled={item.disabled}
                key={`group:${item.label}`}
                label={item.label}
              >
                {item.options.map((option) => (
                  <option
                    disabled={option.disabled}
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option
                disabled={item.disabled}
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ),
          )}
      </select>
      {hideIcon ? null : (
        <ChevronDown
          aria-hidden
          className={sx(styles.icon)}
          size={controlIconSizes.md}
        />
      )}
    </span>
  );

  if (controlOnly) return control;

  return (
    <div className={cx(sx(styles.field), className)}>
      {label ? (
        <Label disabled={disabled} htmlFor={selectId} required={required}>
          {label}
        </Label>
      ) : null}
      {control}
      {description ? (
        <div className={sx(styles.description)} id={descriptionId}>
          {description}
        </div>
      ) : null}
      {error ? (
        <div className={sx(styles.error)} id={errorId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  field: {
    alignContent: "start",
    display: "grid",
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  controlWrap: {
    display: "grid",
    minInlineSize: 0,
    position: "relative",
  },
  control: {
    appearance: "none",
    backgroundColor: vars.colorSurfaceRaised,
    // Focus contract: border on `:focus-within` (see the header of
    // `TextField.tsx` for the family-wide statement). A native `<select>`
    // does not match `:focus-visible` on a mouse click, so keying the border
    // to the ring's pseudo-class here would recolor on Tab but not on click.
    borderColor: {
      default: vars.colorBorder,
      ":hover": vars.colorBorderStrong,
      ":focus-within": vars.colorBorderFocus,
    },
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    cursor: "pointer",
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeBody,
    inlineSize: "100%",
    lineHeight: vars.lineHeightNormal,
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInlineEnd: vars.space32,
    paddingInlineStart: vars.space12,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Inline padding only — height lives in the control-metrics recipe.
  compact: {
    paddingInlineStart: vars.space8,
  },
  // `dense` carries `compact`'s gutter as well as the type step: the two used
  // to be composed together for `xs` (`size !== "md"` matched it too), and
  // folding them into one arm is what lets the whole ramp be one lookup now
  // that `lg` exists and no longer wants the compact gutter. Same two atomic
  // rules as before.
  dense: {
    fontSize: vars.fontSizeCaption,
    paddingInlineStart: vars.space8,
  },
  // The top of the ramp reads `space4` and `fontSizeMd`, the gutter and type
  // step a `lg` TextField and a `lg` Button take, so a `lg` form row is one
  // scale. The trailing gutter stays `space8` — the chevron did not grow.
  lg: {
    fontSize: vars.fontSizeLead,
    paddingInlineStart: vars.space16,
  },
  invalid: {
    borderColor: vars.colorDangerBorder,
  },
  icon: {
    color: vars.colorTextMuted,
    insetBlockStart: "50%",
    insetInlineEnd: vars.space12,
    pointerEvents: "none",
    position: "absolute",
    transform: "translateY(-50%)",
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
  },
  error: {
    // The border's red — one error, one colour. See `Field.tsx`.
    color: vars.colorDanger,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
  },
});

// Keyed by the canonical `ControlScale` vocabulary — `md` needs no override.
const sizeStyles = {
  lg: styles.lg,
  md: null,
  sm: styles.compact,
  xs: styles.dense,
} as const;

