import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type KbdSize = "sm" | "md";

export type KbdProps = React.ComponentProps<"kbd"> & {
  /** `md` (24px min box) fits body copy; `sm` (20px) fits dense chrome like menu shortcut hints. */
  size?: KbdSize;
} & XstyleProp;

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
export function Kbd({ className, size = "md", xstyle, ...props }: KbdProps) {
  return (
    <kbd
      {...props}
      className={cx(sx(styles.root, sizeStyles[size], xstyle), className)}
    />
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    // A keycap is a fixed-size mark, and `inline-flex` does not protect it from
    // its parent. In a flex row `align-items` defaults to `stretch`, so a Kbd
    // beside a 36px control grew to 36px tall and stopped reading as a key; in a
    // grid cell the same thing happens on both axes. `min-block-size` cannot
    // catch this — it sets a floor, and stretching pushes past it. So the mark
    // states its own cross-axis alignment and refuses to be squeezed. Overridable
    // through `xstyle` for the rare caller that really wants a stretched cap.
    alignSelf: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // Inset bottom edge that makes the keycap read recessed. The literal it
    // replaces was an ink color baked for light mode only, so on a dark keycap
    // the edge was dark-on-dark and vanished; `colorInsetEdge` flips to a light
    // alpha in dark/high-contrast themes.
    boxShadow: `inset 0 calc(-1 * ${vars["--ads-border-width-hairline"]}) 0 0 ${vars["--ads-color-inset-edge"]}`,
    color: vars["--ads-color-text"],
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    justifyContent: "center",
    lineHeight: 1,
    paddingBlock: 0,
    whiteSpace: "nowrap",
  },
  sm: {
    minBlockSize: 20,
    minInlineSize: 20,
    paddingInline: vars["--ads-space-4"],
  },
  md: {
    minBlockSize: 24,
    minInlineSize: 24,
    paddingInline: vars["--ads-space-8"],
  },
});

const sizeStyles = {
  md: styles.md,
  sm: styles.sm,
} as const;
