/**
 * Combobox's scale axis, declared once for every part that takes it.
 *
 * It lives in its own module rather than in `Combobox.parts.tsx` because that
 * file sits against the 500-line limit `scripts/check-source-structure.mjs`
 * enforces, and because the axis is shared by `Combobox.parts`,
 * `Combobox.array`, and `PersonPicker` — one declaration is what keeps the
 * three from drifting.
 */

import type { ControlScale } from "../recipes/control-metrics";

/** Control height: xs 28px / sm 32px / md 36px (default). */
export type ComboboxSize = Exclude<ControlScale, "lg">;

/**
 * `size` is the control's only scale axis, on the same `ControlScale`
 * vocabulary as every other field-shaped AUI control. Five parts would
 * otherwise declare it inline, and a divergence between any two of them is
 * exactly the fork this shared declaration exists to close.
 */
export type ComboboxScaleProps = {
  size?: ComboboxSize;
};
