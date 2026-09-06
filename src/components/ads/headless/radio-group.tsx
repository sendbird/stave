import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type * as React from "react";

export const RadioGroupRoot = BaseRadioGroup;
export const RadioRoot = Radio.Root;
export const RadioIndicator = Radio.Indicator;

export type RadioGroupRootProps = React.ComponentProps<typeof RadioGroupRoot>;
export type RadioRootProps = React.ComponentProps<typeof RadioRoot>;

