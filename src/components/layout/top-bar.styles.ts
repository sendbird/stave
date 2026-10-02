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
    // One line at one height. A host-layout button does not get the ADS
    // control's `nowrap`, so a two-word label ("Commit graph") inside a
    // shrinking tooltip wrapper would otherwise break and spill over its
    // neighbour on a tight bar.
    whiteSpace: "nowrap",
  },
  /** Bordered chrome fill shared by the path chip, branch chip, Commit graph, and buttons. */
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
 * The bar is the container its contents measure, so what gives way depends on
 * the bar's own width (after the sidebar), not the window's. As it narrows:
 * "Commit graph" keeps its icon only (`< 60rem`), then the file search goes
 * (`< 56rem`); whenever the lead still runs out of room the workspace path
 * truncates. The action groups never shrink, so nothing in the bar can slide
 * under anything else.
 */
const TOP_BAR_SEARCH = "@container topBar (min-width: 56rem)";
const TOP_BAR_LABELS = "@container topBar (min-width: 60rem)";

/**
 * Top bar chrome. The header itself is the macOS drag region, so its geometry
 * (height, padding, the no-drag islands inside it) is behavioral, not
 * decorative — keep the measurements literal rather than re-deriving them.
 */
export const topBarStyles = stylex.create({
  header: {
    containerName: "topBar",
    containerType: "inline-size",
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
  // The lead may shrink (the path truncates); the trailing groups may not.
  lead: {
    alignItems: "center",
    display: "flex",
    flexShrink: 1,
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
  pathGroup: { alignItems: "center", display: "flex", flexShrink: 1, minWidth: 0 },
  // Composed after `topBarControlStyles.control` + `.surface`; this only
  // states what makes it the leading half of a segmented pair.
  pathChip: {
    borderEndEndRadius: 0,
    borderInlineEndWidth: 0,
    borderStartEndRadius: 0,
    flexShrink: 1,
    maxWidth: 220,
    minWidth: 72,
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
  // Geometry, type and fill come from `topBarControlStyles`; only the
  // disabled fade (no active workspace) is local, as on the PR trigger.
  gitGraphButton: {
    opacity: { default: 1, ":disabled": vars["--ads-opacity-disabled"] },
  },
  // A text label that steps aside for its icon on a narrow bar; the
  // control's `aria-label` and tooltip still name it.
  collapsibleLabel: { display: { default: "none", [TOP_BAR_LABELS]: "inline" } },
  // `min-content`, not `0`: the trail can give up the search's width but never
  // its buttons', which used to slide under the lead on a narrow window.
  trail: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
    minWidth: "min-content",
  },
  // The file search only earns its width on a wide bar; below the step the
  // slot collapses entirely rather than competing with the action groups.
  // When it shows it keeps a usable width and the path truncates instead.
  searchSlot: {
    display: { default: "none", [TOP_BAR_SEARCH]: "flex" },
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 160,
  },
  // Icon buttons in one group sit closer to each other than to the next
  // group, which a hairline rule also separates.
  actionGroup: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
  },
  windowControls: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
  },
});
