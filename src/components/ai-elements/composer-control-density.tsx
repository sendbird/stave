import { createContext, useContext, type ReactNode } from "react";

/**
 * Wing-hosted composer controls keep their full layout inside a clipped shelf.
 * Hover, focus, or an open child menu reveals the labels without changing the
 * reserved column width. The in-card toolbar keeps labeled pills.
 */
export type ComposerControlDensity = "default" | "icon";

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
