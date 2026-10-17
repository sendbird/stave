import * as stylex from "@stylexjs/stylex";
import { vars } from "../components/ads/tokens/tokens.stylex";

/** Host stacking bands also govern guest-page occlusion; keep their order. */
export const layers = stylex.create({
  lensSurface: { zIndex: 10 },
  lensPaneChrome: { zIndex: 15 },
  resizer: { zIndex: 20 },
  chrome: { zIndex: 30 },
  sessionFloater: { zIndex: 35 },
  floatingChrome: { zIndex: 40 },
  muse: { zIndex: 60 },
  dialog: { zIndex: 80 },
  popover: { zIndex: 90 },
  appMenu: { zIndex: 100 },
  lightbox: { zIndex: 110 },
});
/**
 * Sibling order inside one local stacking context — a pane, a card, the
 * isolated composer frame. These are not host bands: the element that
 * establishes the context is what a `layers` band positions, and nothing in
 * here can climb past it. `overlay` lifts a drawn layer over in-flow siblings
 * (the commit-graph lines over their rows); `raised` is a sticky header, a
 * hover action tray, a boot cover or the frame's card over its wings;
 * `floating` is a banner, toast or peek panel over raised content.
 */
export const localStack = stylex.defineVars({
  "--stave-stack-overlay": "2",
  "--stave-stack-raised": "10",
  "--stave-stack-floating": "20",
});
export const elevations = stylex.create({
  surface: { boxShadow: vars["--ads-elevation-raised"] },
  raised: { boxShadow: vars["--ads-elevation-lift"] },
  floating: { boxShadow: vars["--ads-elevation-overlay"] },
  modal: { boxShadow: vars["--ads-elevation-modal"] },
});
