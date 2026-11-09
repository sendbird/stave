import { Progress as BaseProgress } from "@base-ui/react/progress";
import type * as React from "react";

export const ProgressRoot = BaseProgress.Root;
export const ProgressLabel = BaseProgress.Label;
export const ProgressTrack = BaseProgress.Track;
export const ProgressIndicator = BaseProgress.Indicator;
export const ProgressValue = BaseProgress.Value;

export type ProgressRootProps = React.ComponentProps<typeof ProgressRoot>;
