import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { focusRing } from "../recipes/focus-ring";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type DisclosureGroupToggleProps = Omit<
  React.ComponentProps<"button">,
  "children" | "onClick" | "type"
> & {
  /** The group is fully open, so the control offers to fold it. */
  expanded: boolean;
  onToggle: () => void;
  /** The owning target's `toggle` slot (`themeSlotProps(target, "toggle")`). */
  themeSlot: { "data-aui-slot": string };
} & XstyleProp;

/**
 * The one "Expand all / Collapse all" control the disclosure-group surfaces
 * share (`utils/disclosure-group`). A real `<button>` whose name says what it
 * will do and whose `aria-expanded` says what the group is now — the
 * show-all-sections pattern — so the state is announced on focus and the name
 * never has to carry it alone. Activating it re-renders the same element, so
 * keyboard focus stays on the toggle across expand → collapse.
 *
 * Quiet text chrome, not a `Button`: it sits in a summary line beside caption
 * copy, where a 28px control would outweigh the rows it speaks for.
 */
export function DisclosureGroupToggle({
  className,
  expanded,
  onToggle,
  themeSlot,
  xstyle,
  ...props
}: DisclosureGroupToggleProps) {
  useTranslation();
  return (
    <button
      {...props}
      {...themeSlot}
      aria-expanded={expanded}
      className={cx(sx(styles.toggle, focusRing.ring, xstyle), className)}
      onClick={onToggle}
      type="button"
    >
      {expanded
        ? i18n.t("ui:disclosureGroup.collapseAll")
        : i18n.t("ui:disclosureGroup.expandAll")}
    </button>
  );
}

const styles = stylex.create({
  toggle: {
    appearance: "none",
    backgroundColor: "transparent",
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "none",
    color: vars["--aui-color-text-muted"],
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-micro"],
    paddingBlock: vars["--aui-space-0"],
    paddingInline: 0,
    textDecorationLine: {
      default: "none",
      "@media (hover: hover)": {
        default: "none",
        ":hover": "underline",
      },
    },
  },
});
