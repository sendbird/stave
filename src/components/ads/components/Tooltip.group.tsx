import * as React from "react";

import { TooltipProvider as HeadlessTooltipProvider } from "../headless/tooltip";

/**
 * How long the pointer must REST on a trigger before the first tooltip of a
 * group opens, in milliseconds.
 *
 * Base UI spends this budget as `restMs`, not as a plain enter timer: every
 * pointer move of more than ~1.4px restarts it, so the reader has already
 * stopped moving before the clock even completes. That makes the same number
 * strictly slower here than in a system that counts from `mouseenter` — which
 * is why ADS sits below the enter delays it is compared against rather than at
 * them (Base UI's own `OPEN_DELAY` 600ms, Radix `delayDuration` 700ms, MUI
 * `enterDelay` 100ms) and leans on the group window below for the rest.
 *
 * 150ms is `--atelier-motion-duration-quick`, the system's own "this is one
 * gesture, not two" step, and it is inside the ~200ms window where a response
 * still reads as caused by the pointer.
 */
export const tooltipOpenDelay = 150;

/**
 * A hint closes the moment the pointer leaves. Nothing in a tooltip is worth
 * reading after you have moved on, and Base UI keeps the popup hoverable
 * through `safePolygon` while the pointer travels toward it (WCAG 1.4.13
 * "hoverable"), so a close delay would only add a stale hint to the screen.
 */
export const tooltipCloseDelay = 0;

/**
 * True when an ADS tooltip group already exists above this point in the tree.
 *
 * This is the piece that makes Base UI's free "skip delay" window reachable.
 * `TooltipProvider` renders a `FloatingDelayGroup`, whose `timeout` (400ms)
 * opens every neighbouring tooltip instantly once one has been read — but only
 * within one group. ADS `Tooltip` used to mint a *fresh* provider per instance,
 * so every tooltip was its own group of one and the window could never apply to
 * anything. Joining an existing group instead of nesting a new one is the whole
 * fix.
 */
const TooltipGroupContext = React.createContext(false);

export function TooltipGroupBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipGroupContext.Provider value>
      {children}
    </TooltipGroupContext.Provider>
  );
}

/**
 * Joins the nearest ADS tooltip group, or starts one where there is none.
 *
 * Rendering it is free inside a group: it adds no provider, no DOM, and no
 * second `FloatingDelayGroup` to shadow the first.
 */
export function TooltipGroup({ children }: { children: React.ReactNode }) {
  const insideGroup = React.useContext(TooltipGroupContext);
  if (insideGroup) return <>{children}</>;
  return (
    <TooltipGroupBoundary>
      <HeadlessTooltipProvider
        closeDelay={tooltipCloseDelay}
        delay={tooltipOpenDelay}
      >
        {children}
      </HeadlessTooltipProvider>
    </TooltipGroupBoundary>
  );
}
