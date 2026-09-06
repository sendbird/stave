import type { StyleXValue } from "../ads/utils/stylex";
import type { ComponentProps } from "react";
import {
  emptyStateStyles,
  EmptyStateHeader,
  EmptyStateDescription,
  EmptyStateContent,
} from "../ads/components/EmptyState";
import { sx, cx } from "../ads/utils/stylex";
export function EmptyHeader(
  props: ComponentProps<"div"> & { xstyle?: StyleXValue },
) {
  // The pre-adapter component emitted this slot hook; keep it so the header
  // stays addressable from tests and integration CSS.
  return <EmptyStateHeader data-slot="empty-header" {...props} />;
}
export function EmptyDescription(props: ComponentProps<"p"> & { xstyle?: StyleXValue }) {
  return <EmptyStateDescription data-slot="empty-description" {...props} />;
}
export const EmptyContent = EmptyStateContent;
export function Empty({ className, xstyle, ...props }: ComponentProps<"div"> & { xstyle?: StyleXValue }) {
  return (
    <div
      {...props}
      data-slot="empty"
      className={cx(
        sx(emptyStateStyles.root, emptyStateStyles.plain, xstyle),
        className,
      )}
    />
  );
}
export function EmptyTitle({ className, xstyle, ...props }: ComponentProps<"div"> & { xstyle?: StyleXValue }) {
  return (
    <div
      {...props}
      data-slot="empty-title"
      className={cx(sx(emptyStateStyles.title, xstyle), className)}
    />
  );
}
export function EmptyMedia({
  className,
  xstyle,
  variant = "default",
  ...props
}: ComponentProps<"div"> & { xstyle?: StyleXValue } & { variant?: "default" | "icon" }) {
  return (
    <div
      {...props}
      data-slot="empty-icon"
      data-variant={variant}
      className={cx(
        // The icon variant is a medallion: the ADS `media` style only carries
        // the box and centering, the chip fill comes from a tone. Without a
        // tone the medallion renders transparent, so pair the two here.
        // `toneNeutral` matches this variant's pre-adapter intent, and callers
        // that pass their own fill still win because `xstyle` is applied last.
        sx(
          variant === "icon" && emptyStateStyles.media,
          variant === "icon" && emptyStateStyles.toneNeutral,
          xstyle,
        ),
        className,
      )}
    />
  );
}
