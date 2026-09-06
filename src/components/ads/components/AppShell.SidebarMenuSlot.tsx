import * as stylex from "@stylexjs/stylex";
import { cloneElement, isValidElement, useContext, useEffect } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import {
  SidebarMenuItemContext,
  useOptionalSidebarLayout,
} from "./sidebar-context";

/**
 * The two halves of a sidebar row's trailing slot.
 *
 * They are one file because they are one contract: a `showOnHover`
 * `SidebarMenuAction` floats over the exact 28px the row's `SidebarMenuBadge`
 * occupies, and the badge yields it for as long as the action is up. Splitting
 * them across modules is how the collision below shipped in the first place.
 *
 * Split out of `AppShell.tsx` to keep that file under the source-structure size
 * limit; both exports are re-exported from `./AppShell`, so no import path
 * changes.
 */

export type SidebarMenuBadgeProps = React.ComponentProps<"span">;

export function SidebarMenuBadge({
  className,
  ...props
}: SidebarMenuBadgeProps) {
  const sidebarLayout = useOptionalSidebarLayout();
  const menuItem = useContext(SidebarMenuItemContext);
  // The badge and a `showOnHover` action are the SAME 28px at the row's
  // trailing edge — the action floats over the badge's box, and the badge's
  // last child is usually a chevron the action lands on dead centre. Measured
  // on nested team rows: the action spans x 179–207, the chevron 189–203 and
  // the open-count digit 177.8–185, so revealing the action painted `···` over
  // 100% of the chevron and 83% of the count. Neither box is opaque, so this
  // did not read as a replacement — it read as two glyphs in one slot.
  //
  // So the slot is shared in time instead of in space: the badge fades out for
  // exactly as long as the action is up. Opacity, not `display`, because the
  // faded badge must keep its box — that box is what reserves the trailing
  // width, and removing it would re-flow the label under the pointer. Nothing
  // is reserved for the action itself; it is still out of flow (see
  // `sidebarMenuActionFloating`).
  const yielded = Boolean(menuItem?.floatingActionActive);

  return (
    <span
      {...props}
      className={cx(
        sx(
          styles.sidebarBadge,
          transition.fade,
          yielded && styles.sidebarBadgeYielded,
          sidebarLayout?.collapsed && styles.sidebarBadgeCollapsed,
        ),
        className,
      )}
      data-yielded={yielded ? "true" : undefined}
    />
  );
}

export type SidebarMenuActionProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
};

export function SidebarMenuAction({
  asChild = false,
  children,
  className,
  showOnHover = false,
  tabIndex,
  type = "button",
  ...props
}: SidebarMenuActionProps) {
  const sidebarLayout = useOptionalSidebarLayout();
  const menuItem = useContext(SidebarMenuItemContext);
  const hiddenUntilActive = Boolean(showOnHover && !menuItem?.actionVisible);
  const resolvedTabIndex = hiddenUntilActive ? -1 : tabIndex;
  const registerFloatingAction = menuItem?.registerFloatingAction;

  // The row's trailing badge only yields to an action that actually floats over
  // it (see `SidebarMenuBadge`). Registration is what tells it apart from a row
  // that is merely hovered, or one whose action sits in the grid track.
  useEffect(() => {
    if (!showOnHover || !registerFloatingAction) {
      return;
    }

    return registerFloatingAction();
  }, [registerFloatingAction, showOnHover]);

  const resolvedClassName = cx(
    sx(
      styles.sidebarMenuAction,
      transition.control,
      focusRing.ring,
      // A `showOnHover` action is floated over the row's trailing edge rather
      // than parked in the item grid's `auto` track. In the track it reserved
      // 28px + 4px margin on EVERY row for a control that is invisible 100% of
      // the time the pointer is elsewhere — a permanent 32px bite out of a
      // 220px rail, which is what pushed labels into early ellipsis. Floating
      // it cannot be swapped in on hover instead: the label would re-flow under
      // the pointer. What it lands on is not left to chance — the row's
      // trailing badge yields for as long as the action is up
      // (`SidebarMenuBadge`), so the two share one slot rather than one glyph
      // painting over the other.
      showOnHover && styles.sidebarMenuActionFloating,
      sidebarLayout?.collapsed && styles.sidebarMenuActionCollapsed,
      hiddenUntilActive && styles.sidebarMenuActionHidden,
    ),
    className,
  );

  if (asChild && isValidElement(children)) {
    type ChildProps = React.HTMLAttributes<HTMLElement> & {
      "aria-hidden"?: React.AriaAttributes["aria-hidden"];
      "data-ads-control-icon-button"?: string;
      "data-visible"?: string;
      tabIndex?: number;
    };
    const child = children as React.ReactElement<ChildProps>;

    return cloneElement(child, {
      ...props,
      "aria-hidden": hiddenUntilActive || child.props["aria-hidden"],
      className: cx(resolvedClassName, child.props.className),
      "data-ads-control-icon-button": "true",
      "data-visible": hiddenUntilActive ? "false" : "true",
      tabIndex: resolvedTabIndex ?? child.props.tabIndex,
    });
  }

  return (
    <button
      {...props}
      aria-hidden={hiddenUntilActive || props["aria-hidden"]}
      className={resolvedClassName}
      data-ads-control-icon-button="true"
      data-visible={hiddenUntilActive ? "false" : "true"}
      tabIndex={resolvedTabIndex}
      type={type}
    >
      {children}
    </button>
  );
}

const styles = stylex.create({
  sidebarBadge: {
    alignItems: "center",
    display: "inline-flex",
    minInlineSize: 0,
    overflow: "hidden",
  },
  sidebarBadgeYielded: {
    opacity: 0,
  },
  sidebarBadgeCollapsed: {
    display: "none",
  },
  sidebarMenuAction: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextSubtle,
    cursor: "pointer",
    display: "inline-flex",
    justifyContent: "center",
    marginInlineStart: vars.space4,
    minBlockSize: vars.controlHeightXs,
    minInlineSize: vars.controlHeightXs,
    opacity: 1,
    padding: 0,
  },
  sidebarMenuActionFloating: {
    // Pinned to grid row 1 — the button's row — and NOT to the item's padding
    // box. A `SidebarMenuItem` holds the row AND, when the row discloses a
    // nested list, the `SidebarMenuSub` that spans `1 / -1` beneath it. An
    // out-of-flow child with `auto` placement takes the whole padding box as
    // its containing block, so `50%` measured the centre of row + open
    // submenu: on an expanded team the action landed 49.0px
    // below the row's centre, floating over the Dashboard/Projects rows.
    // A definite grid placement makes the containing block that grid AREA
    // instead (CSS Grid §9.2), so `50%` is the row's centre whether the
    // submenu is open, closed or absent.
    gridColumn: "1 / -1",
    // BOTH lines are written out. For an out-of-flow grid child an `auto`
    // grid line resolves to the container's PADDING EDGE, not to "span 1" —
    // so `grid-row: 1` alone still produced a row-1-to-bottom area and left
    // the 49px offset exactly as it was.
    gridRow: "1 / 2",
    insetBlockStart: "50%",
    insetInlineEnd: vars.space4,
    marginInlineStart: 0,
    position: "absolute",
    transform: "translateY(-50%)",
    // layer-ok: orders the floated action over its own row only
    zIndex: 1,
  },
  sidebarMenuActionHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  sidebarMenuActionCollapsed: {
    display: "none",
  },
});

