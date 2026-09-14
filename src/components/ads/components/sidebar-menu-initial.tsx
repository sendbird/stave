import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type SidebarMenuInitialProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  children: string;
};

/** Compact text glyph sized for a SidebarMenuButton icon slot. */
export function SidebarMenuInitial({
  children,
  className,
  ...props
}: SidebarMenuInitialProps) {
  return (
    <span {...props} aria-hidden className={cx(sx(styles.root), className)}>
      {children}
    </span>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    blockSize: vars["--ads-control-icon-size-lg"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    inlineSize: vars["--ads-control-icon-size-lg"],
    justifyContent: "center",
    lineHeight: 1,
    overflow: "hidden",
  },
});
