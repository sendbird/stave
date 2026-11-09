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
    backgroundColor: vars["--aui-color-canvas-subtle"],
    blockSize: vars["--aui-control-icon-size-lg"],
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    inlineSize: vars["--aui-control-icon-size-lg"],
    justifyContent: "center",
    lineHeight: 1,
    overflow: "hidden",
  },
});
