import { createContext, useContext, useLayoutEffect } from "react";

/**
 * Sidebar state shared across the rail's parts.
 *
 * These contexts and their hooks used to sit at the top of `AppShell.tsx`
 * alongside every component that reads them. Pulling them out gives the rail's
 * leaf parts (`AppShell.SidebarSearch.tsx`) somewhere to import from that does
 * not point back at `AppShell.tsx` — the alternative was an import cycle
 * between a module and the file re-exporting it.
 */

export type SidebarCollapsible = "icon" | "none" | "offcanvas";

/**
 * The rail keeps `comfortable` rather than joining the `compact | regular`
 * vocabulary the other surfaces use, and that is a semantic difference, not
 * drift: `compact` is the Sidebar's DEFAULT (every product rail in the repo
 * asked for it by hand), so the other arm is a tier *roomier than the
 * baseline*. Calling it `regular` would claim it is the baseline it is not.
 * Elsewhere — `Card`, `Table`, `Tree`, `Collapsible`, `Item` — `regular` IS the
 * default, which is why those all read `compact | regular`.
 */
export type SidebarDensity = "comfortable" | "compact";
export type SidebarDirection = "ltr" | "rtl";
export type SidebarMenuButtonVariant = "default" | "outline";
export type SidebarMenuButtonSize = "sm" | "md" | "lg";
export type SidebarMenuSubButtonSize = "sm" | "md";

export type SidebarContextValue = {
  dir: SidebarDirection;
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  setOpen: (open: boolean) => void;
  sidebarId: string;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
};

export type SidebarLayoutContextValue = {
  collapsed: boolean;
  density: SidebarDensity;
  dir: SidebarDirection;
  side: "left" | "right";
};

export const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SidebarLayoutContext =
  createContext<SidebarLayoutContextValue | null>(null);

export type SidebarMenuItemContextValue = {
  /** The row is hovered or holds focus, so reveal-on-hover chrome shows. */
  actionVisible: boolean;
  /**
   * A `showOnHover` action is mounted in this row AND currently revealed — so
   * it is painting over the row's trailing slot, and the trailing badge in
   * that slot has to yield. The count is what separates "this row has a
   * floating action" from "this row is merely hovered": without it, every
   * hovered row would blank a badge nothing is covering.
   */
  floatingActionActive: boolean;
  /** Called by a `showOnHover` action on mount; returns its unregister. */
  registerFloatingAction: () => () => void;
};

export const SidebarMenuItemContext =
  createContext<SidebarMenuItemContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider.");
  }

  return context;
}

export function useOptionalSidebar() {
  return useContext(SidebarContext);
}

export function useOptionalSidebarLayout() {
  return useContext(SidebarLayoutContext);
}

/**
 * Which surface owns the sidebar's collapse control.
 *
 * A `Sidebar` renders its own trigger at the trailing edge of its header, and
 * that is the right answer for a rail that is the only navigation on the page.
 * It is the wrong answer inside `AppShell`'s framed chrome: there the app frame
 * has a 48px band above the work surface whose FIRST element is the collapse
 * control (`Crane`'s workspace header, the docs preview's context header), so
 * the rail's own trigger is a second button for the same state, 40px away, and
 * one of the two is always the wrong one to reach for.
 *
 * Which surface wins is not a preference the shell can guess. `AppShell` has
 * consumers whose chrome band is a plain `Topbar` with a title and nothing else
 * (`apps/mockbird`, the docs app's own shell, three fixtures) — inferring
 * ownership from "a chrome band exists" would delete their only collapse
 * control. So ownership is CLAIMED, not inferred: a `SidebarTrigger` rendered
 * inside one of the shell's chrome bands registers here, and only then does the
 * Sidebar stand its own trigger down. A band that carries no trigger changes
 * nothing, and a trigger the app renders somewhere else — a mobile bar above
 * its own content, Crane's GNB mode, Jive's widget workspace — never sees the
 * claim function, so it cannot take a control away from a rail it does not sit
 * beside.
 */
export type ShellChromeContextValue = {
  /**
   * Called on mount by a `SidebarTrigger` inside a shell chrome band; returns
   * its unregister. Absent everywhere else, which is the whole mechanism: only
   * the slots that provide this function can claim the control.
   */
  claimSidebarTrigger?: () => () => void;
  /** A chrome band already carries a collapse control for this sidebar. */
  sidebarTriggerClaimed: boolean;
};

export const ShellChromeContext = createContext<ShellChromeContextValue>({
  sidebarTriggerClaimed: false,
});

/**
 * Claim the sidebar's collapse control for the shell chrome band this trigger
 * sits in. A no-op anywhere else.
 *
 * `useLayoutEffect`, not `useEffect`: the claim is what removes the Sidebar's
 * own trigger, so on `useEffect` timing the second button would paint for one
 * frame and then vanish on every mount and every route change that remounts the
 * shell. Same reason `PeekPanel` and `AppShell.SidebarResize` use it.
 */
export function useClaimShellChromeSidebarTrigger() {
  const { claimSidebarTrigger } = useContext(ShellChromeContext);

  useLayoutEffect(() => claimSidebarTrigger?.(), [claimSidebarTrigger]);
}

/**
 * Whether a `Sidebar` renders its own collapse trigger.
 *
 * The two hard gates come first and are unchanged: there is nothing to toggle
 * without a `SidebarProvider`, and `collapsible="none"` means the rail does not
 * collapse at all — an explicit `showTrigger` cannot buy a button for a state
 * that does not exist. Past those, an explicit `showTrigger` wins, because a
 * caller that says `false` (the docs specimen, which composes its own
 * `SidebarHeader`) or `true` is making a decision, not asking for a default.
 *
 * The default is the interesting arm. It yields to a chrome band that has
 * claimed the control (`ShellChromeContext`) — EXCEPT while the sidebar is a
 * mobile offcanvas drawer, where the claim is real but unreachable: the drawer
 * is a modal surface over its own backdrop, so the band's trigger is behind it
 * and the only visible way back would be Escape or a backdrop press.
 */
export function useSidebarOwnsTrigger(
  collapsible: SidebarCollapsible,
  showTrigger: boolean | undefined,
) {
  const sidebar = useContext(SidebarContext);
  const { sidebarTriggerClaimed } = useContext(ShellChromeContext);

  if (!sidebar || collapsible === "none") return false;
  if (showTrigger !== undefined) return showTrigger;

  return (
    !sidebarTriggerClaimed || (sidebar.isMobile && collapsible === "offcanvas")
  );
}
