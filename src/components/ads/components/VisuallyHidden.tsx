import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { cx, sx } from "../utils/stylex";

export type VisuallyHiddenProps = React.ComponentProps<"span"> & {
  focusable?: boolean;
};

export function VisuallyHidden({
  className,
  focusable = false,
  ...props
}: VisuallyHiddenProps) {
  return (
    <span
      {...props}
      className={cx(sx(styles.root, focusable && styles.focusable), className)}
    />
  );
}

const styles = stylex.create({
  root: {
    blockSize: 1,
    borderWidth: 0,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    inlineSize: 1,
    // Pinned, not left at its static position: an auto-inset absolute box
    // escapes any `overflow` ancestor that is not its containing block and
    // still contributes to the *document's* scrollable overflow — Composer's
    // hidden textarea label alone added 446px of phantom window scroll below
    // the Agent workbench page. Safe for the focusable variant, which flips to
    // `position: static` on focus, ignoring the inset entirely.
    insetBlockStart: 0,
    insetInlineStart: 0,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
  },
  focusable: {
    blockSize: {
      default: null,
      ":focus": "auto",
    },
    clip: {
      default: null,
      ":focus": "auto",
    },
    clipPath: {
      default: null,
      ":focus": "none",
    },
    inlineSize: {
      default: null,
      ":focus": "auto",
    },
    margin: {
      default: null,
      ":focus": 0,
    },
    overflow: {
      default: null,
      ":focus": "visible",
    },
    position: {
      default: null,
      ":focus": "static",
    },
    whiteSpace: {
      default: null,
      ":focus": "normal",
    },
  },
});
