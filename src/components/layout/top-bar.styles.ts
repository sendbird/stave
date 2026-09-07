import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * The single geometry + type contract for every control that sits directly in
 * the 48px top bar: the workspace-path chip, its "open in…" trigger, the branch
 * switcher, "Commit graph", and the PR trigger. Before this recipe each of them
 * hand-rolled `height: 28`, `gap: 6`, `paddingInline: "0.625rem"` and picked its
 * own font weight, so the row read as five slightly different controls.
 *
 * One rung of the ADS control ramp (`sm`, 32px) for the whole row, centred in a
 * 48px bar with 8px of air above and below. The label stays on
 * `fontSizeCaption` + `fontWeightMedium` for every control including the
 * primary "Create PR" one: the bar is a dense chrome row read as a unit, and a
 * single 14px label among 12px siblings is exactly the mismatch being fixed.
 * Emphasis in this row is carried by fill and border, not by type size.
 */
export const topBarControlStyles = stylex.create({
  control: {
    alignItems: "center",
    borderRadius: vars.radiusControl,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space8,
    height: vars.controlHeightSm,
    lineHeight: vars.lineHeightControl,
    paddingInline: vars.space8,
  },
  /** Bordered chrome fill shared by the path chip, branch chip, and buttons. */
  surface: {
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorOverlayHover,
    },
    borderColor: vars.colorBorderSubtle,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  /** Square the control and drop the inline gutter for glyph-only triggers. */
  iconOnly: {
    justifyContent: "center",
    paddingInline: 0,
    width: vars.controlHeightSm,
  },
  /** Glyphs inside a `sm` control: the ADS rung, not a hand-picked 12/14/16. */
  icon: {
    blockSize: vars.controlIconSizeSm,
    flexShrink: 0,
    inlineSize: vars.controlIconSizeSm,
  },
});

/**
 * Top bar chrome. The header itself is the macOS drag region, so its geometry
 * (height, padding, the no-drag islands inside it) is behavioral, not
 * decorative — keep the measurements literal rather than re-deriving them.
 */
export const topBarStyles = stylex.create({
  header: {
    alignItems: "center",
    backgroundColor: vars.colorSurface,
    borderBottomColor: vars.colorBorderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    height: "3rem",
    justifyContent: "space-between",
    paddingInline: "0.875rem",
    position: "relative",
    zIndex: vars.zIndexAppChrome,
  },
  lead: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    minWidth: 0,
  },
  sidebarToggle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    borderRadius: vars.radiusControl,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    flexShrink: 0,
    height: vars.controlHeightSm,
    padding: 0,
    width: vars.controlHeightSm,
  },
  pathGroup: { alignItems: "center", display: "flex", minWidth: 0 },
  // Composed after `topBarControlStyles.control` + `.surface`; this only
  // states what makes it the leading half of a segmented pair.
  pathChip: {
    borderEndEndRadius: 0,
    borderInlineEndWidth: 0,
    borderStartEndRadius: 0,
    maxWidth: 220,
  },
  pathLabel: {
    fontFamily: vars.fontMono,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pathMenuTrigger: {
    borderEndStartRadius: 0,
    borderStartStartRadius: 0,
  },
  pathMenu: { minWidth: 184 },
  // Geometry and type come from `topBarControlStyles`; nothing left to say.
  gitGraphButton: {
    opacity: { default: 1, ":disabled": vars.opacityDisabled },
  },
  trail: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars.space8,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  // The file search only earns its width on a wide window; below `lg` the slot
  // collapses entirely rather than competing with the action cluster.
  searchSlot: {
    display: { default: "none", "@media (min-width: 64rem)": "flex" },
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  windowControls: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
  },
});
