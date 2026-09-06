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
    backgroundColor: vars.colorCanvasSubtle,
    blockSize: vars.controlIconSizeLg,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    inlineSize: vars.controlIconSizeLg,
    justifyContent: "center",
    lineHeight: 1,
    overflow: "hidden",
  },
});
