import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

// Hover and pressed washes for this file's OPAQUE resting fills. A translucent
// overlay cannot be painted onto one without dropping the fill itself, so the
// same operand is applied the other way, at the same 6/12 weights. sRGB, not
// oklab: an oklab mix is nearly invisible over a near-black fill.
const raisedWashHover = `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 6%)`;
/**
 * AppShell stylesheet, part 2 of 2 — see `AppShell.shell.styles.ts`.
 */
export const sidebarStyles = stylex.create({
  sidebarGroupHeader: {
    alignItems: "center",
    display: "grid",
    gap: vars.space4,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minInlineSize: 0,
  },
  sidebarGroupTrigger: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextSubtle,
    cursor: "pointer",
    display: "grid",
    // Matches `sidebarGroupLabel`, the non-collapsible variant of this same
    // role. Without them a bare <button> takes the UA's own font-size (13.33px
    // in Chrome, off the type scale) and weight 400, so the two variants of one
    // label rendered a step apart.
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    inlineSize: "100%",
    minBlockSize: vars.controlHeightXs,
    minInlineSize: 0,
    paddingBlock: 0,
    // The chevron used to carry its own `marginInlineEnd: space8` while the
    // trigger had `padding: 0`; now the trailing inset belongs to the row, so
    // the glyph lines up with every other trailing control in the rail.
    paddingInlineEnd: vars.space8,
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
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    // Medium, not semibold: the stronger ink supplies the hierarchy without
    // making a 12px rail label heavier than selected navigation at 500.
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    overflow: "hidden",
    // Keep the label connected to the rows it heads (4px after the text) while
    // adding one spacing step before it. With SidebarContent's compact 8px gap,
    // successive groups now read as 16px apart above and 8px within below.
    paddingBlockEnd: vars.space4,
    paddingBlockStart: vars.space8,
    paddingInline: vars.space8,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sidebarGroupLabelCollapsed: {
    display: "none",
  },
  sidebarGroupContent: {
    display: "grid",
    gap: vars.space4,
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
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextSubtle,
    cursor: "pointer",
    display: "inline-flex",
    fontSize: vars.fontSizeCaption,
    justifyContent: "center",
    minBlockSize: vars.controlHeightXs,
    minInlineSize: vars.controlHeightXs,
    padding: 0,
    transitionDuration: vars.motionDurationFast,
    transitionProperty: "background-color, color",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  sidebarGroupActionCollapsed: {
    display: "none",
  },
  sidebarMenu: {
    display: "grid",
    gap: vars.space4,
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
      default: vars.motionDurationFast,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "background-color, color",
    transitionTimingFunction: vars.motionEaseStandard,
    borderWidth: 0,
    borderRadius: vars.radiusControl,
    color: vars.colorTextMuted,
    cursor: "pointer",
    display: "grid",
    fontFamily: "inherit",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    gridTemplateColumns: `${vars.controlIconSizeLg} minmax(0, 1fr) auto`,
    inlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars.space8,
    textAlign: "start",
    textDecoration: "none",
    // The press step is the same wash as hover, matching `sidebarItemOutline`
    // and the shared quiet-control language (`recipes/control-chrome.ts`).
    // Without it a nav row was dead under the finger on touch, where there is
    // no hover state to stand in for the press.
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
  },
  sidebarItemOutline: {
    backgroundColor: {
      default: vars.colorSurfaceRaised,
      ":hover": raisedWashHover,
    },
    borderColor: vars.colorBorder,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  sidebarItemSm: {
    fontSize: vars.fontSizeCaption,
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
    paddingBlock: vars.space4,
  },
  sidebarItemCopy: {
    display: "grid",
    minInlineSize: 0,
  },
  sidebarDescription: {
    color: vars.colorTextSubtle,
    display: "block",
    fontSize: vars.fontSizeCaption,
    // Stated explicitly: `sidebarItemCurrent` raises the ROW to medium, and the
    // secondary line must stay the quieter of the two in every state.
    fontWeight: vars.fontWeightRegular,
    lineHeight: vars.lineHeightTight,
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
    backgroundColor: vars.colorSelectionFill,
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  sidebarItemDisabled: {
    // The menu button marks disabled with `aria-disabled` on both its <button>
    // and <a> branches and never with the native attribute, so without this the
    // hover wash and press fill still ran on an item whose href is stripped.
    backgroundColor: "transparent",
    color: vars.colorTextSubtle,
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  sidebarIcon: {
    alignItems: "center",
    blockSize: vars.controlIconSizeLg,
    display: "inline-flex",
    inlineSize: vars.controlIconSizeLg,
    justifyContent: "center",
    overflow: "hidden",
  },
  sidebarIconCurrent: {
    color: vars.colorAccent,
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
    lineHeight: vars.lineHeightTight,
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
    fontSize: vars.fontSizeBody,
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
    borderRadius: vars.radiusControl,
    color: vars.colorTextMuted,
    cursor: "pointer",
    display: "flex",
    fontFamily: "inherit",
    fontSize: vars.fontSizeBody,
    inlineSize: "100%",
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars.space8,
    textAlign: "start",
    textDecoration: "none",
    // No `textOverflow` here: this box is `display: flex`, and the clamp only
    // works on the block child (`sidebarSubLabel`) the component wraps a
    // plain-string label in. Declaring it here read as truncation support and
    // delivered a hard mid-glyph clip.
    whiteSpace: "nowrap",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
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
    fontSize: vars.fontSizeCaption,
    minBlockSize: vars.controlHeightXs,
    paddingBlock: 0,
  },
  sidebarSubButtonCurrent: {
    color: vars.colorText,
    fontWeight: vars.fontWeightSemibold,
  },
  sidebarTooltip: {
    backgroundColor: vars.colorText,
    borderRadius: vars.radiusControl,
    boxShadow: vars.elevationOverlay,
    color: vars.colorTextInverted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    maxInlineSize: 220,
    paddingBlock: vars.space8,
    paddingInline: vars.space8,
    zIndex: vars.zIndexDropdown,
  },
  sidebarTooltipArrow: {
    color: vars.colorText,
  },
  sidebarSkeleton: {
    alignItems: "center",
    display: "grid",
    gap: vars.space8,
    gridColumn: "1 / -1",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    minInlineSize: 0,
    paddingInline: vars.space8,
  },
  sidebarSkeletonCollapsed: {
    gridTemplateColumns: "minmax(0, 1fr)",
    justifyItems: "center",
    paddingInline: 0,
  },
  sidebarSkeletonIcon: {
    backgroundColor: vars.colorCanvasSubtle,
    borderRadius: vars.radiusFull,
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  sidebarSkeletonLabel: {
    backgroundColor: vars.colorCanvasSubtle,
    blockSize: 10,
    borderRadius: vars.radiusFull,
    inlineSize: "68%",
    minInlineSize: 0,
  },
});

