import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Segmented container for controls that belong to one object — a primary
 * action plus the menu that configures it.
 *
 * The composer toolbar is otherwise chrome-free, so two adjacent ghost buttons
 * read as two unrelated controls. Joining them under one hairline outline and
 * squaring the inner corners is what says "one control, two halves": the outer
 * radius lives on the group, and clipping keeps the halves from rounding away
 * from each other no matter what radius a segment carries.
 */
export function ButtonGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "inline-flex w-fit items-stretch overflow-hidden rounded-md border border-border/55 bg-transparent",
        "[&>*]:rounded-none",
        className,
      )}
      {...props}
    />
  );
}

/** Hairline between two segments. Decorative: the segments name themselves. */
export function ButtonGroupSeparator({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="button-group-separator"
      className={cn("w-px shrink-0 self-stretch bg-border/55", className)}
      {...props}
    />
  );
}
