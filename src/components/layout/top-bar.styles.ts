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
    borderRadius: vars["--ads-radius-control"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
    height: vars["--ads-control-height-sm"],
    lineHeight: vars["--ads-line-height-control"],
    paddingInline: vars["--ads-space-8"],
  },
  /** Bordered chrome fill shared by the path chip, branch chip, and buttons. */
  surface: {
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderColor: vars["--ads-color-border-subtle"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  /** Square the control and drop the inline gutter for glyph-only triggers. */
  iconOnly: {
    justifyContent: "center",
    paddingInline: 0,
    width: vars["--ads-control-height-sm"],
  },
  /** Glyphs inside a `sm` control: the ADS rung, not a hand-picked 12/14/16. */
  icon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
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
    backgroundColor: vars["--ads-color-surface"],
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    height: "3rem",
    justifyContent: "space-between",
    paddingInline: "0.875rem",
    position: "relative",
    zIndex: vars["--ads-z-index-app-chrome"],
  },
  lead: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  sidebarToggle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    flexShrink: 0,
    height: vars["--ads-control-height-sm"],
    padding: 0,
    width: vars["--ads-control-height-sm"],
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
    fontFamily: vars["--ads-font-mono"],
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
    opacity: { default: 1, ":disabled": vars["--ads-opacity-disabled"] },
  },
  trail: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars["--ads-space-8"],
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
    gap: vars["--ads-space-8"],
  },
});
