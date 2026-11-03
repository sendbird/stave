/**
 * Combobox multi-select chip parts (`Chips`, `Chip`, `ChipRemove`) and the
 * context that tells `Input` it is rendering inside a chip container.
 *
 * Split out of `Combobox.tsx` for the same reason `Combobox.styles.ts` was: the
 * chip trio is a self-contained sub-API used only by `multiple` comboboxes, and
 * keeping it inline pushed the component module past the source-structure size
 * ceiling. The parts are re-attached to the `Combobox` namespace there, so the
 * public API is unchanged.
 */

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { X } from "lucide-react";
import { createContext } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { surfaceChrome } from "../recipes/surface-chrome";
import { touchTarget } from "../recipes/touch-target";
import { valueToken, valueTokenRemoveIconSizes } from "../recipes/value-token";
import { themeSlotProps } from "../theming/theme-props";
import { sx, type XstyleProp } from "../utils/stylex";
import { styles } from "./Combobox.styles";
import { withTruncatingLabels } from "./truncating-label";
import { mergeClassName } from "./merge-class-name";

// Base UI chip parts are not re-exported by `headless/combobox`. Imported
// directly so the styled compound layer can wrap them without editing the
// headless module (same convention as Menu's submenu/checkbox parts).
const ComboboxChipsPart = BaseCombobox.Chips;
const ComboboxChipPart = BaseCombobox.Chip;
const ComboboxChipRemovePart = BaseCombobox.ChipRemove;

/** Whether the input renders inside a `Chips` container (multi-select). */
export const ComboboxInChipsContext = createContext(false);

export type ComboboxChipsProps = React.ComponentProps<
  typeof ComboboxChipsPart
> &
  XstyleProp;

/**
 * Container for the selection chips in a `multiple` combobox. Must wrap the
 * `Input` so Base UI's chip keyboard navigation (Arrow keys between chips,
 * Backspace in an empty input removes the last chip) is wired up.
 */
export function Chips({ className, xstyle, ...props }: ComboboxChipsProps) {
  return (
    <ComboboxInChipsContext.Provider value={true}>
      <ComboboxChipsPart
        {...props}
        {...themeSlotProps("combobox-field", "chips")}
        className={mergeClassName(
          () => sx(valueToken.track, styles.chips, xstyle),
          className,
        )}
      />
    </ComboboxInChipsContext.Provider>
  );
}

export type ComboboxChipProps = React.ComponentProps<typeof ComboboxChipPart> &
  XstyleProp;

/**
 * One removable selection token. Its box — tint fill, hairline rim, 24px
 * height, caption/medium type — is `recipes/value-token`, shared with
 * `TagField`, because a chip here and a tag there are the same object.
 */
export function Chip({
  children,
  className,
  xstyle,
  ...props
}: ComboboxChipProps) {
  return (
    <ComboboxChipPart
      {...props}
      {...themeSlotProps("combobox-field", "chip")}
      className={mergeClassName(
        () => sx(valueToken.root, valueToken.md, focusRing.ring, xstyle),
        className,
      )}
    >
      {/* A long option label used to push the chip past the field it was
          selected in — the flex-item truncation failure `Badge` was fixed for
          and this one never was. */}
      {withTruncatingLabels(children, valueToken.label)}
    </ComboboxChipPart>
  );
}

export type ComboboxChipRemoveProps = React.ComponentProps<
  typeof ComboboxChipRemovePart
> &
  XstyleProp;

/** The chip's remove button; defaults to an `X` icon. */
export function ChipRemove({
  children,
  className,
  xstyle,
  ...props
}: ComboboxChipRemoveProps) {
  return (
    <ComboboxChipRemovePart
      {...props}
      {...themeSlotProps("combobox-field", "chip-remove")}
      className={mergeClassName(
        () =>
          sx(
            // `quietIconButton` still supplies the muted → full ink ramp; the
            // painted box and its overlay states come from the shared recipe.
            surfaceChrome.quietIconButton,
            valueToken.remove,
            touchTarget.coarse,
            focusRing.ring,
            xstyle,
          ),
        className,
      )}
    >
      {children ?? <X aria-hidden size={valueTokenRemoveIconSizes.md} />}
    </ComboboxChipRemovePart>
  );
}
