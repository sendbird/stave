import { ChevronDown } from "lucide-react";
import type * as React from "react";

import { ComboboxTrigger } from "../headless/combobox";
import { controlChrome } from "../recipes/control-chrome";
import type { ControlScale } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import {
  styles as selectStyles,
  triggerHeightsBySize,
  triggerStylesBySize,
} from "../recipes/select-styles";
import { transition } from "../recipes/transition";
import { themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { mergeClassName } from "./merge-class-name";

export type ComboboxFieldTriggerProps = React.ComponentProps<
  typeof ComboboxTrigger
> & {
  /** Tints the border with the invalid tone, as `Select.Trigger invalid` does. */
  invalid?: boolean;
  /**
   * Control height on the shared scale — including `lg` (40px): a field-shaped
   * picker sits in a form row beside `lg` TextFields and Selects.
   * @default "md"
   */
  size?: ControlScale;
} & XstyleProp;

/**
 * A Combobox opened from a closed FIELD — the value, then a chevron, in the
 * box `Select.Trigger` draws — for a long list whose search lives inside the
 * popup (`Combobox.InputGroup` in `Combobox.Popup`) rather than in the box.
 *
 * `Combobox.Trigger` is the in-field affordance (`shape="icon"`) or a blank
 * slot the caller paints (`shape="content"`), so a picker that reads as a form
 * field had to paint the field itself and drifted from `Select` in padding and
 * chevron. This composes Select's own trigger recipes in Select's order, so the
 * two are the same box by construction.
 *
 * The children are the value — the caller's, so it can say "3 selected" or a
 * placeholder in its own words; the chevron is the part's.
 */
export function FieldTrigger({
  children,
  className,
  invalid = false,
  size = "md",
  xstyle,
  ...props
}: ComboboxFieldTriggerProps) {
  return (
    <ComboboxTrigger
      {...props}
      {...themeSlotProps("combobox-field", "trigger")}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              selectStyles.trigger,
              triggerStylesBySize[size],
              controlChrome.trigger,
              controlChrome.field,
              controlChrome.fieldTriggerBorder,
              transition.colors,
              focusRing.borderOnly,
              triggerHeightsBySize[size],
              state.open && selectStyles.triggerOpen,
              invalid && selectStyles.triggerError,
              state.disabled && controlChrome.disabledField,
              xstyle,
            ),
          ) ?? "",
        className,
      )}
    >
      <span className={sx(selectStyles.value)}>{children}</span>
      <span aria-hidden className={sx(selectStyles.icon)}>
        <ChevronDown size={16} />
      </span>
    </ComboboxTrigger>
  );
}
