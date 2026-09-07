import type { StyleXValue } from "../ads/utils/stylex";
import type { ComponentProps } from "react";
import * as stylex from "@stylexjs/stylex";
import {
  emptyStateStyles,
  EmptyStateHeader,
  EmptyStateDescription,
  EmptyStateContent,
} from "../ads/components/EmptyState";
import { sx, cx } from "../ads/utils/stylex";
export function EmptyHeader({
  xstyle,
  ...props
}: ComponentProps<"div"> & { xstyle?: StyleXValue }) {
  // The pre-adapter component emitted this slot hook; keep it so the header
  // stays addressable from tests and integration CSS.
  //
  // The installed ADS `EmptyState` header is a bare grid with no
  // `justify-items`, so every child resolves to `stretch` — which reads as
  // centered for text (the root sets `text-align: center`) but hangs a
  // fixed-size icon medallion off the left edge. Upstream has since centered
  // the header; until that lands here the shim owns the correction, so every
  // consumer of the pre-adapter anatomy (which nests Media INSIDE Header,
  // unlike the ADS anatomy where Media is a sibling) is centered by default.
  // `xstyle` still applies last, so a caller that wants a left-aligned or row
  // header keeps winning.
  return (
    <EmptyStateHeader
      data-slot="empty-header"
      xstyle={[styles.header, xstyle]}
      {...props}
    />
  );
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
          styles.media,
          variant === "icon" && emptyStateStyles.media,
          variant === "icon" && emptyStateStyles.toneNeutral,
          xstyle,
        ),
        className,
      )}
    />
  );
}

const styles = stylex.create({
  header: {
    justifyItems: "center",
  },
  media: {
    // Belt and braces for the header above: a medallion is a fixed-size box in
    // a grid track, so it also pins itself to the track's center rather than
    // relying on the parent's `justify-items`. Inert (and harmless) in the
    // handful of headers that override the display mode to `flex`.
    justifySelf: "center",
  },
});
