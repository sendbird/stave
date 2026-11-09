import { PreviewCard as BasePreviewCard } from "@base-ui/react/preview-card";
import type * as React from "react";

export const PreviewCardRoot = BasePreviewCard.Root;
export const PreviewCardTrigger = BasePreviewCard.Trigger;
export const PreviewCardPortal = BasePreviewCard.Portal;
export const PreviewCardPositioner = BasePreviewCard.Positioner;
export const PreviewCardPopup = BasePreviewCard.Popup;
export const PreviewCardArrow = BasePreviewCard.Arrow;

export type PreviewCardRootProps = React.ComponentProps<typeof PreviewCardRoot>;
