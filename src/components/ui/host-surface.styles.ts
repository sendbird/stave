import * as stylex from "@stylexjs/stylex";

/** Suppress nested button paint when the surrounding row owns hover. */
export const hostSurface = stylex.create({
  // Override every condition in the same StyleX composition as control chrome.
  inertChrome: {
    backgroundColor: {
      default: "transparent",
      ":hover": "transparent",
      ":active": "transparent",
    },
  },
});
