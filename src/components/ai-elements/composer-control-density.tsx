import { controlStyles, toolbarMarker, wingMarker, shelfMarker, menuMarker, groupMarker } from "./composer-control.stylex";
import { sx } from "../ads/utils/stylex";
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
 * `COMPOSER_CONTROL_LANE` through StyleX ancestor conditions.
 */
export const COMPOSER_CONTROL_BUTTON = sx(controlStyles.button);

/**
 * The wrapper for one action expressed as two buttons — a primary plus its
 * alternatives menu.
 *
 * A lane sizes ROWS, and a lane cannot tell a two-button row apart from two
 * one-button rows: in the wing and `⋯` lanes it asks each control for the
 * full row width, which is right until two of them share one. Marking the
 * wrapper moves that width up one level, so the group fills the row and the
 * halves divide it (`COMPOSER_CONTROL_GROUP_PRIMARY` takes the slack,
 * `COMPOSER_CONTROL_GROUP_MENU` hugs) instead of both overflowing and shrinking
 * to half a row each.
 */
export const COMPOSER_CONTROL_GROUP = sx(groupMarker, controlStyles.group);
export const COMPOSER_CONTROL_GROUP_PRIMARY = sx(controlStyles.groupPrimary);
export const COMPOSER_CONTROL_GROUP_MENU = sx(controlStyles.groupMenu);

/**
 * Control geometry, stated once per lane instead of once per control.
 *
 * The same six-or-so controls are rendered in four places at three different
 * sizes, so size cannot live with the control — it belongs to wherever the
 * control is standing. Each marker is applied to the container and activates
 * the shared control recipe, so a lane can never
 * accidentally resize the unrelated buttons (model selector, send, attach)
 * that share the row with it.
 */
export const COMPOSER_CONTROL_LANE = {
  toolbar: sx(toolbarMarker),
  wing: sx(wingMarker),
  shelf: sx(shelfMarker),
  menu: sx(menuMarker),
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
      className={sx(controlStyles.wingLabel)}
    >
      {props.children}
    </span>
  );
}
