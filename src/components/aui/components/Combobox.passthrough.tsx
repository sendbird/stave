import type * as React from "react";

import { PortalProductThemeScope } from "../theming/ProductThemeProvider";
import { themeSlotProps } from "../theming/theme-props";
import {
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxPortal,
  ComboboxSeparator,
  ComboboxValue,
} from "../headless/combobox";

/**
 * The compound parts that add no styling of their own — they exist only so
 * `Combobox.Group` / `.Portal` / `.Value` and friends complete the namespace
 * alongside the parts that do carry chrome. Kept out of `Combobox.parts.tsx`
 * so that file stays about the styled surface.
 */

export type ComboboxValueProps = React.ComponentProps<typeof ComboboxValue>;

export function Value(props: ComboboxValueProps) {
  return <ComboboxValue {...props} />;
}

export type ComboboxPortalProps = React.ComponentProps<typeof ComboboxPortal>;

export function Portal({ children, ...props }: ComboboxPortalProps) {
  return (
    <ComboboxPortal {...props}>
      <PortalProductThemeScope>{children}</PortalProductThemeScope>
    </ComboboxPortal>
  );
}

export type ComboboxGroupProps = React.ComponentProps<typeof ComboboxGroup>;

export function Group(props: ComboboxGroupProps) {
  return <ComboboxGroup {...props} />;
}

export type ComboboxGroupLabelProps = React.ComponentProps<
  typeof ComboboxGroupLabel
>;

/*
 * The one passthrough that carries a theme slot. It adds no class of its own —
 * the section heading's paint arrives from `listbox.groupLabel` at the call
 * site — but it is the element a brand has to reach to restyle a section
 * heading, and the slot attribute is the only stable way to name it.
 */
export function GroupLabel(props: ComboboxGroupLabelProps) {
  return (
    <ComboboxGroupLabel
      {...props}
      {...themeSlotProps("combobox-popup", "group-label")}
    />
  );
}

export type ComboboxSeparatorProps = React.ComponentProps<
  typeof ComboboxSeparator
>;

export function Separator(props: ComboboxSeparatorProps) {
  return <ComboboxSeparator {...props} />;
}
