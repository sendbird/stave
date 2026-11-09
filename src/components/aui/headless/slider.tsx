import { Slider as BaseSlider } from "@base-ui/react/slider";
import type * as React from "react";

export const SliderRoot = BaseSlider.Root;
export const SliderLabel = BaseSlider.Label;
export const SliderValue = BaseSlider.Value;
export const SliderControl = BaseSlider.Control;
export const SliderTrack = BaseSlider.Track;
export const SliderIndicator = BaseSlider.Indicator;
export const SliderThumb = BaseSlider.Thumb;

export type SliderRootProps = React.ComponentProps<typeof SliderRoot>;
