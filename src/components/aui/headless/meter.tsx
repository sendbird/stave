import { Meter as BaseMeter } from "@base-ui/react/meter";
import type * as React from "react";

export const MeterRoot = BaseMeter.Root;
export const MeterLabel = BaseMeter.Label;
export const MeterValue = BaseMeter.Value;
export const MeterTrack = BaseMeter.Track;
export const MeterIndicator = BaseMeter.Indicator;

export type MeterRootProps = React.ComponentProps<typeof MeterRoot>;
