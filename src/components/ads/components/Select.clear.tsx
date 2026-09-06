import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import type * as React from "react";

import { controlIconSizes } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { surfaceChrome } from "../recipes/surface-chrome";
import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";
import type { SelectSize } from "./Select.parts";

/**
 * `Select`'s clear mark.
 *
 * ## Why it is a sibling of the trigger, not a child of it
 *
 * `Combobox` can put its `Clear` inside the field because the field there is a
 * `<div>` — the bordered `InputGroup` — and the clear sits beside the input as
 * one more child of it. `Select`'s field IS a `<button>` (Base UI renders the
 * trigger as a native button, which is what gives it the platform's own click,
 * Enter/Space and focus behaviour), and a `<button>` inside a `<button>` is
 * invalid HTML: the parser closes the outer button before the inner one, so the
 * chevron and half the trigger end up OUTSIDE the control, and the nested
 * button is not reachable by keyboard at all.
 *
 * So the mark is a sibling, absolutely positioned over the trigger's trailing
 * gutter just inside the chevron — the same visual order `Combobox` composes in
 * flow (value · clear · chevron) reached the only way a button-shaped trigger
 * allows. The trigger's own hit area is unchanged; the mark simply covers a
 * strip of it, and `Value` gets a matching trailing gutter so a long label
 * ellipses before it rather than under it.
 *
 * The mark is not a `Select.<Part>`: promoting it would mean exporting this
 * positioning wrapper as a second trigger-row primitive, and a compound caller
 * composing their own row already owns that layout. It is the array API's
 * affordance, which is where the missing capability was.
 */

export type SelectClearFieldProps = {
  /** The `Select.Trigger` this wrapper positions the clear mark against. */
  children: React.ReactNode;
  /** Accessible name for the mark. */
  clearLabel: string;
  onClear: (event: React.MouseEvent<HTMLButtonElement>) => void;
  size: SelectSize;
};

export function SelectClearField({
  children,
  clearLabel,
  onClear,
  size,
}: SelectClearFieldProps) {
  return (
    <span className={sx(styles.wrap)}>
      {children}
      <button
        aria-label={clearLabel}
        className={sx(
          surfaceChrome.quietIconButton,
          styles.clear,
          clearStylesBySize[size],
          insetStylesBySize[size],
          focusRing.ring,
        )}
        onClick={(event) => {
          /*
           * Belt and braces. Nothing bubbles from here into the trigger today —
           * the mark is the trigger's SIBLING, not its child — but this wrapper
           * lives inside the field, and a field-level open handler is exactly
           * the kind of thing that gets added later. A clear that also opens
           * the list is the failure mode, so stop the event where it starts.
           */
          event.stopPropagation();
          onClear(event);
        }}
        // Base UI opens the list on pointer-down, so the pointer event is the
        // one that would reach a field-level handler first.
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        <X aria-hidden size={controlIconSizes.sm} />
      </button>
    </span>
  );
}

const styles = stylex.create({
  // A grid of one cell so the trigger keeps filling the field, plus the
  // containing block the mark is positioned against.
  wrap: {
    display: "grid",
    minInlineSize: 0,
    position: "relative",
  },
  clear: {
    insetBlockStart: "50%",
    position: "absolute",
    transform: "translateY(-50%)",
  },
  /*
   * In-trigger chrome stays SHORTER than the trigger, on the same ramp
   * `Combobox`'s in-group `iconButton` uses: 28 in a 36px trigger, 24 in 32,
   * 20 in 28, 32 in 40. Anything taller wedges against the trigger's border the
   * moment the quiet background paints on hover.
   */
  clearDense: {
    inlineSize: `calc(${vars.controlHeightXs} - ${vars.space8})`,
    minBlockSize: `calc(${vars.controlHeightXs} - ${vars.space8})`,
  },
  clearCompact: {
    inlineSize: `calc(${vars.controlHeightXs} - ${vars.space4})`,
    minBlockSize: `calc(${vars.controlHeightXs} - ${vars.space4})`,
  },
  clearRegular: {
    inlineSize: vars.controlHeightXs,
    minBlockSize: vars.controlHeightXs,
  },
  clearLg: {
    inlineSize: vars.controlHeightSm,
    minBlockSize: vars.controlHeightSm,
  },
  /*
   * Parked just inside the chevron: the trigger's own inline gutter, plus the
   * 16px chevron, plus a `space1` breath. The gutter differs per size because
   * the trigger's does (`recipes/select-styles.ts` → `triggerStylesBySize`), so
   * these arms are keyed the same way rather than sharing one inset.
   */
  insetDense: {
    insetInlineEnd: `calc(${densityPad.sm} + ${vars.controlIconSizeMd} + ${vars.space4})`,
  },
  insetCompact: {
    insetInlineEnd: `calc(${densityPad.sm} + ${vars.controlIconSizeMd} + ${vars.space4})`,
  },
  insetRegular: {
    insetInlineEnd: `calc(${densityPad.md} + ${vars.controlIconSizeMd} + ${vars.space4})`,
  },
  insetLg: {
    insetInlineEnd: `calc(${vars.space16} + ${vars.controlIconSizeMd} + ${vars.space4})`,
  },
  /*
   * The trailing gutter `Value` takes while the mark is showing. It equals the
   * mark's own width: the value box already ends 24px (chevron + gap) before
   * the trigger's gutter, and the mark starts 20px before it, so reserving one
   * mark-width is what puts the ellipsis clear of the glyph at every size.
   * Applied only while the mark renders, so a `clearable` Select with nothing
   * selected still lays its placeholder out exactly like every other Select.
   */
  valueDense: {
    paddingInlineEnd: `calc(${vars.controlHeightXs} - ${vars.space8})`,
  },
  valueCompact: {
    paddingInlineEnd: `calc(${vars.controlHeightXs} - ${vars.space4})`,
  },
  valueRegular: {
    paddingInlineEnd: vars.controlHeightXs,
  },
  valueLg: {
    paddingInlineEnd: vars.controlHeightSm,
  },
});

const clearStylesBySize = {
  lg: styles.clearLg,
  md: styles.clearRegular,
  sm: styles.clearCompact,
  xs: styles.clearDense,
} as const;

const insetStylesBySize = {
  lg: styles.insetLg,
  md: styles.insetRegular,
  sm: styles.insetCompact,
  xs: styles.insetDense,
} as const;

/** Trailing gutter for `Select.Value` while the clear mark is showing. */
export const clearValueStylesBySize = {
  lg: styles.valueLg,
  md: styles.valueRegular,
  sm: styles.valueCompact,
  xs: styles.valueDense,
} as const;
