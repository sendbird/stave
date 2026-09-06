import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type KbdSize = "sm" | "md";

export type KbdProps = React.ComponentProps<"kbd"> & {
  /** `md` (24px min box) fits body copy; `sm` (20px) fits dense chrome like menu shortcut hints. */
  size?: KbdSize;
};

/**
 * Keyboard-key chip (standalone `Kbd` element). Visually identical to
 * the `Kbd` part in `Typography` — same recessed key styling (subtle surface,
 * hairline border, inset bottom edge, mono type) — but exported on its own
 * with a `size` scale for use outside prose: menu shortcut hints, tooltips,
 * command palettes.
 *
 * Renders one key per element; compose several `<Kbd>`s (e.g. `⌘` + `K`) side
 * by side rather than packing a combo into one chip.
 */
export function Kbd({ className, size = "md", ...props }: KbdProps) {
  return (
    <kbd
      {...props}
      className={cx(sx(styles.root, sizeStyles[size]), className)}
    />
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // Inset bottom edge that makes the keycap read recessed. The literal it
    // replaces was an ink color baked for light mode only, so on a dark keycap
    // the edge was dark-on-dark and vanished; `colorInsetEdge` flips to a light
    // alpha in dark/high-contrast themes.
    boxShadow: `inset 0 calc(-1 * ${vars.borderWidthHairline}) 0 0 ${vars.colorInsetEdge}`,
    color: vars.colorText,
    display: "inline-flex",
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    justifyContent: "center",
    lineHeight: 1,
    paddingBlock: 0,
    whiteSpace: "nowrap",
  },
  sm: {
    minBlockSize: 20,
    minInlineSize: 20,
    paddingInline: vars.space4,
  },
  md: {
    minBlockSize: 24,
    minInlineSize: 24,
    paddingInline: vars.space8,
  },
});

const sizeStyles = {
  md: styles.md,
  sm: styles.sm,
} as const;
