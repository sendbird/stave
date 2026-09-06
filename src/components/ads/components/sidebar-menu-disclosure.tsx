import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import type * as React from "react";

import { CollapsiblePanel, CollapsibleRoot } from "../headless/collapsible";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type SidebarMenuChevronProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  open: boolean;
};

/** Standard disclosure glyph for a sidebar row with nested navigation. */
export function SidebarMenuChevron({
  className,
  open,
  ...props
}: SidebarMenuChevronProps) {
  return (
    <span
      {...props}
      aria-hidden
      // The slot owns the glyph box (§9): `styles.css` sizes the direct SVG
      // child to 100% of this span, so the size comes from `controlIconSizeSm`
      // like every other control glyph. The hand-written `size={13}` was a
      // singleton off the 14/16/18 scale that put a 24-grid Lucide path on
      // fractional pixels — visibly softer strokes than the 14px chevron one
      // row above it in `SidebarGroup`.
      data-ads-control-icon-slot="true"
      className={cx(
        sx(
          styles.chevron,
          transition.transform,
          transition.motionDurationNormal,
          open && styles.chevronOpen,
        ),
        className,
      )}
    >
      <ChevronRight aria-hidden />
    </span>
  );
}

export type SidebarDisclosurePanelProps = {
  /** The panel element. Base UI clones it and merges the panel props onto it. */
  children: React.ReactElement;
  /** Applied to the collapsible root, not the panel. */
  className?: string;
  id?: string;
  open: boolean;
};

/**
 * THE sidebar disclosure — one open/close for every nested list in the rail,
 * whether it hangs off a `SidebarGroup` or a `SidebarMenuButton`. Base UI's
 * Collapsible drives the panel height; `sidebar-motion.css` supplies the
 * 180ms bounce (and its Reduce Motion arm).
 *
 * It exists because the rail had two disclosures with two behaviours one row
 * apart: a nested `SidebarMenuSub` animated open, while a collapsible
 * `SidebarGroup` right above it swapped `display: none` instantly. The group
 * is the one users hit most — in Crane it is Projects and Initiatives, sitting
 * directly above the Teams rows that did animate.
 */
export function SidebarDisclosurePanel({
  children,
  className,
  id,
  open,
}: SidebarDisclosurePanelProps) {
  return (
    <CollapsibleRoot className={className} open={open}>
      <CollapsiblePanel
        // The panel is `overflow: hidden` for the height animation, and it is
        // the element the rail's nested rows are `inlineSize: 100%` of — so
        // every row inside an open group or sub-menu lost its ring to a clip
        // that exists for 180ms of motion. The gutter survives the animation
        // because Base UI pins `--collapsible-panel-height` only WHILE
        // animating and hands the panel back to `auto` at rest: measured
        // 141px box / 133px footprint open, first row 4px clear of the clip,
        // close 141 → 83 → 0 and open 8 → 122 → 154 (bounce) → 141 unchanged.
        className={cx(
          "atelier-motion-sidebar-disclosure",
          sx(focusRing.gutter),
        )}
        id={id}
        keepMounted
        render={children}
      />
    </CollapsibleRoot>
  );
}

export type SidebarMenuSubProps = React.ComponentProps<"ul"> & {
  /** Controlled disclosure state; omit for an always-visible submenu. */
  open?: boolean;
};

type SidebarMenuSubBaseProps = SidebarMenuSubProps & { collapsed: boolean };

export function SidebarMenuSubBase({
  children,
  className,
  collapsed,
  id,
  open,
  ...props
}: SidebarMenuSubBaseProps) {
  const subMenu = (
    <ul
      {...props}
      className={cx(
        sx(styles.subMenu, collapsed && styles.subMenuCollapsed),
        className,
      )}
      id={id}
    >
      {children}
    </ul>
  );

  if (open === undefined) return subMenu;

  return (
    <SidebarDisclosurePanel
      className={sx(styles.motionRoot, collapsed && styles.motionRootCollapsed)}
      id={id}
      open={open}
    >
      {subMenu}
    </SidebarDisclosurePanel>
  );
}

const styles = stylex.create({
  chevron: {
    alignItems: "center",
    blockSize: vars.controlIconSizeSm,
    display: "inline-flex",
    inlineSize: vars.controlIconSizeSm,
    justifyContent: "center",
    // Same guard as `AppShell`'s icon slot: keeps Lucide's 24px default from
    // leaking out of the box if a host has not loaded `styles.css`.
    overflow: "hidden",
    transform: "rotate(0deg)",
  },
  chevronOpen: {
    transform: "rotate(90deg)",
  },
  motionRoot: {
    gridColumn: "1 / -1",
    minInlineSize: 0,
  },
  motionRootCollapsed: {
    display: "none",
  },
  subMenu: {
    borderInlineStartColor: vars.colorBorderSubtle,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars.borderWidthHairline,
    display: "grid",
    // A hairline, not a spacing step — same intent as the border above it.
    gap: vars.borderWidthHairline,
    gridColumn: "1 / -1",
    listStyle: "none",
    margin: 0,
    marginInlineStart: 17,
    minInlineSize: 0,
    paddingBlock: vars.space4,
    paddingInline: 0,
    paddingInlineStart: vars.space8,
  },
  subMenuCollapsed: {
    display: "none",
  },
});

