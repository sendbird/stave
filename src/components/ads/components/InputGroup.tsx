import * as React from "react";

import { ButtonRoot, type ButtonRootProps } from "../headless/button";
import { controlChrome } from "../recipes/control-chrome";
import {
  type ControlScale,
  controlHeightBySize,
} from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { surfaceChrome } from "../recipes/surface-chrome";
import { transition } from "../recipes/transition";
import { cx, sx } from "../utils/stylex";
import {
  actionSizeStyles,
  actionsInsetStyles,
  leadingActionsInsetStyles,
  sizeStyles,
  styles,
  toneStyles,
} from "./InputGroup.styles";
import { Label } from "./Label";

/** Control height: xs 28px / sm 32px / md 36px (default) / lg 40px. */
export type InputGroupSize = ControlScale;
export type InputGroupTone = "default" | "success" | "danger";

type InputGroupContextValue = {
  size: InputGroupSize;
  disabled: boolean;
};

const InputGroupContext = React.createContext<InputGroupContextValue | null>(
  null,
);

export type InputGroupActionProps = Omit<ButtonRootProps, "className"> & {
  className?: string;
};

/**
 * A quiet, size-aware action that lives inside an InputGroup.
 *
 * Use this for value-intrinsic operations such as apply, reveal, copy, and
 * clear. The containing group owns the border and control height; this action
 * deliberately sits INSIDE the group's content box with a uniform 3px block
 * and 4px inline clearance, so it does not render as a second full button
 * nested inside the field.
 *
 * Its heights are therefore `group content box - 6px` (38 → 32, 34 → 28,
 * 30 → 24, 26 → 20), and two of the four land off the 28/32/36/40 control
 * scale on purpose — see `styles.actionRegular` in `InputGroup.styles` for why
 * a scale-aligned height is the wrong contract here.
 */
export const InputGroupAction = React.forwardRef<
  React.ElementRef<typeof ButtonRoot>,
  InputGroupActionProps
>(function InputGroupAction(
  { className, disabled: disabledProp, ...props },
  forwardedRef,
) {
  const context = React.useContext(InputGroupContext);
  const size = context?.size ?? "md";
  const disabled = disabledProp || context?.disabled;

  return (
    <ButtonRoot
      {...props}
      className={cx(
        sx(
          surfaceChrome.quietIconButton,
          styles.action,
          focusRing.ring,
          focusRing.ringInset,
          actionSizeStyles[size],
          disabled && controlChrome.disabled,
        ),
        className,
      )}
      disabled={disabled}
      ref={forwardedRef}
    />
  );
});

export type InputGroupProps = Omit<
  React.ComponentProps<"input">,
  "className" | "prefix" | "size"
> & {
  /**
   * Inline actions that operate directly on this input value, such as reveal,
   * copy, clear, or apply. Primary create/save/submit actions belong after the
   * field or in the containing form footer.
   */
  actions?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
  /**
   * Icon-only slot before the value. The group owns the glyph box, so pass a
   * bare `<Search />` with no `size`.
   */
  leading?: React.ReactNode;
  /**
   * The leading counterpart of `actions`: an interactive addon wide enough
   * that the fixed `leading` glyph box cannot hold it — a scope `Select`, a
   * colour swatch, an HTTP-method picker. Sits outside the group's gutter on
   * the same 4px inset as `actions`.
   */
  leadingActions?: React.ReactNode;
  prefixText?: React.ReactNode;
  suffixText?: React.ReactNode;
  /** Control height: xs 28px / sm 32px / md 36px (default) / lg 40px. */
  size?: InputGroupSize;
  tone?: InputGroupTone;
  trailing?: React.ReactNode;
};

function InputGroupImpl(
  {
    actions,
    className,
    description,
    disabled,
    error,
    id,
    label,
    leading,
    leadingActions,
    prefixText,
    size = "md",
    suffixText,
    tone = "default",
    trailing,
    ...props
  }: InputGroupProps,
  forwardedRef: React.ForwardedRef<HTMLInputElement>,
) {
  const generatedId = React.useId();
  const inputId = id ?? props.name ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");
  const resolvedTone = error ? "danger" : tone;

  return (
    <div className={cx(sx(styles.field), className)}>
      {label ? (
        <Label disabled={disabled} htmlFor={inputId} required={props.required}>
          {label}
        </Label>
      ) : null}
      <InputGroupContext.Provider value={{ disabled: Boolean(disabled), size }}>
        <div
          className={sx(
            styles.group,
            transition.colors,
            focusRing.borderOnly,
            controlHeightBySize[size],
            sizeStyles[size],
            toneStyles[resolvedTone],
            // One state per element (design-direction §2): the bordered group
            // owns the border and the tint, so it owns the state. The inner
            // input inherits its color/cursor rather than re-stating them.
            props.readOnly && !disabled && controlChrome.readOnlyField,
            disabled && controlChrome.disabledField,
          )}
        >
          {leadingActions ? (
            <span
              className={sx(styles.actions, leadingActionsInsetStyles[size])}
            >
              {leadingActions}
            </span>
          ) : null}
          {leading ? (
            <span
              className={sx(styles.adornment)}
              data-ads-control-icon-slot="true"
            >
              {leading}
            </span>
          ) : null}
          {prefixText ? (
            <span className={sx(styles.affix)}>{prefixText}</span>
          ) : null}
          <input
            {...props}
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
            className={sx(styles.input)}
            disabled={disabled}
            id={inputId}
            ref={forwardedRef}
          />
          {suffixText ? (
            <span className={sx(styles.affix)}>{suffixText}</span>
          ) : null}
          {trailing ? (
            <span
              className={sx(styles.adornment)}
              data-ads-control-icon-slot="true"
            >
              {trailing}
            </span>
          ) : null}
          {actions ? (
            <span className={sx(styles.actions, actionsInsetStyles[size])}>
              {actions}
            </span>
          ) : null}
        </div>
      </InputGroupContext.Provider>
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

export const InputGroup = React.forwardRef<HTMLInputElement, InputGroupProps>(
  InputGroupImpl,
);
InputGroup.displayName = "InputGroup";
