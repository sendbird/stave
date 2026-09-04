import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Segmented container for controls that belong to one object — a primary
 * action plus the menu that configures it.
 *
 * The composer toolbar is a row of bare ghost buttons, so the group stays
 * chrome-free and does not turn into a field-like pill on hover or focus. The
 * shared radius, child corner reset, and optional separators still make the
 * adjacent buttons read as one control family.
 */
export function ButtonGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "group/button-group inline-flex w-fit items-stretch overflow-hidden rounded-md",
        "border-0 bg-transparent",
        "[&>*]:rounded-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Hairline between two segments. Decorative; the segments name themselves.
 */
export function ButtonGroupSeparator({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="button-group-separator"
      className={cn("w-px shrink-0 self-stretch bg-border/40", className)}
      {...props}
    />
  );
}
