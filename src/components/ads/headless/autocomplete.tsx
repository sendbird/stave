import { Autocomplete as BaseAutocomplete } from "@base-ui/react/autocomplete";
import type { AutocompleteRootProps as BaseAutocompleteRootProps } from "@base-ui/react/autocomplete";

export const AutocompleteRoot = BaseAutocomplete.Root;
export const AutocompleteValue = BaseAutocomplete.Value;
export const AutocompleteTrigger = BaseAutocomplete.Trigger;
export const AutocompleteInput = BaseAutocomplete.Input;
export const AutocompleteInputGroup = BaseAutocomplete.InputGroup;
export const AutocompleteIcon = BaseAutocomplete.Icon;
export const AutocompleteClear = BaseAutocomplete.Clear;
export const AutocompleteList = BaseAutocomplete.List;
export const AutocompletePortal = BaseAutocomplete.Portal;
export const AutocompletePositioner = BaseAutocomplete.Positioner;
export const AutocompletePopup = BaseAutocomplete.Popup;
export const AutocompleteGroup = BaseAutocomplete.Group;
export const AutocompleteGroupLabel = BaseAutocomplete.GroupLabel;
/**
 * Renders grouped items (an array-of-groups `items` shape) without any of
 * Autocomplete's own DOM — use inside `Autocomplete.Group` /
 * `Autocomplete.GroupLabel` when the list needs to walk a nested item shape
 * imperatively instead of the default flat render-prop.
 */
export const AutocompleteCollection = BaseAutocomplete.Collection;
export const AutocompleteItem = BaseAutocomplete.Item;
export const AutocompleteEmpty = BaseAutocomplete.Empty;

export type AutocompleteRootProps<ItemValue> =
  BaseAutocompleteRootProps<ItemValue>;
