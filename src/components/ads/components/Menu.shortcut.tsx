import type * as React from "react";

import { menu } from "../recipes/menu";
import { cx, sx } from "../utils/stylex";

export type MenuShortcutProps = React.ComponentProps<"span">;

/**
 * The trailing keyboard-shortcut hint on a menu row ("⌘K", "⇧⌘P").
 *
 * `recipes/menu.ts` has always had the `shortcut` rule, but nothing exported a
 * part for it: the three array APIs (`DropdownMenu`, `ContextMenu`, `Menubar`)
 * each inlined `<span className={sx(menu.shortcut)}>`, and a compound-API
 * consumer — the only API that can express a submenu, a checkbox row, or a
 * custom item — had to reach for the recipe by hand or hand-roll the span.
 * Four copies of one span is how the mono font, the `margin-inline-start: auto`
 * that pins the hint trailing, and the muted ink drift apart one at a time.
 * This is the single implementation; the array APIs now render through it.
 *
 * Deliberately a `<span>` and not a `<kbd>`: `menu.shortcut` already supplies
 * the mono face, and `<kbd>` would have changed the rendered box of every
 * existing shortcut in the system for a semantic that a menu row (whose
 * accessible name already carries the accelerator on every platform that binds
 * one) does not need.
 *
 * Lives in a sibling file because `Menu.tsx` is at its size ceiling.
 */
export function MenuShortcut({ className, ...props }: MenuShortcutProps) {
  return <span {...props} className={cx(sx(menu.shortcut), className)} />;
}
