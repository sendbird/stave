import { useEffect, useState } from "react";
import type * as React from "react";

/**
 * When a disclosure panel's children enter the DOM.
 *
 * - `eager` — mount the children with the panel, open or closed. This is the
 *   default everywhere it is offered, and it stays the default on purpose:
 *   open-by-default sections, the browser's in-page find, `hiddenUntilFound`,
 *   Ctrl-F on a settings page, and printing all read the DOM, not the React
 *   tree. A panel that is not mounted is not findable and does not print, so
 *   flipping the default would quietly break three things nobody tests.
 * - `lazy` — do not mount the children until the panel first opens, then keep
 *   them mounted for the rest of the panel's life. The "then keep" half is not
 *   an optimisation detail: unmounting on every collapse throws away scroll
 *   position, uncommitted form state, and any chart/editor that paid for its
 *   own initialisation, so a panel that unmounted each time would be worse
 *   than eager rather than better. `lazy` buys the FIRST paint only, which is
 *   the cost that actually hurts — twelve charts in a twelve-item accordion
 *   where the reader opens one.
 *
 * This lives beside `Collapsible` because Collapsible is the primitive the
 * question belongs to: an Accordion item is a Collapsible with a header, and a
 * Tabs panel is the same "is this content in the DOM yet" decision wearing a
 * different trigger. One implementation, so the three cannot answer it
 * differently.
 */
export type PanelMount = "eager" | "lazy";

export type PanelMountState = {
  /**
   * Hand to the Base UI part's `keepMounted`. `undefined` means "do not pass
   * one" — Tabs has never been eager (Base UI unmounts a hidden tab panel by
   * default), so its `mount`-less callers must keep getting exactly that.
   */
  keepMounted: boolean | undefined;
  /**
   * Render as the panel's first child. It is `null` in the DOM, so it is safe
   * inside a `render={<ul />}` panel, and it disappears entirely once the
   * panel has opened once.
   */
  probe: React.ReactNode;
};

/**
 * Resolve a `mount` prop into the `keepMounted` value and the mount probe.
 *
 * The mechanism is deliberately indirect, because the direct route does not
 * exist: Base UI hands panel open-state to the `className`/`render` callbacks,
 * which run *during* the panel's own render — too late to decide what this
 * component already returned as children, and illegal to set state from. So
 * `lazy` starts at `keepMounted: false`, which makes Base UI render nothing at
 * all while closed; the first open is therefore the first time anything inside
 * the panel mounts, and the probe's effect is that moment. It flips
 * `keepMounted` to `true` before the panel can close again, which is what makes
 * the mounting one-way.
 */
export function usePanelMount(mount: PanelMount | undefined): PanelMountState {
  const [opened, setOpened] = useState(mount !== "lazy");

  return {
    keepMounted: mount === undefined ? undefined : opened,
    probe: opened ? null : <PanelMountProbe onMount={setOpened} />,
  };
}

/**
 * Renders nothing; exists only so that "the panel mounted" becomes an effect.
 * `onMount` is `useState`'s setter, which React guarantees is stable, so the
 * effect runs once per real mount rather than once per parent render.
 */
function PanelMountProbe({ onMount }: { onMount: (opened: boolean) => void }) {
  useEffect(() => {
    onMount(true);
  }, [onMount]);

  return null;
}
