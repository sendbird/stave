import * as stylex from "@stylexjs/stylex";

import { controlHeightBySize } from "./control-metrics";
import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";

/** A selected row is still a row: the highlight lays its 6% over the fill. */
export const styles = stylex.create({
  field: {
    alignContent: "start",
    display: "grid",
    gap: vars["--ads-space-8"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  label: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-control"],
  },
  trigger: {
    alignItems: "center",
    appearance: "none",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    cursor: "pointer",
    display: "inline-flex",
    // The trigger owns the control's type scale and `value` inherits it, so a
    // scale arm that changes the font size only has to say so once.
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
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
    fontSize: vars["--ads-font-size-caption"],
    paddingInline: densityPad.sm,
  },
  triggerCompact: {
    paddingInline: densityPad.sm,
  },
  triggerRegular: {
    paddingInline: densityPad.md,
  },
  triggerLg: {
    paddingInline: vars["--ads-space-16"],
  },
  value: {
    color: vars["--ads-color-text"],
    display: "block",
    flex: "1 1 0",
    // Inherited from the trigger, so the `xs` arm needs no value style of
    // its own.
    fontSize: "inherit",
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-control"],
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
    gap: vars["--ads-space-8"],
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
    marginInlineEnd: vars["--ads-space-8"],
  },
  icon: {
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
  },
  positioner: {
    zIndex: vars["--ads-z-index-dropdown"],
  },
  popup: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-overlay"],
    maxBlockSize: "min(320px, var(--available-height, calc(100vh - 32px)))",
    minInlineSize: "min(220px, var(--available-width, 100vw))",
    overflow: "hidden",
    padding: 0,
    // Scroll arrows are absolutely positioned children — anchor them here.
    position: "relative",
  },
  empty: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    overflowWrap: "anywhere",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  item: {
    // Center single-line options in the 32px row — `start` left them
    // top-aligned, which reads as an off/loose line-height.
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderRadius: vars["--ads-radius-control"],
    boxSizing: "border-box",
    color: vars["--ads-color-text"],
    cursor: "pointer",
    display: "grid",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    gridTemplateColumns: `minmax(0, 1fr) ${vars["--ads-control-icon-size-lg"]}`,
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-control"],
    minBlockSize: vars["--ads-menu-item-height"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  itemCompact: {
    minBlockSize: vars["--ads-control-height-xs"],
    paddingBlock: vars["--ads-space-4"],
  },
  itemDense: {
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: vars["--ads-control-height-xs"],
    paddingBlock: vars["--ads-space-4"],
  },
  itemRegular: {
    minBlockSize: vars["--ads-menu-item-height"],
    paddingBlock: vars["--ads-space-4"],
  },
  itemHighlighted: {
    // The pointer/keyboard highlight is a hover, so it takes the hover wash the
    // rest of the system uses. It painted `colorCanvasSubtle` — an opaque
    // Neutral100 — so a menu row lit up a different colour than a button, a
    // tree row or a sidebar item under the same pointer.
    backgroundColor: vars["--ads-color-overlay-hover"],
  },
  itemSelected: {
    /*
     * No fill. A chosen row is marked by its ink and the indicator at the
     * inline-end, both of which stay put while the pointer moves; the fill in a
     * popup belongs to the pointer alone. It carried the hover value for a
     * while, which meant the chosen row and a pointed-at row were the same
     * colour and the list read as having two active rows.
     */
    color: vars["--ads-color-accent"],
  },
  itemDisabled: {
    color: vars["--ads-color-text-subtle"],
    cursor: "not-allowed",
  },
  itemIndicator: {
    alignItems: "center",
    // Keep the selection affordance on the trailing edge, matching the Select
    // convention used by Base UI. Explicit placement means compound
    // consumers can keep the natural Indicator → ItemText child order.
    alignSelf: "center",
    color: vars["--ads-color-accent"],
    display: "inline-flex",
    gridColumn: "2",
    gridRow: "1",
    inlineSize: vars["--ads-control-icon-size-lg"],
    justifyContent: "center",
    minBlockSize: vars["--ads-control-icon-size-lg"],
    minInlineSize: vars["--ads-control-icon-size-lg"],
  },
  itemIndicatorHidden: {
    opacity: 0,
  },
  itemText: {
    display: "block",
    gridColumn: "1",
    gridRow: "1",
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-control"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    whiteSpace: "normal",
  },
  itemCopy: {
    alignContent: "center",
    alignSelf: "stretch",
    display: "grid",
    gap: vars["--ads-space-4"],
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-control"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    whiteSpace: "normal",
  },
  // Label + optional leading icon on one line; description (if any) sits below.
  itemLabelLine: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
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
    lineHeight: vars["--ads-line-height-control"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "ellipsis",
    whiteSpace: "normal",
  },
  itemDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    maxInlineSize: "100%",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
  },
  groupLabel: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    // Tight label row (a group label conventionally runs sm; ours is xs + tight so
    // the label never reads taller than the 32px items beneath it).
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  separator: {
    backgroundColor: vars["--ads-color-border-subtle"],
    blockSize: vars["--ads-border-width-hairline"],
    marginBlock: vars["--ads-space-4"],
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
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border-focus"],
  },
  triggerError: {
    borderColor: {
      default: vars["--ads-color-danger-border"],
      ":focus-within": vars["--ads-color-border-focus"],
    },
  },
  error: {
    // The border's red — one error, one colour. See `Field.tsx`.
    color: vars["--ads-color-danger"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    overflowWrap: "anywhere",
  },
  // Base UI mounts scroll arrows with inline `position: absolute` but no
  // inset, so without explicit anchoring they float at the popup's top-left.
  // Anchor each edge, span the full width, and paint the popup surface so
  // items scroll underneath cleanly.
  scrollArrow: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-raised"],
    blockSize: 24,
    color: vars["--ads-color-text-muted"],
    cursor: "default",
    display: "flex",
    insetInline: 0,
    justifyContent: "center",
    // layer-ok: scroll affordance over this listbox's own options; the popup
    // positioner already carries zIndexDropdown
    zIndex: 1,
    "::after": {
      blockSize: vars["--ads-space-8"],
      content: '""',
      insetInline: 0,
      pointerEvents: "none",
      position: "absolute",
    },
  },
  scrollArrowUp: {
    borderStartEndRadius: vars["--ads-radius-panel"],
    borderStartStartRadius: vars["--ads-radius-panel"],
    insetBlockStart: 0,
    "::after": {
      backgroundImage: `linear-gradient(to bottom, ${vars["--ads-color-surface-raised"]}, transparent)`,
      insetBlockStart: "100%",
    },
  },
  scrollArrowDown: {
    borderEndEndRadius: vars["--ads-radius-panel"],
    borderEndStartRadius: vars["--ads-radius-panel"],
    insetBlockEnd: 0,
    "::after": {
      backgroundImage: `linear-gradient(to top, ${vars["--ads-color-surface-raised"]}, transparent)`,
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
