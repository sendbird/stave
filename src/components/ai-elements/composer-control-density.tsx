import { createContext, useContext, type ReactNode } from "react";

/**
 * Wing-hosted composer controls keep their full layout inside a clipped shelf.
 * Hover, focus, or an open child menu reveals the labels without changing the
 * reserved column width. The in-card toolbar keeps labeled pills.
 */
export type ComposerControlDensity = "default" | "icon";

/**
 * Marks the one element a lane is allowed to resize: the control's own button.
 * Spread it there — never onto a wrapper, or the lane rule lands on a box the
 * button no longer fills and the control drifts out of the row.
 */
export const composerControlAttributes = {
  "data-composer-control": "true",
} as const;

/**
 * The one pill every composer control wears. It carries appearance plus the
 * in-card toolbar's geometry, which doubles as the fallback for a control
 * rendered outside any lane. Every other lane restates the size it wants in
 * `COMPOSER_CONTROL_LANE` and wins by descendant specificity.
 */
export const COMPOSER_CONTROL_BUTTON =
  "h-9 gap-1.5 px-2.5 text-xs text-muted-foreground shadow-none hover:text-foreground";

/**
 * Control geometry, stated once per lane instead of once per control.
 *
 * The same six-or-so controls are rendered in four places at three different
 * sizes, so size cannot live with the control — it belongs to wherever the
 * control is standing. Each entry is applied to the *container* and reaches
 * the buttons through `[data-composer-control]`, so a lane can never
 * accidentally resize the unrelated buttons (model selector, send, attach)
 * that share the row with it.
 */
export const COMPOSER_CONTROL_LANE = {
  /** In-card toolbar: full-size pills beside the model selector. */
  toolbar:
    "[&_[data-composer-control]]:h-9 [&_[data-composer-control]]:min-h-9 [&_[data-composer-control]]:gap-1.5 [&_[data-composer-control]]:px-2.5",
  /** Side wing: 2rem rows that fill the reserved column width. */
  wing: "[&_[data-composer-control]]:h-8 [&_[data-composer-control]]:min-h-8 [&_[data-composer-control]]:w-full [&_[data-composer-control]]:shrink-0 [&_[data-composer-control]]:gap-2 [&_[data-composer-control]]:px-2",
  /** Bottom status shelf: 1.5rem chips, the tightest lane. */
  shelf:
    "[&_[data-composer-control]]:h-6 [&_[data-composer-control]]:min-h-6 [&_[data-composer-control]]:gap-1.5 [&_[data-composer-control]]:px-1.5 [&_[data-composer-control]]:text-xs",
  /** Overflow menu: a stacked list, so every row is full width and left-aligned. */
  menu: "[&_[data-composer-control]]:h-8 [&_[data-composer-control]]:min-h-8 [&_[data-composer-control]]:w-full [&_[data-composer-control]]:justify-start [&_[data-composer-control]]:gap-2 [&_[data-composer-control]]:px-2",
} as const;

const ComposerControlDensityContext =
  createContext<ComposerControlDensity>("default");

export function ComposerControlDensityProvider(props: {
  value: ComposerControlDensity;
  children: ReactNode;
}) {
  return (
    <ComposerControlDensityContext.Provider value={props.value}>
      {props.children}
    </ComposerControlDensityContext.Provider>
  );
}

export function useComposerControlDensity(): ComposerControlDensity {
  return useContext(ComposerControlDensityContext);
}

export function useComposerControlIconOnly(): boolean {
  return useComposerControlDensity() === "icon";
}

export function ComposerControlLabel(props: {
  children: ReactNode;
  /** Render this label only when the control lives in a side wing. */
  wingOnly?: boolean;
}) {
  if (!useComposerControlIconOnly()) {
    return props.wingOnly ? null : props.children;
  }
  return (
    <span
      data-composer-control-label=""
      className="pointer-events-none inline-flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-xs opacity-0 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[side=left]/composer-wing:-translate-x-1 group-data-[side=left]/composer-wing:justify-end group-data-[side=right]/composer-wing:translate-x-1 group-data-[side=right]/composer-wing:justify-start group-hover/composer-wing:translate-x-0 group-hover/composer-wing:opacity-100 group-focus-within/composer-wing:translate-x-0 group-focus-within/composer-wing:opacity-100 group-has-[[aria-expanded=true]]/composer-wing:translate-x-0 group-has-[[aria-expanded=true]]/composer-wing:opacity-100 motion-reduce:translate-x-0 motion-reduce:transition-opacity"
    >
      {props.children}
    </span>
  );
}
