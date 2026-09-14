import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

// Hover and pressed washes for this file's OPAQUE resting fills. A translucent
// overlay cannot be painted onto one without dropping the fill itself, so the
// same operand is applied the other way, at the same 6/12 weights. sRGB, not
// oklab: an oklab mix is nearly invisible over a near-black fill.
const raisedWashHover = `color-mix(in srgb, ${vars["--ads-color-surface-raised"]}, ${vars["--ads-color-mix-ink"]} 6%)`;
/**
 * AppShell stylesheet, part 2 of 2 — see `AppShell.shell.styles.ts`.
 */
export const sidebarStyles = stylex.create({
  sidebarGroupHeader: {
    alignItems: "center",
    display: "grid",
    gap: vars["--ads-space-4"],
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minInlineSize: 0,
  },
  sidebarGroupTrigger: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-subtle"],
    cursor: "pointer",
    display: "grid",
    // Matches `sidebarGroupLabel`, the non-collapsible variant of this same
    // role. Without them a bare <button> takes the UA's own font-size (13.33px
    // in Chrome, off the type scale) and weight 400, so the two variants of one
    // label rendered a step apart.
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
    gridTemplateColumns: "minmax(0, 1fr) auto",
    inlineSize: "100%",
    minBlockSize: vars["--ads-control-height-xs"],
    minInlineSize: 0,
    paddingBlock: 0,
    // The chevron used to carry its own `marginInlineEnd: space8` while the
    // trigger had `padding: 0`; now the trailing inset belongs to the row, so
    // the glyph lines up with every other trailing control in the rail.
    paddingInlineEnd: vars["--ads-space-8"],
    paddingInlineStart: 0,
    textAlign: "start",
  },
  sidebarGroupTriggerHidden: {
    display: "none",
  },
  sidebarGroupLabel: {
    // The label is smaller than the 14px navigation rows, so strong text ink
    // lets it read as the heading for those rows instead of as another quiet
    // item. Size and weight still keep it below a section title.
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    // Medium, not semibold: the stronger ink supplies the hierarchy without
    // making a 12px rail label heavier than selected navigation at 500.
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    // Keep the label connected to the rows it heads (4px after the text) while
    // adding one spacing step before it. With SidebarContent's compact 8px gap,
    // successive groups now read as 16px apart above and 8px within below.
    paddingBlockEnd: vars["--ads-space-4"],
    paddingBlockStart: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sidebarGroupLabelCollapsed: {
    display: "none",
  },
  sidebarGroupContent: {
    display: "grid",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  sidebarGroupContentHidden: {
    display: "none",
  },
  sidebarGroupAction: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-subtle"],
    cursor: "pointer",
    display: "inline-flex",
    fontSize: vars["--ads-font-size-caption"],
    justifyContent: "center",
    minBlockSize: vars["--ads-control-height-xs"],
    minInlineSize: vars["--ads-control-height-xs"],
    padding: 0,
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionProperty: "background-color, color",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  sidebarGroupActionCollapsed: {
    display: "none",
  },
  sidebarMenu: {
    display: "grid",
    gap: vars["--ads-space-4"],
    listStyle: "none",
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  sidebarMenuItem: {
    alignItems: "center",
    display: "grid",
    gap: 0,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minInlineSize: 0,
    // Containing block for `sidebarMenuActionFloating`.
    position: "relative",
  },
  sidebarItem: {
    alignItems: "center",
    appearance: "none",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "background-color, color",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    borderWidth: 0,
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
    cursor: "pointer",
    display: "grid",
    fontFamily: "inherit",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    gridTemplateColumns: `${vars["--ads-control-icon-size-lg"]} minmax(0, 1fr) auto`,
    inlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
    textAlign: "start",
    textDecoration: "none",
    // The press step is the same wash as hover, matching `sidebarItemOutline`
    // and the shared quiet-control language (`recipes/control-chrome.ts`).
    // Without it a nav row was dead under the finger on touch, where there is
    // no hover state to stand in for the press.
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  sidebarItemOutline: {
    backgroundColor: {
      default: vars["--ads-color-surface-raised"],
      ":hover": raisedWashHover,
    },
    borderColor: vars["--ads-color-border"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  sidebarItemSm: {
    fontSize: vars["--ads-font-size-caption"],
  },
  /**
   * Two-line identity row (`description` set): the label keeps the rail's own
   * 14px and the second line supplies the hierarchy, so the row needs vertical
   * padding the single-line rows do not.
   *
   * `size="lg"` deliberately does NOT change the font any more. It used to
   * raise the label to `fontSizeLead` (15px), which made the workspace switcher
   * and the account row the largest text in a rail whose every other row is
   * 14px — read as "weirdly big", not as hierarchy. The `lg` step is a HEIGHT
   * step (40px via `controlHeights.lg`), matching how the rest of the system
   * scales `size` and how a sidebar `lg` row behaves in the references.
   */
  sidebarItemStacked: {
    paddingBlock: vars["--ads-space-4"],
  },
  sidebarItemCopy: {
    display: "grid",
    minInlineSize: 0,
  },
  sidebarDescription: {
    color: vars["--ads-color-text-subtle"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    // Stated explicitly: `sidebarItemCurrent` raises the ROW to medium, and the
    // secondary line must stay the quieter of the two in every state.
    fontWeight: vars["--ads-font-weight-regular"],
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sidebarItemCollapsed: {
    fontSize: 0,
    gap: 0,
    gridTemplateColumns: "minmax(0, 1fr)",
    justifyItems: "center",
    justifySelf: "center",
    paddingInline: 0,
  },
  sidebarItemNoIcon: {
    gridTemplateColumns: "minmax(0, 1fr) auto",
  },
  sidebarItemCurrent: {
    backgroundColor: vars["--ads-color-selection-fill"],
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  sidebarItemDisabled: {
    // The menu button marks disabled with `aria-disabled` on both its <button>
    // and <a> branches and never with the native attribute, so without this the
    // hover wash and press fill still ran on an item whose href is stripped.
    backgroundColor: "transparent",
    color: vars["--ads-color-text-subtle"],
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
  sidebarIcon: {
    alignItems: "center",
    blockSize: vars["--ads-control-icon-size-lg"],
    display: "inline-flex",
    inlineSize: vars["--ads-control-icon-size-lg"],
    justifyContent: "center",
    overflow: "hidden",
  },
  sidebarIconCurrent: {
    color: vars["--ads-color-accent"],
  },
  sidebarIconCollapsed: {
    justifyContent: "center",
  },
  sidebarLabel: {
    // Explicitly a block box: `text-overflow` applies to block containers only.
    // A grid item is blockified anyway, but stating it keeps the clamp true if
    // the row's own `display` ever changes (the flex sibling below is exactly
    // the bug that shape produces).
    display: "block",
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Collapsed, the label leaves the layout but MUST stay in the accessibility
  // tree — it is the only text a rail control has, so `display: none` here is
  // what made every primary nav control announce as an unnamed button/link.
  // Same visually-hidden shape as `DataTable.tsx`; the font size is restored
  // because the collapsed row sets `fontSize: 0`, and text at zero size is a
  // name no assistive tech should have to guess at.
  sidebarLabelCollapsed: {
    blockSize: 1,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    display: "block",
    fontSize: vars["--ads-font-size-body"],
    inlineSize: 1,
    // Pinned: an auto-inset absolute box adds phantom scrollable overflow at
    // its static position (see VisuallyHidden.tsx).
    insetBlockStart: 0,
    insetInlineStart: 0,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
  },
  sidebarMenuSubItem: {
    minInlineSize: 0,
  },
  sidebarSubButton: {
    alignItems: "center",
    appearance: "none",
    borderWidth: 0,
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
    cursor: "pointer",
    display: "flex",
    fontFamily: "inherit",
    fontSize: vars["--ads-font-size-body"],
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
    textAlign: "start",
    textDecoration: "none",
    // No `textOverflow` here: this box is `display: flex`, and the clamp only
    // works on the block child (`sidebarSubLabel`) the component wraps a
    // plain-string label in. Declaring it here read as truncation support and
    // delivered a hard mid-glyph clip.
    whiteSpace: "nowrap",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  sidebarSubLabel: {
    display: "block",
    flexGrow: 1,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sidebarSubButtonSm: {
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: vars["--ads-control-height-xs"],
    paddingBlock: 0,
  },
  sidebarSubButtonCurrent: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  sidebarTooltip: {
    backgroundColor: vars["--ads-color-text"],
    borderRadius: vars["--ads-radius-control"],
    boxShadow: vars["--ads-elevation-overlay"],
    color: vars["--ads-color-text-inverted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    maxInlineSize: 220,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
    zIndex: vars["--ads-z-index-dropdown"],
  },
  sidebarTooltipArrow: {
    color: vars["--ads-color-text"],
  },
  sidebarSkeleton: {
    alignItems: "center",
    display: "grid",
    gap: vars["--ads-space-8"],
    gridColumn: "1 / -1",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    minInlineSize: 0,
    paddingInline: vars["--ads-space-8"],
  },
  sidebarSkeletonCollapsed: {
    gridTemplateColumns: "minmax(0, 1fr)",
    justifyItems: "center",
    paddingInline: 0,
  },
  sidebarSkeletonIcon: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-full"],
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  sidebarSkeletonLabel: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    blockSize: 10,
    borderRadius: vars["--ads-radius-full"],
    inlineSize: "68%",
    minInlineSize: 0,
  },
});
