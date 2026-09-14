import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Shared chrome for small controls that sit on top of a surface (close,
 * dismiss, clear). The host component supplies its square metric and focus
 * ring; this recipe owns the quiet color/state language.
 */
export const surfaceChrome = stylex.create({
  quietIconButton: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":active": vars["--ads-color-overlay-pressed"],
        ":hover": vars["--ads-color-overlay-hover"],
      },
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxSizing: "border-box",
    color: {
      default: vars["--ads-color-text-muted"],
      ":active": vars["--ads-color-text"],
      "@media (hover: hover)": {
        default: vars["--ads-color-text-muted"],
        ":active": vars["--ads-color-text"],
        ":hover": vars["--ads-color-text"],
      },
    },
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    padding: 0,
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  /**
   * The `+1` optical nudge that drops a leading glyph onto the first line of
   * copy. A 16px glyph box centred against a 20px line box sits one pixel high
   * because the cap height, not the box, is what the eye aligns to.
   *
   * §8 permits sub-4px optical corrections and requires each site to carry its
   * reason; three components (`Alert`, `Banner`, `Callout`) carried the same
   * decision as three separate copies, which is the drift shape §1.7 exists to
   * prevent — the value could be tuned in one and left in the others with no
   * check failing. One decision, one place.
   */
  leadingGlyphNudge: {
    marginBlockStart: 1,
  },
});
