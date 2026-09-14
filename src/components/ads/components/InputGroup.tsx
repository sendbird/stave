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
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
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
} & XstyleProp;

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
 *
 * §9 — the control owns the glyph box. `data-ads-control-icon-button` reads
 * the `--ads-control-icon-size` the group already sets per size step, so an
 * icon passed in here comes out the same size as the group's `leading` mark.
 * `SearchField`'s clear button has carried this since it was written; this
 * action did not, so every call site hand-passed a literal (`size={14}` in the
 * docs previews, at every size step) and a copy mark inside an `md` group
 * rendered 14px beside a 16px search mark.
 */
export const InputGroupAction = React.forwardRef<
  React.ElementRef<typeof ButtonRoot>,
  InputGroupActionProps
>(function InputGroupAction(
  { className, disabled: disabledProp, xstyle, ...props },
  forwardedRef,
) {
  const context = React.useContext(InputGroupContext);
  const size = context?.size ?? "md";
  const disabled = disabledProp || context?.disabled;
  const theme = themeProps("input-group-action");

  return (
    <ButtonRoot
      {...props}
      {...theme}
      className={cx(
        sx(
          surfaceChrome.quietIconButton,
          styles.action,
          focusRing.ring,
          focusRing.ringInset,
          actionSizeStyles[size],
          disabled && controlChrome.disabled,
          xstyle,
        ),
        theme.className,
        className,
      )}
      data-ads-control-icon-button="true"
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
} & XstyleProp;

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
    xstyle,
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
  // The bordered group is the target: it owns the border, the tint, and the
  // state. `tone` is the RESOLVED validity, so an `error` shows up as `danger`.
  const theme = themeProps("input-group", { size, tone: resolvedTone });

  return (
    <div className={cx(sx(styles.field, xstyle), className)}>
      {label ? (
        <Label disabled={disabled} htmlFor={inputId} required={props.required}>
          {label}
        </Label>
      ) : null}
      <InputGroupContext.Provider value={{ disabled: Boolean(disabled), size }}>
        <div
          {...theme}
          className={cx(
            sx(
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
            ),
            theme.className,
          )}
        >
          {leadingActions ? (
            <span
              {...themeSlotProps("input-group", "actions")}
              className={sx(styles.actions, leadingActionsInsetStyles[size])}
            >
              {leadingActions}
            </span>
          ) : null}
          {leading ? (
            <span
              {...themeSlotProps("input-group", "adornment")}
              className={sx(styles.adornment)}
              data-ads-control-icon-slot="true"
            >
              {leading}
            </span>
          ) : null}
          {prefixText ? (
            <span
              {...themeSlotProps("input-group", "affix")}
              className={sx(styles.affix)}
            >
              {prefixText}
            </span>
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
            <span
              {...themeSlotProps("input-group", "affix")}
              className={sx(styles.affix)}
            >
              {suffixText}
            </span>
          ) : null}
          {trailing ? (
            <span
              {...themeSlotProps("input-group", "adornment")}
              className={sx(styles.adornment)}
              data-ads-control-icon-slot="true"
            >
              {trailing}
            </span>
          ) : null}
          {actions ? (
            <span
              {...themeSlotProps("input-group", "actions")}
              className={sx(styles.actions, actionsInsetStyles[size])}
            >
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
