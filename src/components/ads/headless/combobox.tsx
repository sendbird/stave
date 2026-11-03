import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import type { ComboboxRootProps as BaseComboboxRootProps } from "@base-ui/react/combobox";

export const ComboboxRoot = BaseCombobox.Root;
export const ComboboxLabel = BaseCombobox.Label;
export const ComboboxValue = BaseCombobox.Value;
export const ComboboxInputGroup = BaseCombobox.InputGroup;
export const ComboboxInput = BaseCombobox.Input;
export const ComboboxTrigger = BaseCombobox.Trigger;
export const ComboboxClear = BaseCombobox.Clear;
export const ComboboxIcon = BaseCombobox.Icon;
export const ComboboxPortal = BaseCombobox.Portal;
export const ComboboxPositioner = BaseCombobox.Positioner;
export const ComboboxPopup = BaseCombobox.Popup;
export const ComboboxArrow = BaseCombobox.Arrow;
export const ComboboxList = BaseCombobox.List;
export const ComboboxItem = BaseCombobox.Item;
export const ComboboxItemIndicator = BaseCombobox.ItemIndicator;
export const ComboboxEmpty = BaseCombobox.Empty;
export const ComboboxGroup = BaseCombobox.Group;
export const ComboboxGroupLabel = BaseCombobox.GroupLabel;
export const ComboboxSeparator = BaseCombobox.Separator;

export type ComboboxRootProps<
  Value,
  Multiple extends boolean | undefined = false,
> = BaseComboboxRootProps<Value, Multiple>;
