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
export const elevations = stylex.create({
  surface: { boxShadow: vars.elevationRaised },
  raised: { boxShadow: vars.elevationLift },
  floating: { boxShadow: vars.elevationOverlay },
  modal: { boxShadow: vars.elevationModal },
});
