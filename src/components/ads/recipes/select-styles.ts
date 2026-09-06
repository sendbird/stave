import * as stylex from "@stylexjs/stylex";

import { controlHeightBySize } from "./control-metrics";
import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";

/** A selected row is still a row: the highlight lays its 6% over the fill. */
export const styles = stylex.create({
  field: {
    alignContent: "start",
    display: "grid",
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  label: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightControl,
  },
  trigger: {
    alignItems: "center",
    appearance: "none",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    cursor: "pointer",
    display: "inline-flex",
    // The trigger owns the control's type scale and `value` inherits it, so a
    // scale arm that changes the font size only has to say so once.
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    inlineSize: "100%",
    justifyContent: "space-between",
    // Height comes from the shared control-metrics recipe (applied by the
    // Trigger part from its resolved `size`) — never re-declare minBlockSize
    // here.
    minInlineSize: 0,
    paddingBlock: 0,
  },
  // Height lives in the shared control-metrics recipe.
  // §8 — the padding arms below read `densityPad`, never `spaceN`.
  triggerDense: {
    fontSize: vars.fontSizeCaption,
    paddingInline: densityPad.sm,
  },
  triggerCompact: {
    paddingInline: densityPad.sm,
  },
  triggerRegular: {
    paddingInline: densityPad.md,
  },
  triggerLg: {
    paddingInline: vars.space16,
  },
  value: {
    color: vars.colorText,
    display: "block",
    flex: "1 1 0",
    // Inherited from the trigger, so the `xs` arm needs no value style of
    // its own.
    fontSize: "inherit",
    inlineSize: "100%",
    lineHeight: vars.lineHeightControl,
    minInlineSize: 0,
    overflow: "hidden",
    textAlign: "start",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Selected-value line with an optional leading icon/swatch.
  valueInner: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars.space8,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  valueIcon: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    // The icon now renders inside the same ellipsis-clipped `value` box (see
    // Select.array.tsx bug 7) rather than as a separate flex sibling in the
    // trigger row, so it carries its own trailing gap.
    marginInlineEnd: vars.space8,
  },
  icon: {
    color: vars.colorTextMuted,
    display: "inline-flex",
    flexShrink: 0,
  },
  positioner: {
    zIndex: vars.zIndexDropdown,
  },
  popup: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationOverlay,
    maxBlockSize: "min(320px, var(--available-height, calc(100vh - 32px)))",
    minInlineSize: "min(220px, var(--available-width, 100vw))",
    overflow: "hidden",
    padding: 0,
    // Scroll arrows are absolutely positioned children — anchor them here.
    position: "relative",
  },
  empty: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  item: {
    // Center single-line options in the 32px row — `start` left them
    // top-aligned, which reads as an off/loose line-height.
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderRadius: vars.radiusControl,
    boxSizing: "border-box",
    color: vars.colorText,
    cursor: "pointer",
    display: "grid",
    flexShrink: 0,
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    gridTemplateColumns: `minmax(0, 1fr) ${vars.controlIconSizeLg}`,
    inlineSize: "100%",
    lineHeight: vars.lineHeightControl,
    minBlockSize: vars.menuItemHeight,
    minInlineSize: 0,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
  itemCompact: {
    minBlockSize: vars.controlHeightXs,
    paddingBlock: vars.space4,
  },
  itemDense: {
    fontSize: vars.fontSizeCaption,
    minBlockSize: vars.controlHeightXs,
    paddingBlock: vars.space4,
  },
  itemRegular: {
    minBlockSize: vars.menuItemHeight,
    paddingBlock: vars.space4,
  },
  itemHighlighted: {
    // The pointer/keyboard highlight is a hover, so it takes the hover wash the
    // rest of the system uses. It painted `colorCanvasSubtle` — an opaque
    // Neutral100 — so a menu row lit up a different colour than a button, a
    // tree row or a sidebar item under the same pointer.
    backgroundColor: vars.colorOverlayHover,
  },
  itemSelected: {
    /*
     * No fill. A chosen row is marked by its ink and the indicator at the
     * inline-end, both of which stay put while the pointer moves; the fill in a
     * popup belongs to the pointer alone. It carried the hover value for a
     * while, which meant the chosen row and a pointed-at row were the same
     * colour and the list read as having two active rows.
     */
    color: vars.colorAccent,
  },
  itemDisabled: {
    color: vars.colorTextSubtle,
    cursor: "not-allowed",
  },
  itemIndicator: {
    alignItems: "center",
    // Keep the selection affordance on the trailing edge, matching the Select
    // convention used by Base UI. Explicit placement means compound
    // consumers can keep the natural Indicator → ItemText child order.
    alignSelf: "center",
    color: vars.colorAccent,
    display: "inline-flex",
    gridColumn: "2",
    gridRow: "1",
    inlineSize: vars.controlIconSizeLg,
    justifyContent: "center",
    minBlockSize: vars.controlIconSizeLg,
    minInlineSize: vars.controlIconSizeLg,
  },
  itemIndicatorHidden: {
    opacity: 0,
  },
  itemText: {
    display: "block",
    gridColumn: "1",
    gridRow: "1",
    inlineSize: "100%",
    lineHeight: vars.lineHeightControl,
    maxInlineSize: "100%",
    minInlineSize: 0,
    whiteSpace: "normal",
  },
  itemCopy: {
    alignContent: "center",
    alignSelf: "stretch",
    display: "grid",
    gap: vars.space4,
    inlineSize: "100%",
    lineHeight: vars.lineHeightControl,
    maxInlineSize: "100%",
    minInlineSize: 0,
    whiteSpace: "normal",
  },
  // Label + optional leading icon on one line; description (if any) sits below.
  itemLabelLine: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  itemLeadingIcon: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  itemLabel: {
    // Keep single-line array options on the same crisp 20px line box as the
    // compound ItemText path. A nested normal line-height otherwise undoes the
    // row-level dropdown alignment fix.
    lineHeight: vars.lineHeightControl,
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "ellipsis",
    whiteSpace: "normal",
  },
  itemDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    maxInlineSize: "100%",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
  },
  groupLabel: {
    color: vars.colorTextSubtle,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    // Tight label row (a group label conventionally runs sm; ours is xs + tight so
    // the label never reads taller than the 32px items beneath it).
    lineHeight: vars.lineHeightTight,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
  separator: {
    backgroundColor: vars.colorBorderSubtle,
    blockSize: vars.borderWidthHairline,
    marginBlock: vars.space4,
  },
  /**
   * The trigger's own invalid tone. `Select` set `aria-invalid` and rendered the
   * message but never tinted its border, so an invalid select was the one field
   * in the family whose control said nothing — grey border, red message. Yields
   * to focus exactly like `TextField.danger` (see that file's focus contract).
   */
  /**
   * Open, for a FIELD-shaped trigger. `controlChrome.triggerOpen` washes the
   * fill, which is right for a button that opens an overlay and wrong here: a
   * Select rests, hovers and focuses on its border like a TextField, so a fill
   * appearing only while the list is open made it the one control in the row
   * that greyed out when you clicked it.
   */
  triggerOpen: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorderFocus,
  },
  triggerError: {
    borderColor: {
      default: vars.colorDangerBorder,
      ":focus-within": vars.colorBorderFocus,
    },
  },
  error: {
    // The border's red — one error, one colour. See `Field.tsx`.
    color: vars.colorDanger,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
  },
  // Base UI mounts scroll arrows with inline `position: absolute` but no
  // inset, so without explicit anchoring they float at the popup's top-left.
  // Anchor each edge, span the full width, and paint the popup surface so
  // items scroll underneath cleanly.
  scrollArrow: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceRaised,
    blockSize: 24,
    color: vars.colorTextMuted,
    cursor: "default",
    display: "flex",
    insetInline: 0,
    justifyContent: "center",
    // layer-ok: scroll affordance over this listbox's own options; the popup
    // positioner already carries zIndexDropdown
    zIndex: 1,
    "::after": {
      blockSize: vars.space8,
      content: '""',
      insetInline: 0,
      pointerEvents: "none",
      position: "absolute",
    },
  },
  scrollArrowUp: {
    borderStartEndRadius: vars.radiusPanel,
    borderStartStartRadius: vars.radiusPanel,
    insetBlockStart: 0,
    "::after": {
      backgroundImage: `linear-gradient(to bottom, ${vars.colorSurfaceRaised}, transparent)`,
      insetBlockStart: "100%",
    },
  },
  scrollArrowDown: {
    borderEndEndRadius: vars.radiusPanel,
    borderEndStartRadius: vars.radiusPanel,
    insetBlockEnd: 0,
    "::after": {
      backgroundImage: `linear-gradient(to top, ${vars.colorSurfaceRaised}, transparent)`,
      insetBlockEnd: "100%",
    },
  },
});

// Trigger padding, trigger height, and item metrics, each keyed by the
// canonical `ControlScale` vocabulary (xs/sm/md/lg) so `Select.parts.tsx`
// threads one value from its `size` prop straight into a lookup.
export const triggerStylesBySize = {
  lg: styles.triggerLg,
  md: styles.triggerRegular,
  sm: styles.triggerCompact,
  xs: styles.triggerDense,
} as const;

export const triggerHeightsBySize = controlHeightBySize;

export const itemStylesBySize = {
  lg: styles.itemRegular,
  md: styles.itemRegular,
  sm: styles.itemCompact,
  xs: styles.itemDense,
} as const;
