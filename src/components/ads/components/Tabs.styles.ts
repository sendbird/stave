import * as stylex from "@stylexjs/stylex";

import { controlHeightBySize } from "../recipes/control-metrics";
import { vars } from "../tokens/tokens.stylex";

/**
 * `Tabs`'s styles, split into their own module when the vertical-orientation,
 * `size`, and lazy-`mount` additions pushed `Tabs.tsx` past the repo's
 * 500-line-growth ratchet — the same split `Command.styles.ts` and
 * `DataTable.styles.ts` already use.
 */

/**
 * Reserved height for the panel viewport, in px.
 *
 * Sibling tab panels routinely differ in height; without a floor the surface
 * under the tab strip collapses and the page jumps every time the active tab
 * changes. 96px is three default 32px item rows — the shortest panel that still
 * reads as a content area rather than a gap. Kept local rather than tokenized:
 * it is a layout floor for this one surface, not a shared metric, and binding
 * it to `menuItemHeight` would make an unrelated density knob resize tabs.
 */
const PANEL_VIEWPORT_MIN_BLOCK_SIZE = 96;

/**
 * `size` → shared control-ramp height for the tab trigger. See `TabsSize` for
 * why the names are offset one rung from the ramp step they resolve to.
 */
export const tabHeightBySize = {
  md: controlHeightBySize.sm,
  sm: controlHeightBySize.xs,
} as const;

export const styles = stylex.create({
  root: {
    display: "grid",
    gap: vars.space12,
    minInlineSize: 0,
  },
  // A vertical strip is the same grid turned on its side: rail, then panels.
  // `alignItems: start` keeps the rail shrink-wrapped to its own tabs instead
  // of stretching its track down the full height of the tallest panel, which
  // is what makes it read as a rail and not a sidebar.
  rootVertical: {
    alignItems: "start",
    gridTemplateColumns: "auto minmax(0, 1fr)",
  },
  // The track is `colorSurfaceTint`, not `colorCanvasSubtle`. Subtle is the
  // *interaction wash*, and in dark it sits at L 0.272 — ABOVE the raised
  // surface (0.238) the pill paints with, so the selected pill rendered darker
  // than the track it was supposed to lift off while still carrying a lift
  // shadow. `colorSurfaceTint` is the recessed role and runs the correct
  // direction in every theme: light 0.975 under a 1.0 pill, dark 0.224 under a
  // 0.238 pill, high contrast 0.967 under 1.0.
  list: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceTint,
    borderRadius: vars.radiusControl,
    display: "inline-flex",
    gap: vars.space4,
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflowX: "auto",
    padding: vars.space4,
    position: "relative",
  },
  // `stretch` (not the horizontal `center`) so every tab is as wide as the
  // widest label: a column of centre-shrunk chips has a ragged edge on both
  // sides, and the indicator would then change width as it travels.
  listVertical: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  tab: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // Same quiet language as every other borderless control in the system
    // (`controlChrome.triggerQuiet`, `surfaceChrome.quietIconButton`): muted at
    // rest, full ink under the cursor. An inactive tab used to have NO hover
    // state at all, so the only tab that ever reacted was the one you had
    // already selected. Colour only — a background wash here would fight the
    // gliding indicator that shares the tab's box.
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    cursor: "pointer",
    display: "inline-flex",
    // A tab is an atomic label. Without these two the list's `overflow-x:
    // auto` never engages: flex first crushes each tab to min-content and the
    // label wraps to two lines, which puts the active indicator mid-word — it
    // read as a strikethrough in narrow artifact selectors.
    flexShrink: 0,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    justifyContent: "center",
    // Height comes from the shared control-metrics recipe (`controlHeights.xs`,
    // composed at the call site): 28px trigger inside the space1-padded list =
    // 36px total (the 36px baseline control height), bumped to 44px under
    // `(pointer: coarse)` for the touch-target minimum.
    paddingBlock: 0,
    paddingInline: vars.space12,
    position: "relative",
    whiteSpace: "nowrap",
    // layer-ok: keeps the label above this tab list's own sliding indicator
    zIndex: 1,
  },
  // Labels read down a common left edge in a rail; centring them there would
  // make the column of text ragged on both sides.
  tabVertical: {
    justifyContent: "flex-start",
  },
  // Flat colors on purpose: they replace the base hover pair outright, so an
  // active tab stays at full ink and a disabled one never brightens.
  tabActive: {
    color: vars.colorText,
  },
  // The fade + cursor come from `controlChrome.disabled` (composed at the call
  // site) — the one disabled language. This only pins the color flat so a
  // disabled tab cannot brighten under the cursor; `opacity: 0.56` on top of an
  // already-subtle ink was a second, unshared dim.
  tabDisabled: {
    color: vars.colorTextMuted,
  },
  indicator: {
    // Position + size come from Base UI's measured `--active-tab-*` vars.
    // Movement is animated by Motion's `layout` spring (Motion owns transform),
    // so this layer declares NO transition — see the `Indicator` part above.
    inlineSize: "var(--active-tab-width)",
    insetInlineStart: "var(--active-tab-left)",
    position: "absolute",
    // layer-ok: seats this tab list's indicator beneath its own labels
    zIndex: 0,
  },
  // One fill + one shadow, no border. §1.7 sanctions "a pill on a track" as the
  // whole signal for an active tab; painting fill AND hairline AND elevation on
  // a 28px chip made it heavier than the Button beside it, which is flat by
  // decision (`elevation0`, `Button.tsx`).
  indicatorPill: {
    backgroundColor: vars.colorSurfaceRaised,
    blockSize: "var(--active-tab-height)",
    borderRadius: vars.radiusControl,
    boxShadow: vars.elevationRaised,
    insetBlockStart: "var(--active-tab-top)",
  },
  // `ringWidthSm` IS 2px and exists to name a 2px emphasis mark, so the bar
  // takes it rather than a literal. It is anchored to the list's own bottom
  // edge instead of the tab box: at `tab-top + tab-height` the bar stopped
  // exactly where the list's 1px bottom rule began and the two stacked into a
  // 3px mark. Pulling it down by the hairline makes the bar cover the rule,
  // which is what an underlined tab strip actually looks like.
  indicatorLine: {
    backgroundColor: vars.colorAccent,
    blockSize: vars.ringWidthSm,
    borderRadius: vars.radiusFull,
    insetBlockStart: `calc(var(--active-tab-top) + var(--active-tab-height) - ${vars.ringWidthSm})`,
  },
  // The vertical bar swaps the two axes of `indicatorLine`: it spans the tab's
  // height and is `ringWidthSm` wide, pinned to the tab's own inline-start
  // edge. No hairline correction here, unlike the horizontal bar — the rule it
  // covers is at the START of the list's inline axis, so the bar and the rule
  // already share an origin instead of meeting end-to-end.
  indicatorLineVertical: {
    blockSize: "var(--active-tab-height)",
    inlineSize: vars.ringWidthSm,
    insetBlockStart: "var(--active-tab-top)",
  },
  // The baseline rule is an INSET shadow, not `border-block-end`. As a border it
  // sat outside the padding box, where the list's own `overflow` clips — so the
  // 2px active bar could never reach it and the two stacked into a 3px mark
  // (2px bar, then 1px rule directly under it). As an inset hairline the rule
  // is painted inside the same box the indicator lives in, and the bar covers
  // it exactly the way an underlined tab strip is supposed to read.
  listLine: {
    backgroundColor: "transparent",
    borderRadius: 0,
    boxShadow: `inset 0 calc(-1 * ${vars.borderWidthHairline}) 0 0 ${vars.colorBorder}`,
    gap: vars.space8,
    padding: 0,
  },
  // Same inset-shadow trick as `listLine`, moved to the inline-start edge so a
  // vertical rail gets the rule the bar rides on. It replaces `listLine`'s
  // shadow outright (one `box-shadow` property, last write wins) rather than
  // adding a second, which is what would draw an L.
  listLineVertical: {
    boxShadow: `inset ${vars.borderWidthHairline} 0 0 0 ${vars.colorBorder}`,
  },
  panelViewport: {
    minBlockSize: PANEL_VIEWPORT_MIN_BLOCK_SIZE,
    minInlineSize: 0,
  },
  panel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
  },
});
