import { i18n } from "@/i18n";
import type * as React from "react";

import type { ComboboxRootProps } from "../headless/combobox";
import type { PopupPlacement } from "../utils/placement";
import type { CreatableOption, CreatablePickerProps } from "./Combobox.create";
import type { ComboboxPagingProps } from "./Combobox.loadMore";
import type { ComboboxPagingInput } from "./Combobox.paging";
import { type ComboboxOption, optionText } from "./Combobox.options";
import type { ComboboxSize } from "./Combobox.scale";

/**
 * The public prop contract of the array (convenience) `Combobox`, plus the
 * item adapters Base UI reads it through. Split out of `Combobox.array.tsx`
 * so the rendering half stays inside the repo's 500-line source cap; the
 * import is one-way (`Combobox.array` → here).
 */

/**
 * The async/paged half of this API is ONE object, `paging` (`hasMore`,
 * `onLoadMore`, `loadingMore`, …), declared once in `Combobox.paging`, so the
 * array pickers cannot drift on one contract.
 */
export type ComboboxProps = Omit<
  ComboboxRootProps<ComboboxOption>,
  | "children"
  | "defaultValue"
  | "items"
  | "isItemEqualToValue"
  | "itemToStringLabel"
  | "itemToStringValue"
  | "multiple"
  | "onValueChange"
  | "value"
> & {
  /**
   * Accessible name for the query input when the visible label is rendered
   * elsewhere (or not at all). Prefer `label`, or an external `<label
   * htmlFor={inputId}>`.
   */
  "aria-label"?: string;
  /**
   * Show a clear mark once something is selected, resetting the field to its
   * placeholder. Off by default, matching `Select`: whether a field is optional
   * is the caller's claim to make, and a required one must not offer a way back
   * to "nothing".
   *
   * The mark hides while the control is `readOnly`, `disabled`, or `loading` —
   * in the first two the value is information rather than a choice, and in the
   * third the slot belongs to the in-flight mark.
   * @default false
   */
  clearable?: boolean;
  defaultValue?: ComboboxOption | null;
  /** Initial selection for uncontrolled `multiple` mode. */
  defaultValues?: ComboboxOption[];
  emptyText?: string;
  error?: React.ReactNode;
  /**
   * `id` for the query input, so a label rendered OUTSIDE this component can
   * claim it with `htmlFor`.
   *
   * `label` covers the ordinary case and needs none of this. An external label
   * row is what a label with a sibling control needs — a field whose name
   * carries an info tooltip beside it — because that trigger cannot live inside
   * the `<label>`: a click on it would be forwarded to the input instead of
   * opening the tooltip. Given this, the row keeps a real `<label htmlFor>`
   * rather than falling back to `aria-label`, which names the control but
   * leaves its visible label pointing at nothing.
   */
  inputId?: string;
  label?: string;
  /**
   * Leading addon inside the field — a scope `Select`, an HTTP-method picker.
   * Also accepted on the compound `Combobox.InputGroup`, which is where it is
   * documented in full. Render the addon's trigger as an `InputGroupAction`
   * and it picks up this field's `size`.
   */
  leadingActions?: React.ReactNode;
  loading?: boolean;
  /**
   * Copy shown while `loading`. Same escape hatch as `Command`'s
   * `loadingLabel` — the string was hard-coded and therefore untranslatable.
   * @default "Loading options…"
   */
  loadingLabel?: React.ReactNode;
  /**
   * Enable multi-select: selected options render as removable token chips
   * inside the input area (Backspace in the empty input removes the last
   * chip). Use `values`/`defaultValues`/`onValuesChange` in this mode.
   */
  multiple?: boolean;
  onValueChange?: (value: ComboboxOption | null) => void;
  /** Selection-change callback for `multiple` mode. */
  onValuesChange?: (values: ComboboxOption[]) => void;
  options: ComboboxOption[];
  placeholder?: string;
  /** Render a leading magnifier glyph in the input. @default false */
  searchIcon?: boolean;
  /** Control height: xs 28px / sm 32px / md 36px (default). */
  size?: ComboboxSize;
  value?: ComboboxOption | null;
  /** Where the list opens against the field. @default "bottom-start" */
  placement?: PopupPlacement;
  /** Controlled selection for `multiple` mode. */
  values?: ComboboxOption[];
  /**
   * Positioner z-index override — the same escape hatch `Select` carries. Use
   * it when the host paints chrome above the AUI dropdown band, so the list
   * would otherwise open behind a dim or a full-screen route overlay.
   */
  zIndex?: number;
} & ComboboxPagingInput &
  CreatablePickerProps;

/**
 * The flat contract the single and multiple modes render from, after
 * `ComboboxArray` unfolds `paging` and maps `aria-label` / `loadingLabel` onto
 * the query input and the loading row.
 */
export type ComboboxResolvedProps = Omit<
  ComboboxProps,
  "aria-label" | "loadingLabel" | "paging"
> &
  ComboboxPagingProps & {
    inputAriaLabel?: string;
    loadingText?: React.ReactNode;
  };

/**
 * The in-field `Loading` mark needs a string name; `loadingLabel` is a
 * ReactNode escape hatch, so a non-string falls back to the default label.
 */
export const loadingLabelFor = (text: React.ReactNode) =>
  typeof text === "string" ? text : i18n.t("ui:combobox.loadingOptions");

export const isOptionEqualToValue = (
  itemValue: CreatableOption<ComboboxOption>,
  value: CreatableOption<ComboboxOption>,
) => itemValue.value === value.value;
// Base UI wants words here: this is the typeahead key and the string the field
// shows once a row is chosen. A node label supplies them through `text`.
export const optionToStringLabel = (item: CreatableOption<ComboboxOption>) =>
  optionText(item);
export const optionToStringValue = (item: CreatableOption<ComboboxOption>) =>
  item.value;
