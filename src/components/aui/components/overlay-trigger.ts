import { isValidElement } from "react";
import type * as React from "react";

import { Button } from "./Button";

/**
 * What an anchored overlay (`Popover`, `DropdownMenu`, `PreviewCard`) renders
 * AS its trigger — `render` — and what goes inside it — `content`. A
 * `render` of `undefined` means the overlay's own styled trigger.
 *
 * Two ways to compose, one answer:
 *
 *  1. `render` from the overlay's `triggerProps` — Base UI's composition prop,
 *     any element or render function, with `trigger` as its content.
 *  2. A `Button` element passed as `trigger` — the rule `Dialog`, `Drawer`
 *     and `AlertDialog` already follow. Wrapped in the overlay's own trigger
 *     it was a button nested in a button; composed, it keeps its own size,
 *     weight and styles.
 *
 * Only a `Button` is composed implicitly: any other element (an icon, a
 * `<span>`, a fragment of icon and text) is content, which is what `trigger`
 * has always meant for it.
 */
export function resolveComposedTrigger<Render>({
  render,
  trigger,
}: {
  render?: Render;
  trigger: React.ReactNode;
}): {
  content: React.ReactNode;
  render: Render | React.ReactElement | undefined;
} {
  if (render != null) return { content: trigger, render };
  if (isValidElement(trigger) && trigger.type === Button) {
    return { content: undefined, render: trigger };
  }
  return { content: trigger, render: undefined };
}
