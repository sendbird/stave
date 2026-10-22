import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const LG = "@media (min-width: 64rem)";

export const rightRailStyles = stylex.create({
  rail: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    height: "100%",
    paddingBlock: { default: vars["--ads-space-8"], [LG]: vars["--ads-space-12"] },
    width: { default: 48, [LG]: 56 },
  },
  // The rail is an ADS `Toolbar` for its keyboard model only: one Tab stop,
  // arrows between toggles. It keeps the rail's flat column, so the toolbar's
  // raised panel (fill, border, radius, shadow, padding) is taken off here.
  toolbar: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    boxShadow: "none",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    minBlockSize: 0,
    padding: 0,
    width: "100%",
  },
  toolbarGroup: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    width: "100%",
  },
  railButton: {
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    height: { default: 36, [LG]: 40 },
    padding: 0,
    width: { default: 36, [LG]: 40 },
  },
  railButtonRelative: { position: "relative" },
  railButtonInactive: {
    // `transparent`, never `null`. `null` UNSETS `background-color`, which
    // dropped the `quiet` variant's own `transparent` and let the UA's
    // `buttonface` through — an opaque grey slab, dark grey under
    // `color-scheme: dark`. The rail is the quiet contract: no rest fill, a
    // theme overlay on hover, a heavier one on press.
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderColor: { default: "transparent", ":hover": vars["--ads-color-border"] },
  },
  railIcon: {
    height: { default: vars["--ads-control-icon-size-sm"], [LG]: vars["--ads-control-icon-size-md"] },
    width: { default: vars["--ads-control-icon-size-sm"], [LG]: vars["--ads-control-icon-size-md"] },
  },
  // The running count is ADS `Button indicator` + `CountBadge` now; the
  // hand-placed pill this key painted was a fifth copy of that mark.
});
