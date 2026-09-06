import * as stylex from "@stylexjs/stylex";

import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";

/**
 * InputGroup's painted surface and its four per-size lookups, split out of
 * `InputGroup.tsx` because that module sat 7 lines under the source-size
 * ceiling and the group still had a scale rung missing. The style sheet is the
 * half that never reads component state, so it is the half that moves. Every
 * key below is the one that was inline before; the `lg` arms are the additions.
 */

export const styles = stylex.create({
  field: {
    // `alignContent: start` is load-bearing, not cosmetic. The control scale
    // sets `minBlockSize` and never a max, so in any grid/flex parent whose
    // cross size is set by a TALLER sibling (a neighbouring field that carries
    // a description or an error), this grid row stretched and the bordered
    // group inflated without limit — a documented 36px control measured
    // **69.72px** on the docs page, a 94% overshoot. `recipes/select-styles.ts`
    // and `Combobox` already carry this; InputGroup was the one that did not.
    alignContent: "start",
    display: "grid",
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  group: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceRaised,
    // Focus contract: the bordered wrapper owns the border, so the border
    // color changes on `:focus-within` and the keyboard ring comes from
    // `focusRing.ringWithin` (see the header of `TextField.tsx`).
    borderColor: {
      default: vars.colorBorder,
      // The pointer strengthens the boundary; it does not wash the fill.
      ":hover": vars.colorBorderStrong,
      ":focus-within": vars.colorBorderFocus,
    },
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  // Inline padding and glyph box only — height lives in the control-metrics
  // recipe. Padding reads the fixed `densityPad*` scale, not `spaceN` (§8): on
  // the `spaceN` ramp, `md` and `sm` both resolved to 8px under the compact
  // theme.
  regular: {
    "--ads-control-icon-size": vars.controlIconSizeMd,
    paddingBlock: 0,
    paddingInline: densityPad.md,
  },
  compact: {
    "--ads-control-icon-size": vars.controlIconSizeSm,
    paddingBlock: 0,
    paddingInline: densityPad.sm,
  },
  // `dense` deliberately keeps `compact`'s inline padding: it is separated by
  // height and type size, not by padding, so tightening it here would be an
  // unrelated geometry change.
  dense: {
    "--ads-control-icon-size": vars.controlIconSizeSm,
    fontSize: vars.fontSizeCaption,
    paddingBlock: 0,
    paddingInline: densityPad.sm,
  },
  /*
   * The top of the ramp. Gutter and type step are `TextField`'s `lg`
   * (`space4` + `fontSizeMd`), which is what makes a `lg` field and a `lg`
   * Button in one row read as one scale — and why this arm is on `spaceN`
   * while `md`/`sm` read `densityPad`: a density preset offsets the ramp, it
   * does not re-space its top rung. The glyph box steps with it, on the same
   * 14/16/18 ramp `controlIconSizes` declares.
   */
  lg: {
    "--ads-control-icon-size": vars.controlIconSizeLg,
    fontSize: vars.fontSizeLead,
    paddingBlock: 0,
    paddingInline: vars.space16,
  },
  input: {
    alignSelf: "stretch",
    appearance: "none",
    backgroundColor: "transparent",
    borderWidth: 0,
    // Inherit so the group's single disabled/read-only state reaches the
    // value text instead of being re-declared (and re-faded) here.
    color: "inherit",
    flex: 1,
    fontFamily: vars.fontSans,
    fontSize: "inherit",
    inlineSize: "100%",
    // Integer line box, like `recipes/menu.ts` and `recipes/select-styles.ts`.
    // `lineHeightNormal` is a ratio, and 14px × 1.428571 is 19.999994px — a
    // line box 0.006px short of the 20px one the action button gets from
    // `lineHeightControl`. Centring that fractional box in the 34px content
    // area rounds the half-leading DOWN to 0 instead of 1, and every text run
    // in the field rendered exactly 1px above the action's. Same failure class
    // as the `+1` glyph nudge in `recipes/surface-chrome.ts`.
    lineHeight: vars.lineHeightControl,
    // The bordered group owns the control metric. Inheriting its min-height
    // here adds the group's two hairlines again (36 → 38, 32 → 34).
    minBlockSize: 0,
    minInlineSize: 0,
    outlineStyle: "none",
    padding: 0,
    "::placeholder": {
      color: vars.colorTextPlaceholder,
    },
    ":disabled": {
      cursor: "not-allowed",
    },
  },
  /**
   * A single-glyph slot (§9). The CONTROL owns the glyph box: the group sets
   * `--ads-control-icon-size` per size, this span IS the box, and
   * `styles.css`'s `[data-ads-control-icon-slot] > svg` rule sizes the direct
   * SVG child to it. Before this, InputGroup set neither the attribute nor the
   * box — the only marked-control family that set neither — so all seven call
   * sites hand-passed a Lucide `size`, three of them the off-scale `13`.
   *
   * The slot is therefore icon-only. Text affixes belong in `prefixText` /
   * `suffixText` (which carry the input's own `lineHeight`) and value
   * operations in `actions`; §5 already required both.
   */
  adornment: {
    alignItems: "center",
    blockSize: "var(--ads-control-icon-size)",
    color: vars.colorTextMuted,
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: "var(--ads-control-icon-size)",
    justifyContent: "center",
  },
  affix: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: "inherit",
    gap: vars.space4,
    // Integer line box — see `styles.input`. This span is what made the 1px
    // drift visible: it is a flex ITEM, so its fractional 19.984px height was
    // centred against the 34px content box directly.
    lineHeight: vars.lineHeightControl,
    whiteSpace: "nowrap",
  },
  /**
   * Value-intrinsic actions (reveal, copy, clear, apply — design-direction
   * §5). The slot only lays them out; each action should compose
   * `surfaceChrome.quietIconButton` + `focusRing.ring` and stay SHORTER than
   * the group's content box, because the bordered group owns the control
   * height. `InputGroupAction` is the ready-made implementation and
   * `SearchField`'s clear button is the reference hand-rolled one.
   */
  actions: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    gap: vars.space4,
  },
  /*
   * The action slot is pulled back OUT of the group's inline gutter, which is
   * the whole point of the negative margin: the group pads to `densityPad` so
   * the VALUE TEXT clears the border, and an action button carries that same
   * gutter again as its own padding. Stacking the two parked a 32px button
   * 12px from the border horizontally but 1.00px from it vertically — the
   * asymmetry read as the button touching the border and the focus ring.
   *
   * Pulling in by `densityPad - space1` leaves the button box 4px from the
   * border on the trailing side and lands its LABEL exactly on the group's own
   * padding line, so the label's trailing inset equals the value text's
   * leading inset. Paired with the action heights below, every size gets a
   * uniform 3px block / 4px inline clearance.
   */
  actionsInsetRegular: {
    marginInlineEnd: `calc(-1 * (${densityPad.md} - ${vars.space4}))`,
  },
  actionsInsetCompact: {
    marginInlineEnd: `calc(-1 * (${densityPad.sm} - ${vars.space4}))`,
  },
  leadingActionsInsetRegular: {
    marginInlineStart: `calc(-1 * (${densityPad.md} - ${vars.space4}))`,
  },
  leadingActionsInsetCompact: {
    marginInlineStart: `calc(-1 * (${densityPad.sm} - ${vars.space4}))`,
  },
  actionsInsetLg: {
    marginInlineEnd: `calc(-1 * (${vars.space16} - ${vars.space4}))`,
  },
  leadingActionsInsetLg: {
    marginInlineStart: `calc(-1 * (${vars.space16} - ${vars.space4}))`,
  },
  action: {
    borderRadius: vars.radiusMark,
    gap: vars.space2, // label + chevron read as one word
    fontFamily: vars.fontSans,
    fontSize: "inherit",
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightControl,
    maxInlineSize: "100%",
    minInlineSize: 0,
    textOverflow: "ellipsis",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  /*
   * Heights are `group content box - 6px`: 34 → 28, 30 → 24, 26 → 20, a
   * uniform 3px block clearance at every size. They are anchored at
   * `controlHeightXs` and step DOWN by the same 4px the group steps by, which
   * is why only `regular` lands on the 28/32/36/40 control scale — this action
   * is chrome inside a field, so it is measured against the group's content
   * box rather than against the scale. Aligning it to the scale instead (a
   * 32px action in a 36px group) is what produced the 1.00px block / 4px
   * inline asymmetry described on `styles.actionsInsetRegular`.
   *
   * `tests/visual/control-metrics.spec.ts` asserts both these literals and the
   * 3px clearance they derive from. The coarse-pointer override keeps the 44px
   * touch target and lets the group grow to meet it.
   */
  actionRegular: {
    blockSize: {
      default: vars.controlHeightXs,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    // `densityPad.md - space1`, so the label sits on the group's padding line.
    paddingInline: vars.space8,
  },
  actionCompact: {
    blockSize: {
      default: `calc(${vars.controlHeightXs} - ${vars.space4})`,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    paddingInline: vars.space4,
  },
  actionDense: {
    blockSize: {
      default: `calc(${vars.controlHeightXs} - ${vars.space8})`,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    paddingInline: vars.space4,
  },
  // Same `group content box - 6px` rule at the top of the ramp: 32 inside a
  // 40px group (38px content box). Its `space3` gutter is `space4 - space1`,
  // so the label lands on the `lg` group's padding line exactly as
  // `actionRegular`'s does on the regular one.
  actionLg: {
    blockSize: {
      default: vars.controlHeightSm,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    paddingInline: vars.space12,
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
  },
  error: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
  },
  success: {
    borderColor: vars.colorSuccessBorder,
  },
  danger: {
    borderColor: vars.colorDangerBorder,
  },
});

// Keyed by the canonical `size` vocabulary — the group's one scale axis, so
// every style map below is addressed by the same value.
export const sizeStyles = {
  lg: styles.lg,
  md: styles.regular,
  sm: styles.compact,
  xs: styles.dense,
} as const;

export const actionSizeStyles = {
  lg: styles.actionLg,
  md: styles.actionRegular,
  sm: styles.actionCompact,
  xs: styles.actionDense,
} as const;

// `xs` shares `sm`'s inline gutter (see `styles.dense`), so it shares the
// pull-back that cancels it.
export const actionsInsetStyles = {
  lg: styles.actionsInsetLg,
  md: styles.actionsInsetRegular,
  sm: styles.actionsInsetCompact,
  xs: styles.actionsInsetCompact,
} as const;

export const leadingActionsInsetStyles = {
  lg: styles.leadingActionsInsetLg,
  md: styles.leadingActionsInsetRegular,
  sm: styles.leadingActionsInsetCompact,
  xs: styles.leadingActionsInsetCompact,
} as const;

export const toneStyles = {
  danger: styles.danger,
  default: null,
  success: styles.success,
} as const;
