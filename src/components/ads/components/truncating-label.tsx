import * as React from "react";

import { sx } from "../utils/stylex";

/**
 * Wrap a small object's *text* children in a real block box so they elide.
 *
 * `text-overflow` only applies to a **block container**. Every small object in
 * this system that carries a label beside something else — a dot, a count, a
 * remove button — has a flex root, because it has to lay those out. Its bare
 * text therefore lives in an anonymous flex item, which never inherits
 * `text-overflow`, and the `overflow`/`white-space` pair on the root clips the
 * label mid-glyph instead of eliding it.
 *
 * Only text children are wrapped. Element children stay direct flex items so
 * the root's `gap` between the label and its neighbours is unchanged.
 *
 * `Badge` was fixed for this and kept the helper private; `Combobox.Chip` had
 * the same root shape, was never fixed, and overflowed its field on a long
 * option label. Two owners is where a private helper becomes a shared one.
 */
export function withTruncatingLabels(
  children: React.ReactNode,
  labelStyle: Parameters<typeof sx>[0],
  slotProps?: Record<string, unknown>,
): React.ReactNode {
  return React.Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number" ? (
      <span className={sx(labelStyle)} {...slotProps}>
        {child}
      </span>
    ) : (
      child
    ),
  );
}
