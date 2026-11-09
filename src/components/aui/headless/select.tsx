import { Select as BaseSelect } from "@base-ui/react/select";
import type * as React from "react";

export const SelectRoot = BaseSelect.Root;
export const SelectLabel = BaseSelect.Label;
export const SelectTrigger = BaseSelect.Trigger;
export const SelectValue = BaseSelect.Value;
export const SelectIcon = BaseSelect.Icon;
export const SelectPortal = BaseSelect.Portal;
export const SelectPositioner = BaseSelect.Positioner;
export const SelectPopup = BaseSelect.Popup;
export const SelectList = BaseSelect.List;
export const SelectItem = BaseSelect.Item;
export const SelectItemText = BaseSelect.ItemText;
export const SelectItemIndicator = BaseSelect.ItemIndicator;
export const SelectScrollUpArrow = BaseSelect.ScrollUpArrow;
export const SelectScrollDownArrow = BaseSelect.ScrollDownArrow;

export type SelectRootProps = React.ComponentProps<typeof SelectRoot>;
export type SelectItemProps = React.ComponentProps<typeof SelectItem>;
