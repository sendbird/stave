import * as stylex from "@stylexjs/stylex";

import { motionPrimitives, vars } from "../tokens/tokens.stylex";

/**
 * `soft` needs a fill one step *stronger* than its resting tint in light, dark,
 * AND high contrast — and no single token does that. The neighbours of
 * `colorCanvasSubtle` move in opposite directions across the ramps (light
 * `colorSurfaceTint` is lighter than the tint, dark `colorSurfaceTint` is
 * darker) and the high-contrast theme collapses both onto one value, so any
 * fixed token pair reads inert in at least one theme. Mixing the theme's own
 * ink into the theme's own tint always darkens a light ramp and always lightens
 * a dark one, so the hover/press steps stay correct everywhere — including the
 * new dark neutral ramp — without inventing a token.
 */
const softHover = `color-mix(in oklab, ${vars.colorText} 8%, ${vars.colorCanvasSubtle})`;
const softPress = `color-mix(in oklab, ${vars.colorText} 12%, ${vars.colorCanvasSubtle})`;
/**
 * The press step for every OTHER bordered variant, extending the `soft`
 * pattern above: mix ~5% of the theme's own text ink into the variant's own
 * `:hover` colour (not its resting fill) so `:active` reads one step deeper
 * than `:hover` everywhere, in every theme, without a fourth hardcoded color.
 * The delta mirrors `softHover` → `softPress` (8% → 12%, a 4-point step); here
 * the hover colour already carries none of that mix, so ~5% on top of it lands
 * the same visual distance.
 */
const canvasSubtlePress = `color-mix(in oklab, ${vars.colorText} 5%, ${vars.colorCanvasSubtle})`;
/*
 * Lift, not ink. The rule above assumes `:hover` sits at the resting fill, which
 * held while `colorAccentHover` shipped identical to `colorAccent`. It no longer
 * does — hover is Neutral870, a step LIGHTER than the near-black accent — so
 * mixing text ink into it walks the press back toward resting: measured
 * rgb(41,40,36) → rgb(50,48,44) → rgb(46,44,41), a press that undoes its own
 * hover. The operand is picked by the FILL, not by the theme: a dark fill lifts.
 * 6% lands ΔL 0.082 off resting, against the ~0.077 every other pressed step
 * takes.
 */
const primaryPress = `color-mix(in oklab, ${vars.colorMixLift} 6%, ${vars.colorAccentHover})`;
const dangerPress = `color-mix(in oklab, ${vars.colorText} 5%, ${vars.colorDangerHover})`;
/**
 * Danger's washes, derived by the same rule as the neutral pair above so the
 * `tone` axis is a hue swap and not a second, differently-behaved language.
 *
 * `colorDangerSoft` is the tinted danger surface — it plays the part
 * `colorCanvasSubtle` plays for the neutral arms — so the *resting* fill of a
 * `soft`+`danger` button steps 8% → 12% of the theme's own ink (mirroring
 * `softHover`/`softPress`), and the arms that rest transparent or raised
 * (`outline`, `quiet`, `secondary`) take `colorDangerSoft` itself as the hover
 * and land the same 5% press step `canvasSubtlePress` uses. Mixing the theme's
 * own ink is what keeps all six correct in the dark and high-contrast ramps
 * without inventing a `colorDangerSoftHover` token.
 */
const dangerWashHover = `color-mix(in oklab, ${vars.colorText} 8%, ${vars.colorDangerSoft})`;
const dangerWashPress = `color-mix(in oklab, ${vars.colorText} 12%, ${vars.colorDangerSoft})`;
const dangerSoftPress = `color-mix(in oklab, ${vars.colorText} 5%, ${vars.colorDangerSoft})`;
const buttonSettleTransform = "translateY(1px)";
export const styles = stylex.create({
  root: {
    alignItems: "center",
    appearance: "none",
    // Each corner reads a private custom property so ButtonGroup can join
    // adjacent actions without fighting this component's generated class
    // order. Outside a group all four fall back to the normal control radius.
    borderEndEndRadius: `var(--ads-button-radius-end-end, ${vars.radiusControl})`,
    borderEndStartRadius: `var(--ads-button-radius-end-start, ${vars.radiusControl})`,
    borderStartEndRadius: `var(--ads-button-radius-start-end, ${vars.radiusControl})`,
    borderStartStartRadius: `var(--ads-button-radius-start-start, ${vars.radiusControl})`,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    justifyContent: "center",
    // Use the whole-pixel control line box so labels share the same visual
    // center as adjacent glyphs instead of landing on a fractional half-leading.
    lineHeight: vars.lineHeightControl,
    // Height comes from the shared control-metrics recipe (sizeMetricStyles),
    // applied on every render path — never re-declare minBlockSize here.
    // Outer clamp only — the ellipsis itself lives on `label` (see
    // `withTruncatingLabels`), because `text-overflow` is inert on a flex
    // container.
    overflow: "hidden",
    textDecoration: "none",
    // Transitions come from `recipes/transition` (`transition.control` —
    // colors + opacity), composed at the call site. Transform is owned by
    // Motion on the default path; see `cssPress` for the custom-render
    // fallback, which swaps in `transition.transformFallback`.
    //
    // Deliberately NO `user-select: none`: `Button` is the most-composed
    // control in ADS, so suppressing selection here suppressed it in dialog
    // footers, toolbars, empty-state actions and pagination. Nothing about
    // pressing a button conflicts with selecting its label; the drag/gesture
    // surfaces that genuinely need it declare it themselves.
    whiteSpace: "nowrap",
  },
  /**
   * The truncating label box — a real block container, so `text-overflow`
   * applies (the flex root's own declaration never did anything). Mirrors
   * `recipes/menu.ts` `itemLabel`; `min-inline-size: 0` lets it shrink below
   * its content size as a flex item, which is what lets the ellipsis appear at
   * all.
   */
  label: {
    display: "block",
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // CSS press fallbacks, applied only when the caller passes a custom `render`
  // (so the element is not a Motion button). Pair with
  // `transition.transformFallback`, the one recipe key that names `transform`.
  //
  // Each mirrors its Motion-path twin exactly, so one component does not have
  // two different press feels depending on whether a caller passed `render` —
  // a link button and a plain button in the same toolbar must agree.
  /** `press="settle"` — the default. 1px down, independent of the width. */
  cssSettle: {
    transform: {
      default: "translateY(0)",
      ":active": buttonSettleTransform,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
  },
  /** `press="scale"` — bounded geometry only (icon square, round action). */
  cssPress: {
    transform: {
      default: "scale(1)",
      ":active": `scale(${motionPrimitives.scalePress})`,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
  },
  /**
   * Loading host. The spinner is overlaid on the button's own box, so the
   * button has to be its containing block — applied only while a labeled
   * button is loading, so a resting Button stays unpositioned.
   */
  loadingHost: {
    position: "relative",
  },
  /**
   * The label stays in flow but is painted out, so the button keeps its exact
   * resting width and the row around it never reflows the moment an action
   * starts working. `gap: inherit` reproduces the button's own item spacing
   * inside the wrapper so the measured content box is unchanged.
   *
   * Deliberately NOT `aria-hidden`: this text is the button's accessible name
   * (WCAG 4.1.2), and `opacity: 0` already removes it visually while
   * `aria-busy` on the button communicates the pending state.
   */
  loadingLabel: {
    alignItems: "center",
    display: "inline-flex",
    gap: "inherit",
    minInlineSize: 0,
    opacity: 0,
  },
  spinnerOverlay: {
    alignItems: "center",
    display: "inline-flex",
    insetBlock: 0,
    insetInline: 0,
    justifyContent: "center",
    position: "absolute",
  },
  primary: {
    backgroundColor: {
      default: vars.colorAccent,
      ":hover": vars.colorAccentHover,
      ":active": primaryPress,
    },
    borderColor: vars.colorAccent,
    boxShadow: {
      default: vars.elevationRaised,
      ":active": vars.elevationFlat,
    },
    color: vars.colorAccentText,
  },
  secondary: {
    backgroundColor: {
      default: vars.colorSurfaceRaised,
      ":hover": `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 6%)`,
      ":active": canvasSubtlePress,
    },
    borderColor: vars.colorBorder,
    boxShadow: {
      default: vars.elevationRaised,
      ":active": vars.elevationFlat,
    },
    color: vars.colorText,
  },
  /**
   * Borderless tinted fill — the weight between `secondary` (a bordered box
   * that competes for attention when a dense row has three of them) and
   * `quiet` (invisible until hovered). Dense internal-tool row actions read as
   * real, tappable controls without turning a table into a grid of outlines.
   *
   * The border stays transparent, so `soft` measures identically to every
   * bordered variant and can sit in a segmented group or filter row beside
   * them without a 1px seam.
   */
  soft: {
    backgroundColor: {
      default: vars.colorCanvasSubtle,
      ":hover": softHover,
      ":active": softPress,
    },
    borderColor: "transparent",
    color: vars.colorText,
  },
  outline: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": canvasSubtlePress,
    },
    borderColor: vars.colorBorder,
    boxShadow: {
      default: vars.elevationRaised,
      ":active": vars.elevationFlat,
    },
    color: vars.colorText,
  },
  link: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: vars.colorAccent,
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
    textUnderlineOffset: 4,
  },
  // Wired like `primary`'s `colorAccent` → `colorAccentHover` pair: the one
  // destructive control in the system must not be the one control that sits
  // inert under the cursor. The border follows the fill (`primary` keeps its
  // border static only because both accent steps are near-black); `colorDanger`
  // and `colorDangerHover` are far enough apart that a static border would
  // paint a visible rim of the wrong shade around a hovered button.
  danger: {
    backgroundColor: {
      default: vars.colorDanger,
      ":hover": vars.colorDangerHover,
      ":active": dangerPress,
    },
    borderColor: {
      default: vars.colorDanger,
      ":hover": vars.colorDangerHover,
      ":active": dangerPress,
    },
    boxShadow: {
      default: vars.elevationRaised,
      ":active": vars.elevationFlat,
    },
    color: vars.colorTextInverted,
  },
  // Detached actions such as Conversation's jump-to-latest control own their
  // circle and elevation here instead of redrawing a one-off raw button.
  floating: {
    "--ads-button-radius-end-end": vars.radiusFull,
    "--ads-button-radius-end-start": vars.radiusFull,
    "--ads-button-radius-start-end": vars.radiusFull,
    "--ads-button-radius-start-start": vars.radiusFull,
    backgroundColor: {
      default: vars.colorSurfaceRaised,
      ":hover": `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 6%)`,
      ":active": canvasSubtlePress,
    },
    borderColor: vars.colorBorder,
    // `elevation2` — a detached viewport action, not the `elevation1` bordered
    // family above — stays flat across states; only elevation1 carriers
    // collapse to elevation0 on `:active` (§1.5).
    boxShadow: vars.elevationLift,
    color: vars.colorTextMuted,
  },
  // ---- tone="danger" arms --------------------------------------------------
  // Composed AFTER the variant style, so each of these only has to restate the
  // properties the variant declares. `danger` is a TONE, not a weight: an
  // outline-danger button is still an outline button — same border, same
  // elevation, same wash geometry — with the destructive hue substituted. That
  // is why every arm below mirrors its neutral twin property-for-property
  // instead of inventing its own chrome.
  //
  // The ink is `colorDangerText`, not `colorDanger`: `colorDanger` is a FILL
  // role (it is what `primary`+`danger` paints), and setting a 0.57-lightness
  // fill colour as label text on a raised surface lands under the 4.5:1 text
  // floor. `colorDangerText` is the ramp's text role and clears it.
  /**
   * `secondary` keeps its raised surface — it is the bordered "second action"
   * weight, and a destructive second action ("Delete" beside "Cancel") must
   * still read as a real button at rest, not as a red-tinted panel. Only the
   * border, the ink and the wash carry the tone.
   */
  dangerSecondary: {
    backgroundColor: {
      default: vars.colorSurfaceRaised,
      ":hover": vars.colorDangerSoft,
      ":active": dangerSoftPress,
    },
    borderColor: vars.colorDangerBorder,
    color: vars.colorDangerText,
  },
  dangerOutline: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorDangerSoft,
      ":active": dangerSoftPress,
    },
    borderColor: vars.colorDangerBorder,
    color: vars.colorDangerText,
  },
  /**
   * The quiet arm restates `color` at all three states because the neutral
   * quiet language (`controlChrome.triggerQuiet`) BRIGHTENS its ink from
   * `colorTextMuted` on hover — that ramp is how a borderless control announces
   * itself. A danger control has already announced itself with hue at rest, so
   * it holds one ink and lets the wash do the state work; without the explicit
   * `:hover`/`:active` entries the quiet recipe's `colorText` would win on
   * hover and a hovered destructive item would go neutral mid-gesture.
   */
  dangerQuiet: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorDangerSoft,
      ":active": dangerSoftPress,
    },
    borderColor: "transparent",
    color: {
      default: vars.colorDangerText,
      ":hover": vars.colorDangerText,
      ":active": vars.colorDangerText,
    },
  },
  /**
   * `soft` rests ON the tint, so its steps come from the 8%/12% pair rather
   * than the 5% press used by the arms that rest transparent — same reasoning
   * as `softHover`/`softPress` for the neutral tint.
   */
  dangerSoft: {
    backgroundColor: {
      default: vars.colorDangerSoft,
      ":hover": dangerWashHover,
      ":active": dangerWashPress,
    },
    borderColor: "transparent",
    color: vars.colorDangerText,
  },
  /**
   * `link` and `floating` carry no fill to tint, so the tone is ink only.
   * `floating` keeps `elevation2` and its circle from the variant.
   */
  dangerInk: {
    color: vars.colorDangerText,
  },
  // Heights/squares come from the shared control-metrics recipe
  // (sizeMetricStyles below); these keep only per-size padding and type.
  //
  // `xs` mirrors TextField's `xs` exactly (`fontSizeXs` + the `space2` gutter
  // `sm` also uses) — the 28px rung exists so a Button can stand in an `xs`
  // filter/toolbar row beside an `xs` TextField or Select without being the one
  // control 4px taller than the row it is in.
  xs: {
    fontSize: vars.fontSizeCaption,
    paddingBlock: 0,
    paddingInline: vars.space8,
  },
  sm: {
    paddingBlock: 0,
    // 12, not 8: at 32px tall an 8px inset reads as cramped, and sm is the
    // size dense surfaces (toolbars, table rows, cards) reach for most.
    paddingInline: vars.space12,
  },
  md: {
    paddingBlock: 0,
    paddingInline: vars.space12,
  },
  lg: {
    fontSize: vars.fontSizeLead,
    paddingBlock: 0,
    paddingInline: vars.space16,
  },
  gapXs: {
    gap: vars.space4,
  },
  gapSm: {
    gap: vars.space4,
  },
  gapMd: {
    gap: vars.space8,
  },
  gapLg: {
    gap: vars.space12,
  },
  gapIcon: {
    gap: vars.space4,
  },
  flushInline: {
    borderInlineEndWidth: 0,
    borderInlineStartWidth: 0,
    paddingInline: 0,
  },
  iconPad: {
    paddingBlock: 0,
    paddingInline: 0,
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  /**
   * The disabled/loading expression for a Button rendered as a **link**
   * (`render={<a href=…>}`), which cannot carry the `disabled` attribute.
   *
   * `pointer-events: none` is the load-bearing half, and it closes a hole a
   * JavaScript click guard structurally cannot: Base UI stops a disabled
   * control by calling `preventDefault()` from `onClick`, but a middle-click
   * and a ⌘/Ctrl-click on an `<a href>` dispatch `auxclick`/navigate through
   * the browser's own link handling — `onClick` never fires, so a "loading"
   * link would still open its href in a new tab. It also suppresses the
   * `:hover`/`:active` washes the variant declares, which would otherwise keep
   * inviting a press that does nothing.
   *
   * Paired at the call site with `aria-disabled` and `tabIndex={-1}`; see
   * `Button.tsx`. Applied ONLY on the link path — a native `<button>` gets the
   * real attribute, which already does all three.
   */
  linkInert: {
    pointerEvents: "none",
  },
});
