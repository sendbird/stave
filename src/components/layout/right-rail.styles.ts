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
  stack: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    width: "100%",
  },
  triggerHost: { display: "inline-flex" },
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
