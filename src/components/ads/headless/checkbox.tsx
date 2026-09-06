import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type * as React from "react";

export const CheckboxRoot = BaseCheckbox.Root;
export const CheckboxIndicator = BaseCheckbox.Indicator;

export type CheckboxRootProps = React.ComponentProps<typeof CheckboxRoot>;
export type CheckboxIndicatorProps = React.ComponentProps<
  typeof CheckboxIndicator
>;
