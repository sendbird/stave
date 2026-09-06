import type { StyleXValue } from "../utils/stylex";
import { m } from "motion/react";
import * as React from "react";

import { ButtonRoot, type ButtonRootProps } from "../headless/button";
import {
  type ControlScale,
  controlHeights,
  controlIconSizes,
  controlSquares,
} from "../recipes/control-metrics";
import { controlChrome } from "../recipes/control-chrome";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { controlWidth } from "../recipes/control-width";
import { motionPrimitives, springSnappy } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import {
  buttonDangerToneStyles,
  buttonSizeGapStyles,
  buttonSizePadStyles,
  buttonVariantStyles,
  getLegacyButtonIconScale,
  isLegacyButtonIconSize,
  withTruncatingButtonLabels,
} from "./Button.config";
import { styles } from "./Button.styles";
import type {
  ButtonPress,
  ButtonSize,
  ButtonTone,
  ButtonVariant,
} from "./Button.types";
import { Loader } from "./Loader";

export type {
  ButtonIconSize,
  ButtonPress,
  ButtonSize,
  ButtonTone,
  ButtonVariant,
} from "./Button.types";

type MotionButtonRootProps = ButtonRootProps &
  Pick<React.ComponentProps<typeof m.button>, "transition" | "whileTap">;

// Motion's DOM event names overlap React's (`onDrag`) even though this wrapper
// adds only `whileTap` and `transition`. Narrowing to those two additions keeps
// ButtonRoot's native event interface intact for callers.
const MotionButtonRoot = m.create(
  ButtonRoot,
) as React.ComponentType<MotionButtonRootProps>;

// A one-pixel settle is local press geometry, not a foundation scale step.
// Dave's motion foundation deliberately exposes reusable enter/exit distances
// (4px and 8px), neither of which is appropriate for a pressed control.
const buttonSettleDepth = 1;

/**
 * Everything except the icon-only discrimination — see `ButtonProps`.
 * `iconOnly` is deliberately NOT declared here; it lives only in the union
 * arms, and that is load-bearing (again, see `ButtonProps`).
 */
type ButtonSharedProps = Omit<ButtonRootProps, "className"> & {
  className?: string;
  /** Host composition resolved before class names are emitted. */
  xstyle?: StyleXValue;
  /** Product rows and custom controls retain their DOM children and geometry. */
  layout?: "control" | "host";
  /** Remove inline chrome so a text action can align with surrounding copy. */
  flushInline?: boolean;
  /**
   * Fill the available inline size like a form-field action. Buttons hug their
   * content by default, even when a grid or stretched flex parent would
   * otherwise make an inline control span the row.
   */
  fullWidth?: boolean;
  /** Override the glyph size without changing the button's control size. */
  iconSize?: number | string;
  loading?: boolean;
  /**
   * Label to show in place of `children` while `loading`. Without it the
   * spinner OVERLAYS the label and the button keeps its width, which is the
   * right default for a button inside a row whose geometry must not move.
   * With it the button says what it is doing — "Create issue" → "Creating…" —
   * which is what a submit button in a dialog footer or a form wants, and
   * accepts the reflow that swap implies.
   *
   * This is the same contract `AlertDialog` already exposes as
   * `confirmPendingLabel`, and it is on `Button` because the asymmetry pushed
   * consumers off the `loading` path entirely: `apps/crane` re-created it as
   * `AsyncButtonContent` (80 call sites across 20 files) and `apps/canvas`
   * inlines the same spinner + label pair. Those forks pass `disabled={busy}`
   * instead of `loading`, so they also lose `aria-busy` and the
   * `focusableWhenDisabled` that keeps the keyboard on the button while the
   * request is in flight — the reason this belongs in the system.
   *
   * Ignored for icon-only buttons, which have no label to swap.
   */
  loadingLabel?: React.ReactNode;
  /**
   * Press affordance.
   *
   * - `settle` (default) springs the button down by
   *   one pixel, whatever the button's width. Paired with the
   *   `elevationRaised` → `elevationFlat` collapse the bordered variants
   *   already carry, the shadow gap closes as the surface moves down, which is
   *   the press.
   * - `scale` springs to `motionPrimitives.scalePress`. Correct only where the
   *   geometry is **bounded by contract** — an icon-only square, a round
   *   detached action — because a centre-origin scale moves each edge by
   *   `width·(1 − s)/2`, so the same token is 0.5px on an icon button and 18px
   *   on a full-bleed row.
   * - `none` drops the transform entirely. The variant's own `:active` fill
   *   stays the affordance, so `none` is not "no feedback".
   *
   * `settle` replaced `scale` as the default in the press-geometry pass. `scale`
   * was the reason this prop had to exist at all: every full-bleed pressable in
   * ADS (`SidebarMenuButton`, `SidebarGroupLabel`, `Collapsible.Trigger`,
   * `Accordion.Trigger`) had to opt *out* of the default to avoid reading as a
   * collapsing row, and a stretched `Toggle` or form-footer submit — which has
   * no such prop — could not. A width-independent default removes the class of
   * bug instead of documenting an escape from it.
   *
   * This has to be a prop: the transform is a Motion inline style on the
   * default path and a separate `stylex.create` rule on the `render` path, so
   * neither can lose to a class merged in by a caller.
   */
  press?: ButtonPress;
  size?: ButtonSize;
  /** Semantic axis, composed with `variant`. @default "default" */
  tone?: ButtonTone;
  variant?: ButtonVariant;
};

/**
 * An icon-only button has no visible text, so its accessible name can only come
 * from a prop (WCAG 4.1.2). `TooltipIconButton` already makes `aria-label`
 * required one file over; leaving `Button` unconstrained is what let unnamed
 * squares ship. `title` is accepted as the alternative because it is both a
 * name source and the native tooltip an icon control usually wants anyway.
 */
type ButtonAccessibleName = { "aria-label": string } | { title: string };

type IconOnlyProp<Value extends boolean | undefined> = {
  /**
   * Square the control at whatever `size` says and drop the inline gutter — a
   * glyph with no label. **Requires `aria-label` or `title`.**
   *
   * This is the axis split out of `size`: shape and scale are independent, so
   * `iconOnly` composes with every scale step (including `xs`, which the old
   * `icon*` trio had no value for) and `size` stays comparable with every
   * other control in the system.
   */
  iconOnly?: Value;
};

/**
 * The flat prop bag: every Button prop, none of the icon-only discrimination.
 * The implementation destructures this, and it is exported for wrappers that
 * forward the whole bag to `Button` (`ButtonGroupButton`) — `Omit<ButtonProps,
 * …>` collapses the union and drops `iconOnly` entirely (see `ButtonProps`),
 * so a wrapper that wants to keep forwarding it builds on this and re-applies
 * the union on its own public export.
 */
export type ButtonBaseProps = ButtonSharedProps & IconOnlyProp<boolean>;

/**
 * Three arms, and all three are load-bearing.
 *
 * 1. **not icon-only** — `iconOnly` pinned to `false`, no name required. This
 *    is the arm a plain `<Button>Save</Button>` lands on.
 * 2. **named, `iconOnly` unmentioned** — this arm is what keeps `iconOnly` out
 *    of `keyof ButtonProps`. `keyof` a union is the INTERSECTION of its
 *    members' keys, so a key missing from one arm is missing from the whole;
 *    that in turn keeps `Omit<ButtonProps, …>` — the shape `CopyButton`,
 *    `Carousel`, `StackTrace`, `CallControlBar` and `Composer` all derive
 *    their own props from — free of an `iconOnly?: boolean` they would then be
 *    unable to spread back into `<Button>` (a widened `boolean` satisfies
 *    neither `false` nor `true`). Without this arm the constraint would
 *    propagate a compile error into every wrapper in the package.
 * 3. **named and icon-only** — `iconOnly?: true`. Needed because TypeScript
 *    resolves a JSX attribute against the union's own property, which arm 1
 *    alone would type as `false`; without arm 3 even a correctly named
 *    `<Button iconOnly aria-label="Close" />` is rejected.
 *
 * Net effect: `iconOnly` (or `iconOnly={maybe}`) without `aria-label`/`title`
 * matches no arm and fails to compile; with a name it matches arm 2 or 3.
 *
 * The deprecated `icon*` sizes are NOT name-constrained. They could not be:
 * a wrapper holding a widened `size: ButtonSize` would have to prove a name it
 * does not have, which breaks callers — and "deprecations keep working" is the
 * stronger rule. The constraint rides the replacement axis instead, which is
 * what migrating off `icon*` buys.
 */
export type ButtonProps =
  | (ButtonSharedProps & IconOnlyProp<false>)
  | (ButtonSharedProps & ButtonAccessibleName)
  | (ButtonSharedProps & IconOnlyProp<true> & ButtonAccessibleName);

const ButtonImpl = React.forwardRef<
  React.ComponentRef<typeof ButtonRoot>,
  ButtonBaseProps
>(function Button(
  {
    children,
    className,
    xstyle,
    disabled,
    flushInline = false,
    fullWidth = false,
    iconOnly = false,
    iconSize,
    layout = "control",
    loading = false,
    loadingLabel,
    press = "settle",
    render,
    size = "md",
    style,
    tone = "default",
    variant = "primary",
    ...props
  },
  ref,
) {
  if (layout === "host") {
    return <ButtonRoot {...props} ref={ref} render={render} style={style}
      disabled={disabled || loading} aria-busy={loading || props["aria-busy"] || undefined}
      className={cx(sx(controlChrome.triggerQuiet, focusRing.ring, transition.colors, xstyle), className)}>
      {children}
    </ButtonRoot>;
  }
  // Default element is a Motion button that springs on press (Motion owns
  // transform). When the caller supplies their own `render` (e.g. a link
  // button), keep that element and fall back to the CSS `:active` press so the
  // affordance survives without converting an unknown element to Motion.
  // `press="none"` takes neither path: no Motion wrapper, no `:active`
  // transform, and the element stays the headless default.
  const pressed = press !== "none";
  const motionPress = render == null && pressed;
  const cssPress = render != null && pressed;
  const hasNativeButtonRender =
    render == null ||
    (React.isValidElement(render) && render.type === "button");
  // A `render` element carrying an `href` is a LINK — `<a href>`, but also a
  // router `Link`, which is why the test is the prop and not the tag. See
  // `linkProps` below for everything that follows from it.
  const linkRender =
    React.isValidElement<{ href?: unknown }>(render) &&
    render.props.href != null;
  const nativeButton = linkRender
    ? // An `<a href>` is never a native button, whatever the caller declared.
      // Getting this wrong is not cosmetic: `nativeButton` is what decides
      // between emitting a `disabled` attribute and emitting `aria-disabled`,
      // and an anchor silently ignores the former.
      false
    : (props.nativeButton ?? hasNativeButtonRender);
  const inactive = disabled || loading;
  const motionProps = motionPress
    ? {
        transition: springSnappy,
        whileTap: inactive
          ? undefined
          : press === "scale"
            ? { transform: `scale(${motionPrimitives.scalePress})` }
            : { transform: `translateY(${buttonSettleDepth}px)` },
      }
    : {};
  const Root = motionPress ? MotionButtonRoot : ButtonRoot;

  // Shape and scale, de-interleaved. `size` resolves to a rung on the shared
  // control scale; the deprecated `icon*` values contribute their rung AND the
  // square shape, which is precisely the conflation `iconOnly` undoes.
  const legacyIconSize = isLegacyButtonIconSize(size);
  const scale: ControlScale = legacyIconSize
    ? getLegacyButtonIconScale(size)
    : size;
  const square = iconOnly || legacyIconSize;
  // `variant="danger"` is the tone axis spelled as a weight. Fold it into the
  // pair it has always been equivalent to, so there is exactly one danger
  // implementation and `variant="danger"` keeps rendering byte-identically:
  // `styles.primary` declares the same four properties `styles.danger`
  // overrides, so the composed output is the old class list.
  const resolvedTone = variant === "danger" ? "danger" : tone;
  const resolvedVariant = variant === "danger" ? "primary" : variant;
  const loaderSize = scale === "lg" ? "sm" : "xs";

  // An icon-only button is already a fixed square, so swapping its glyph for
  // the spinner cannot change its width. Every other size keeps its label in
  // flow and overlays the spinner instead, so starting work never reflows the
  // row the button sits in.
  // A caller that supplied `loadingLabel` has opted into the label swap, so
  // the overlay (which exists only to preserve width) would double the mark.
  const overlaySpinner = loading && !square && loadingLabel == null;
  const swapLabel = loading && !square && loadingLabel != null;
  const content = withTruncatingButtonLabels(children);

  // The link path's a11y corrections. Base UI's button behaviour still owns the
  // press and keyboard contract; what it cannot own is an element that is not a
  // button.
  const linkProps = linkRender
    ? {
        // `useButton` merges `{ role: "button" }` into EVERY element it renders
        // with `nativeButton={false}`. On a genuine `<a href>` that overwrites
        // the implicit `link` role: assistive tech announces "button", the
        // element drops out of the links rotor, and the user loses the one cue
        // that says "this navigates". Element props merge last in Base UI's
        // `mergeProps`, so passing `role` explicitly is what wins. Re-passing
        // the caller's own `role` (usually `undefined`) rather than a literal:
        // absent is the right answer — an `<a href>`'s implicit role is already
        // `link`, and restating it would be a second source of truth — but a
        // caller who deliberately said `role="menuitem"` must not be clobbered
        // by the correction either.
        role: props.role,
        ...(inactive
          ? {
              // `disabled` is inert on an anchor, so Base UI (correctly) never
              // emits it here — which means nothing at all expressed the state
              // on the element itself. Spell it out: named for AT, out of the
              // tab order, and inert to the pointer via `styles.linkInert`.
              // `tabIndex` is set here rather than left to Base UI because
              // `focusableWhenDisabled` (which `loading` turns on below, to keep
              // the keyboard on a busy button) would otherwise hold a loading
              // link in the tab order with nothing to activate.
              "aria-disabled": true,
              tabIndex: -1,
            }
          : null),
      }
    : null;

  return (
    <Root
      {...props}
      {...motionProps}
      {...linkProps}
      ref={ref}
      aria-busy={loading || props["aria-busy"] || undefined}
      data-ads-control="button"
      data-ads-control-size={size}
      data-ads-control-tone={resolvedTone}
      data-ads-control-variant={variant}
      className={cx(
        sx(
          styles.root,
          fullWidth ? controlWidth.field : controlWidth.intrinsic,
          transition.control,
          focusRing.ring,
          buttonVariantStyles[resolvedVariant],
          // Tone composes ON TOP of the variant and only restates the
          // properties that carry the hue, so an outline-danger button keeps
          // outline's border weight, elevation and geometry.
          resolvedTone === "danger" && buttonDangerToneStyles[resolvedVariant],
          square ? controlSquares[scale] : controlHeights[scale],
          square ? styles.iconPad : buttonSizePadStyles[scale],
          square ? styles.gapIcon : buttonSizeGapStyles[scale],
          flushInline && styles.flushInline,
          cssPress && (press === "scale" ? styles.cssPress : styles.cssSettle),
          cssPress && transition.transformFallback,
          overlaySpinner && styles.loadingHost,
          xstyle,
          inactive && styles.disabled,
          linkRender && inactive && styles.linkInert,
        ),
        className,
      )}
      disabled={inactive}
      focusableWhenDisabled={loading || props.focusableWhenDisabled}
      nativeButton={nativeButton}
      style={
        {
          ...style,
          "--ads-control-icon-size": iconSize ?? controlIconSizes[scale],
        } as React.CSSProperties
      }
      render={render}
    >
      {overlaySpinner ? (
        <>
          {/*
           * Both wrappers repeat `data-ads-control="button"` so the shared
           * glyph rule in `styles.css` (`[data-ads-control="button"] > svg`)
           * still sizes icons that now sit one level deeper — otherwise a
           * leading icon would fall back to its intrinsic size and the
           * "preserve the layout" fix would itself change the width.
           */}
          <span className={sx(styles.loadingLabel)} data-ads-control="button">
            {content}
          </span>
          <span
            aria-hidden
            className={sx(styles.spinnerOverlay)}
            data-ads-control="button"
          >
            <Loader aria-hidden size={loaderSize} />
          </span>
        </>
      ) : swapLabel ? (
        <>
          <Loader aria-hidden size={loaderSize} />
          {withTruncatingButtonLabels(loadingLabel)}
        </>
      ) : loading ? (
        <Loader aria-hidden size={loaderSize} />
      ) : (
        content
      )}
    </Root>
  );
});

/**
 * The implementation takes the flat `ButtonBaseProps` — a component body cannot
 * usefully destructure a discriminated union, and the discrimination is a
 * caller-facing constraint, not an internal one. The public type is reapplied
 * here so `<Button iconOnly>` without a name is a compile error.
 */
export const Button = ButtonImpl as React.ForwardRefExoticComponent<
  ButtonProps & React.RefAttributes<React.ComponentRef<typeof ButtonRoot>>
>;
