import { Search } from "lucide-react";
import { createContext, useContext, useMemo } from "react";
import type * as React from "react";

import { ComboboxInput, ComboboxInputGroup } from "../headless/combobox";
import { controlChrome } from "../recipes/control-chrome";
import {
  controlHeightBySize,
  controlIconSizes,
} from "../recipes/control-metrics";
import { fieldShell } from "../recipes/field-shell";
import { focusRing } from "../recipes/focus-ring";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { ComboboxInChipsContext } from "./Combobox.chips";
import { type ComboboxScaleProps } from "./Combobox.scale";
import { inputStylesBySize, styles } from "./Combobox.styles";
import { InputGroupContext } from "./InputGroup";
import { mergeClassName } from "./merge-class-name";

/**
 * Combobox's field row — the `InputGroup` shell and the `Input` inside it —
 * split into its own module when the `xstyle` host-composition contract pushed
 * `Combobox.parts.tsx` past the repo's 500-line limit. The two search-glyph
 * contexts live here because both ends of them are in this file.
 */

export type ComboboxInputGroupProps = React.ComponentProps<
  typeof ComboboxInputGroup
> &
  ComboboxScaleProps & {
    /**
     * Render a leading magnifier glyph, marking the field as a search entry
     * point. Use it wherever the input is the top row of an anchored popup —
     * the anatomy `Command`, `EmojiPicker`, `CannedResponsePicker`,
     * `Autocomplete`, and `SearchField` already ship. Off by default: a
     * labelled form-field Combobox is a selector, not a search box, and every
     * existing call site must stay byte-identical.
     */
    /** Tints the field border with the invalid tone. Composed here rather than
     * by a caller's `className`: the package's own classes win on source order. */
    invalid?: boolean;
    /**
     * The leading counterpart of `Combobox.Actions`, for an addon too wide for
     * the `searchIcon` glyph track — a scope `Select`, an HTTP-method picker.
     * `InputGroup` carries the same prop under the same name; the difference is
     * that this group is a grid, so the leading track only exists when
     * something is passed here. Render the addon's trigger as an
     * `InputGroupAction` and it picks up this group's `size`.
     */
    leadingActions?: React.ReactNode;
    searchIcon?: boolean;
  } & XstyleProp;

/**
 * Whether the enclosing `InputGroup` opens a leading track — a search glyph, a
 * `leadingActions` addon, or both. Read by `Input` to drop its own start
 * padding, which would otherwise double the leading gutter.
 */
const ComboboxLeadingTrackContext = createContext(false);

/** True below `Popup`, where a search row needs the list's own inset. */
export const ComboboxInPopupContext = createContext(false);

export function InputGroup({
  children,
  className,
  invalid = false,
  leadingActions,
  searchIcon = false,
  size = "md",
  xstyle,
  ...props
}: ComboboxInputGroupProps) {
  const inPopup = useContext(ComboboxInPopupContext);
  const theme = themeProps("combobox-field", { size });
  const hasLeadingActions = Boolean(leadingActions);
  /*
   * `InputGroupAction` reads its box off this. The Combobox group has no
   * disabled state to hand down at render time — Base UI resolves that per
   * render state on the shell — so an addon that can be disabled takes its own
   * `disabled`, exactly as it would inside a plain `InputGroup`. Without the
   * provider the action fell back to `md` and was sized wrong in every
   * Combobox.
   */
  const inputGroupScale = useMemo(() => ({ disabled: false, size }), [size]);

  return (
    <ComboboxInputGroup
      {...props}
      {...theme}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              controlChrome.field,
              fieldShell.base,
              styles.inputGroup,
              focusRing.borderOnly,
              controlHeightBySize[size],
              inPopup && styles.inputGroupInPopup,
              searchIcon && styles.inputGroupWithSearchIcon,
              hasLeadingActions && styles.inputGroupWithLeadingActions,
              hasLeadingActions &&
                searchIcon &&
                styles.inputGroupWithLeadingActionsAndSearchIcon,
              invalid && fieldShell.danger,
              // The bordered field surface is still showing information while
              // disabled, so it tints/mutes like a disabled `TextField` instead
              // of fading — same `controlChrome.disabledField` `Select` now
              // applies. The final disabled border removes the hover ladder.
              state.disabled && controlChrome.disabledField,
              // Read-only is not disabled: the value stays authoritative and
              // focusable, it just is not yours to change. Same chrome
              // `TextField`, `Select`, and `Autocomplete` compose; after
              // `disabledField` so a control that is both reads as disabled.
              state.readOnly && !state.disabled && controlChrome.readOnlyField,
              state.readOnly && !state.disabled && fieldShell.readOnly,
              xstyle,
            ),
            theme.className,
          ) ?? "",
        className,
      )}
    >
      <InputGroupContext.Provider value={inputGroupScale}>
        <ComboboxLeadingTrackContext.Provider
          value={searchIcon || hasLeadingActions}
        >
          {leadingActions ? (
            <span
              {...themeSlotProps("combobox-field", "actions")}
              className={sx(styles.leadingActions)}
            >
              {leadingActions}
            </span>
          ) : null}
          {searchIcon ? (
            <span
              aria-hidden
              {...themeSlotProps("combobox-field", "search-icon")}
              className={sx(styles.searchIcon)}
            >
              <Search size={controlIconSizes.md} />
            </span>
          ) : null}
          {children}
        </ComboboxLeadingTrackContext.Provider>
      </InputGroupContext.Provider>
    </ComboboxInputGroup>
  );
}

// `size` is omitted from the native input props before the scale axis is
// intersected in: an `<input>` carries an HTML `size?: number` attribute, and
// intersecting that with the scale union collapses the prop to `never`.
// `TextField` and `NativeSelect` already omit it for the same reason.
export type ComboboxInputProps = Omit<
  React.ComponentProps<typeof ComboboxInput>,
  "size"
> &
  ComboboxScaleProps &
  XstyleProp;

export function Input({
  className,
  size = "md",
  xstyle,
  ...props
}: ComboboxInputProps) {
  const inChips = useContext(ComboboxInChipsContext);
  const withLeadingTrack = useContext(ComboboxLeadingTrackContext);
  return (
    <ComboboxInput
      {...props}
      {...themeSlotProps("combobox-field", "input")}
      className={mergeClassName(
        () =>
          sx(
            styles.input,
            inputStylesBySize[size],
            withLeadingTrack && styles.inputWithSearchIcon,
            inChips && styles.inputInChips,
            xstyle,
          ),
        className,
      )}
    />
  );
}
