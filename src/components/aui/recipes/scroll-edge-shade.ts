import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/*
 * The scroll cue: a 16px band on an inline edge that has content past it,
 * shading inward from the edge. Shared by `DataTable` (columns past the frame)
 * and `Tabs.List` (tabs past the strip), measured by `utils/scroll-edges`.
 *
 * Two token-built layers, because no single colour token is a
 * darker-than-the-surface ink in every theme:
 * - the modal scrim at half strength darkens white (light, high contrast) but
 *   is lighter than the dark theme's raised surface, so alone it vanishes there;
 * - the ground at 60% is the darkest plane under the dark theme's surface and a
 *   pale grey under the light one.
 * Stacked, each covers the theme where the other fails and only adds a little
 * where it does not.
 *
 * Structural, not decoration: it says "there is more this way", which the
 * hover-only scrollbar does not say at rest. It fades on the shared non-spatial
 * duration (`transition.fade`), which reduced motion keeps short.
 */
const EDGE_SCRIM = `color-mix(in srgb, ${vars["--aui-color-overlay"]}, transparent 50%)`;
const EDGE_GROUND = `color-mix(in srgb, ${vars["--aui-color-ground"]}, transparent 40%)`;
const shade = (towards: "left" | "right") =>
  `linear-gradient(to ${towards}, ${EDGE_SCRIM}, transparent), linear-gradient(to ${towards}, ${EDGE_GROUND}, transparent)`;

export const scrollEdgeShade = stylex.create({
  band: {
    inlineSize: vars["--aui-space-16"],
    insetBlock: 0,
    opacity: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  start: {
    backgroundImage: {
      default: shade("right"),
      ":dir(rtl)": shade("left"),
    },
  },
  end: {
    backgroundImage: {
      default: shade("left"),
      ":dir(rtl)": shade("right"),
    },
  },
  visible: {
    opacity: 1,
  },
});
