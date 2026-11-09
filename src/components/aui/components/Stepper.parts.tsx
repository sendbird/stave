import { i18n, useTranslation } from "@/i18n";
import { Children, isValidElement, useContext } from "react";
import type * as React from "react";

import { controlHeightBySize } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  flattenStepperChildren,
  StepperItemContext,
  StepperPositionContext,
  StepperRootContext,
  type StepperDistribution,
  type StepperOrientation,
  type StepperSize,
  type StepperVariant,
} from "./Stepper.context";
import {
  deriveStepperStatus,
  statusIcons,
  statusLabels,
  useStepperFlow,
  type StepperStatus,
} from "./Stepper.flow";
import {
  bodyNavigationStatusStyles,
  bodyVariantStyles,
  contentVariantStyles,
  itemDistributionStyles,
  itemOrientationStyles,
  itemVariantStyles,
  labelStyles,
  listOrientationStyles,
  markerStyles,
  markerVariantStyles,
  styles,
  triggerVariantStyles,
} from "./Stepper.styles";
import {
  itemSizeStyles,
  itemXsRhythmStyles,
  markerSizeStyles,
  xsCopyTrackHorizontal,
  xsGap,
} from "./Stepper.size.styles";
import { VisuallyHidden } from "./VisuallyHidden";

/**
 * The Stepper's compound parts.
 *
 * They left `Stepper.tsx` when that file reached its 500-line cap: the contract
 * grew a step-ownership layer (`Stepper.flow.tsx`) and the parts are the largest
 * thing in the component. `Stepper.tsx` is now the assembly point — the array
 * convenience API plus the namespace — and the dependency runs one way, parts →
 * context/flow/styles, so `check:structure` stays satisfied.
 */
// ---------------------------------------------------------------------------
// Compound parts (compositional Stepper API)
// ---------------------------------------------------------------------------

export type StepperRootProps = React.ComponentProps<"nav"> & {
  /** `content` keeps the flow intrinsic; `fill` distributes it across its owner. */
  distribution?: StepperDistribution;
  orientation?: StepperOrientation;
  /**
   * Host extension: show each `navigation` step's `Description` under its
   * title instead of only to assistive technology. A `track` step always
   * shows it. @default false
   */
  showDescriptions?: boolean;
  /**
   * Visual scale for markers, copy, and interactive targets. `xs` is the
   * dense-inspector rung: a 16px marker, a 28px target, and a stepped rhythm
   * (row 12px, marker-to-copy gap 4px) from the fixed `densityPad` scale.
   */
  size?: StepperSize;
  /** `track` explains progress; `navigation` supports revisiting available steps. */
  variant?: StepperVariant;
} & XstyleProp;

/** The stepper landmark (`<nav aria-label>` wrapping an `<ol>` of items). */
export function StepperRoot({
  "aria-label": ariaLabel = i18n.t("ui:stepper.progress"),
  children,
  className,
  distribution = "content",
  orientation = "horizontal",
  showDescriptions = false,
  size = "md",
  variant = "track",
  xstyle,
  ...props
}: StepperRootProps) {
  useTranslation();
  const items = flattenStepperChildren(children);
  const theme = themeProps("stepper", { size, variant });

  return (
    <nav
      {...props}
      {...theme}
      aria-label={ariaLabel}
      className={cx(
        sx(
          styles.root,
          distribution === "content" ? styles.rootContent : styles.rootFill,
          orientation === "horizontal" && styles.rootHorizontal,
          orientation === "vertical" && styles.rootVertical,
          variant === "navigation" && styles.rootNavigation,
          xstyle,
        ),
        theme.className,
        className,
      )}
      /*
       * The `data-stepper-*` trio predates the theme axes and stays: it is the
       * only place `orientation` is published, and dropping the other two would
       * break a consumer query for a name change no brand asked for.
       */
      data-stepper-orientation={orientation}
      data-stepper-size={size}
      data-stepper-variant={variant}
    >
      <StepperRootContext.Provider
        value={{ distribution, orientation, showDescriptions, size, variant }}
      >
        <div className={sx(styles.queryContainer)}>
          <ol
            className={sx(
              styles.list,
              listOrientationStyles[orientation],
              variant === "track" &&
                orientation === "horizontal" &&
                styles.listTrackHorizontal,
              orientation === "horizontal" &&
                distribution === "fill" &&
                styles.horizontalFill,
            )}
            role="list"
          >
            {items.map((child, index) => (
              <StepperPositionContext.Provider
                key={child.key ?? index}
                value={{ count: items.length, index }}
              >
                {child}
              </StepperPositionContext.Provider>
            ))}
          </ol>
        </div>
      </StepperRootContext.Provider>
    </nav>
  );
}

export type StepperItemProps = React.ComponentProps<"li"> & {
  /** Prevents selection while keeping the step visible in the route. */
  disabled?: boolean;
  /**
   * Mark this step as working — a verification round-trip, a provisioning wait.
   * It stays the *current* step: "in flight" and "where you are" are different
   * facts, so this is a boolean rather than a fifth `status`. The marker takes
   * the flow's `loading` indicator when one is supplied.
   */
  loading?: boolean;
  /**
   * Status; drives `aria-current="step"` and the indicator tone/icon. Optional
   * inside a `Stepper.Flow`, which derives it from the active step — pass it to
   * override, which is how a failed step is expressed (`error` is never derived).
   */
  status?: StepperStatus;
  /**
   * This step's 1-based number inside a `Stepper.Flow`. Defaults to its position
   * in the list, so an ordinary rail needs no numbering at all; pass it when the
   * DOM order and the step numbers differ.
   */
  step?: number;
} & XstyleProp;

/** One step (`<li>`); provides its `status` to the nested `Indicator`. */
export function StepperItem({
  children,
  className,
  disabled = false,
  loading = false,
  status: statusProp,
  step,
  xstyle,
  ...props
}: StepperItemProps) {
  const { distribution, orientation, size, variant } =
    useContext(StepperRootContext);
  const { count, index } = useContext(StepperPositionContext);
  const flow = useStepperFlow();
  const stepNumber = step ?? index + 1;
  /*
   * Explicit `status` always wins: it is the only way to say `error`, and it is
   * what every pre-flow composition passes. Derivation is the fallback, so
   * adding a `Stepper.Flow` around an existing rail changes nothing until the
   * items stop declaring their own status.
   */
  const status =
    statusProp ??
    (flow.owned && flow.activeStep != null
      ? deriveStepperStatus(stepNumber, flow.activeStep)
      : "pending");
  const hasTrigger = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === StepperTrigger,
  );

  return (
    <StepperItemContext.Provider
      value={{ disabled, loading, status, step: stepNumber }}
    >
      <li
        {...props}
        {...themeSlotProps("stepper", "item")}
        aria-current={status === "current" && !hasTrigger ? "step" : undefined}
        aria-disabled={disabled || undefined}
        className={cx(
          sx(
            styles.item,
            itemVariantStyles[variant],
            itemOrientationStyles[variant][orientation],
            orientation === "horizontal" &&
              itemDistributionStyles[variant][distribution],
            itemSizeStyles[size],
            size === "xs" && itemXsRhythmStyles[variant][orientation],
            index === count - 1 && styles.itemLast,
            index === count - 1 &&
              variant === "navigation" &&
              styles.itemNavigationLast,
            status === "complete" && styles.connectorComplete,
            disabled && styles.itemDisabled,
            xstyle,
          ),
          className,
        )}
        data-step-disabled={disabled ? "true" : undefined}
        data-step-status={status}
      >
        <div
          {...themeSlotProps("stepper", "body")}
          className={sx(
            styles.body,
            bodyVariantStyles[variant],
            size === "xs" && xsGap,
            controlHeightBySize[size],
            variant === "navigation" && bodyNavigationStatusStyles[status],
            variant === "navigation" && !hasTrigger && styles.bodyStatic,
            disabled && styles.bodyDisabled,
          )}
        >
          {children}
        </div>
      </li>
    </StepperItemContext.Provider>
  );
}

export type StepperIndicatorProps = React.ComponentProps<"span"> & XstyleProp;

/**
 * The step marker. Tone + default icon follow the parent `Item`'s `status`;
 * pass children to replace the icon (e.g. a step number).
 */
export function StepperIndicator({
  children,
  className,
  xstyle,
  ...props
}: StepperIndicatorProps) {
  useTranslation();
  const { disabled, loading, status } = useContext(StepperItemContext);
  const { size, variant } = useContext(StepperRootContext);
  const { index } = useContext(StepperPositionContext);
  const { indicators } = useStepperFlow();
  const Icon =
    status === "complete" || status === "error" ? statusIcons[status] : null;
  /*
   * Resolution order: a `loading` step takes the flow's loading content, then a
   * per-state override, then `children`, then the built-in glyph/ordinal. The
   * loading entry wins over the state entry because a step that is working is
   * still `current` — one marker, two facts, and the more urgent one shows.
   */
  const override = loading ? indicators.loading : indicators[status];
  const theme = themeProps("stepper-indicator", {
    size,
    tone: status,
    variant,
  });

  return (
    <span
      {...props}
      {...theme}
      className={cx(
        sx(
          styles.marker,
          markerVariantStyles[variant],
          markerSizeStyles[size],
          transition.colors,
          markerStyles[status],
          disabled && styles.markerDisabled,
          xstyle,
        ),
        theme.className,
        className,
      )}
    >
      {override ??
        children ??
        (Icon ? (
          <Icon aria-hidden size={13} strokeWidth={2} />
        ) : (
          <span aria-hidden>{index + 1}</span>
        ))}
      <VisuallyHidden>
        {disabled
          ? i18n.t("ui:stepper.statusUnavailable", { status: i18n.t(statusLabels[status]) })
          : i18n.t("ui:stepper.statusSuffix", { status: i18n.t(statusLabels[status]) })}
      </VisuallyHidden>
    </span>
  );
}

export type StepperContentProps = React.ComponentProps<"span"> & XstyleProp;

/** Groups `Title` + `Description` in the copy column. */
export function StepperContent({
  className,
  xstyle,
  ...props
}: StepperContentProps) {
  const { orientation, size, variant } = useContext(StepperRootContext);
  return (
    <span
      {...props}
      {...themeSlotProps("stepper", "content")}
      className={cx(
        sx(
          styles.copy,
          contentVariantStyles[variant],
          variant === "track" &&
            orientation === "horizontal" &&
            styles.copyTrackHorizontal,
          variant === "track" &&
            orientation === "horizontal" &&
            size === "xs" &&
            xsCopyTrackHorizontal,
          xstyle,
        ),
        className,
      )}
    />
  );
}

export type StepperTitleProps = React.ComponentProps<"span"> & XstyleProp;

/** The step label. */
export function StepperTitle({
  className,
  xstyle,
  ...props
}: StepperTitleProps) {
  const { disabled, status } = useContext(StepperItemContext);
  return (
    <span
      {...props}
      {...themeSlotProps("stepper", "title")}
      className={cx(
        sx(
          styles.label,
          labelStyles[status],
          disabled && styles.labelDisabled,
          xstyle,
        ),
        className,
      )}
    />
  );
}

export type StepperDescriptionProps = React.ComponentProps<"span"> & XstyleProp;

/** Supporting copy under the title. */
export function StepperDescription({
  className,
  xstyle,
  ...props
}: StepperDescriptionProps) {
  const { showDescriptions, variant } = useContext(StepperRootContext);
  return (
    <span
      {...props}
      {...themeSlotProps("stepper", "description")}
      className={cx(
        sx(
          styles.description,
          variant === "navigation" &&
            (showDescriptions
              ? styles.descriptionNavigationShown
              : styles.descriptionNavigation),
          xstyle,
        ),
        className,
      )}
    />
  );
}

export type StepperTriggerProps = React.ComponentProps<"button"> & XstyleProp;

/** Optional button that lets a caller revisit an available step. */
export function StepperTrigger({
  children,
  className,
  disabled: disabledProp,
  type = "button",
  xstyle,
  ...props
}: StepperTriggerProps) {
  const { disabled, status, step } = useContext(StepperItemContext);
  const { size, variant } = useContext(StepperRootContext);
  const { goToStep, owned } = useStepperFlow();
  const theme = themeProps("stepper-trigger", { size, tone: status, variant });

  return (
    <button
      {...props}
      {...theme}
      aria-current={status === "current" ? "step" : undefined}
      /*
       * Inside a `Stepper.Flow` the trigger does what it looks like it does:
       * it moves the stepper. A caller's own `onClick` still runs first and may
       * `preventDefault()` to keep the step (a guard on an unsaved form).
       */
      onClick={
        owned
          ? (event) => {
              props.onClick?.(event);
              if (!event.defaultPrevented) goToStep(step);
            }
          : props.onClick
      }
      className={cx(
        sx(
          styles.trigger,
          triggerVariantStyles[variant],
          size === "xs" && xsGap,
          controlHeightBySize[size],
          transition.control,
          focusRing.ring,
          focusRing.ringInset,
          xstyle,
        ),
        theme.className,
        className,
      )}
      data-step-status={status}
      disabled={disabledProp || disabled}
      type={type}
    >
      {children}
    </button>
  );
}

/*
 * The parts are exported under qualified names on purpose. Exporting `Root`,
 * `Item`, `Title` … from the design system would put seven of the most generic
 * identifiers in the language into its namespace — `check:aui`'s `aui-shadow`
 * rule immediately flagged a consumer's own `function Root()` as shadowing one. The
 * short names live only on the `Stepper.*` namespace, which is where they read
 * correctly anyway.
 */
