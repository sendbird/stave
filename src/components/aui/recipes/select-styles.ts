import * as stylex from "@stylexjs/stylex";

import { controlHeightBySize } from "./control-metrics";
import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";

/** A selected row is still a row: the highlight lays its 6% over the fill. */
export const styles = stylex.create({
  field: {
    alignContent: "start",
    display: "grid",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  label: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-control"],
  },
  trigger: {
    alignItems: "center",
    appearance: "none",
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    cursor: "pointer",
    display: "inline-flex",
    // The trigger owns the control's type scale and `value` inherits it, so a
    // scale arm that changes the font size only has to say so once.
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
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
    fontSize: vars["--aui-font-size-caption"],
    paddingInline: densityPad.sm,
  },
  triggerCompact: {
    paddingInline: densityPad.sm,
  },
  triggerRegular: {
    paddingInline: densityPad.md,
  },
  triggerLg: {
    paddingInline: vars["--aui-space-16"],
  },
  value: {
    color: vars["--aui-color-text"],
    display: "block",
    flex: "1 1 0",
    // Inherited from the trigger, so the `xs` arm needs no value style of
    // its own.
    fontSize: "inherit",
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-control"],
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
    gap: vars["--aui-space-8"],
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
    marginInlineEnd: vars["--aui-space-8"],
  },
  icon: {
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
  },
  positioner: {
    zIndex: vars["--aui-z-index-dropdown"],
  },
  popup: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-overlay"],
    maxBlockSize: "min(320px, var(--available-height, calc(100vh - 32px)))",
    minInlineSize: "min(220px, var(--available-width, 100vw))",
    overflow: "hidden",
    padding: 0,
    // Scroll arrows are absolutely positioned children — anchor them here.
    position: "relative",
  },
  empty: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    overflowWrap: "anywhere",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  item: {
    // Center single-line options in the 32px row — `start` left them
    // top-aligned, which reads as an off/loose line-height.
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
      ":active": vars["--aui-color-overlay-pressed"],
    },
    borderRadius: vars["--aui-radius-control"],
    boxSizing: "border-box",
    color: vars["--aui-color-text"],
    cursor: "pointer",
    display: "grid",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    gridTemplateColumns: `minmax(0, 1fr) ${vars["--aui-control-icon-size-lg"]}`,
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-control"],
    minBlockSize: vars["--aui-menu-item-height"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  itemCompact: {
    minBlockSize: vars["--aui-control-height-xs"],
    paddingBlock: vars["--aui-space-4"],
  },
  itemDense: {
    fontSize: vars["--aui-font-size-caption"],
    minBlockSize: vars["--aui-control-height-xs"],
    paddingBlock: vars["--aui-space-4"],
  },
  itemRegular: {
    minBlockSize: vars["--aui-menu-item-height"],
    paddingBlock: vars["--aui-space-4"],
  },
  itemHighlighted: {
    // The pointer/keyboard highlight is a hover, so it takes the hover wash the
    // rest of the system uses. It painted `colorCanvasSubtle` — an opaque
    // Neutral100 — so a menu row lit up a different colour than a button, a
    // tree row or a sidebar item under the same pointer.
    backgroundColor: vars["--aui-color-overlay-hover"],
  },
  itemSelected: {
    /*
     * No fill. A chosen row is marked by its ink and the indicator at the
     * inline-end, both of which stay put while the pointer moves; the fill in a
     * popup belongs to the pointer alone. It carried the hover value for a
     * while, which meant the chosen row and a pointed-at row were the same
     * colour and the list read as having two active rows.
     */
    color: vars["--aui-color-accent"],
  },
  itemDisabled: {
    color: vars["--aui-color-text-subtle"],
    cursor: "not-allowed",
  },
  itemIndicator: {
    alignItems: "center",
    // Keep the selection affordance on the trailing edge, matching the Select
    // convention used by Base UI. Explicit placement means compound
    // consumers can keep the natural Indicator → ItemText child order.
    alignSelf: "center",
    color: vars["--aui-color-accent"],
    display: "inline-flex",
    gridColumn: "2",
    gridRow: "1",
    inlineSize: vars["--aui-control-icon-size-lg"],
    justifyContent: "center",
    minBlockSize: vars["--aui-control-icon-size-lg"],
    minInlineSize: vars["--aui-control-icon-size-lg"],
  },
  itemIndicatorHidden: {
    opacity: 0,
  },
  itemText: {
    display: "block",
    gridColumn: "1",
    gridRow: "1",
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-control"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    whiteSpace: "normal",
  },
  itemCopy: {
    alignContent: "center",
    alignSelf: "stretch",
    display: "grid",
    gap: vars["--aui-space-4"],
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-control"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    whiteSpace: "normal",
  },
  // Label + optional leading icon on one line; description (if any) sits below.
  itemLabelLine: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
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
    lineHeight: vars["--aui-line-height-control"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    textOverflow: "ellipsis",
    whiteSpace: "normal",
  },
  itemDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    maxInlineSize: "100%",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
  },
  groupLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    // Tight label row (a group label conventionally runs sm; ours is xs + tight so
    // the label never reads taller than the 32px items beneath it).
    lineHeight: vars["--aui-line-height-tight"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  separator: {
    backgroundColor: vars["--aui-color-border-subtle"],
    blockSize: vars["--aui-border-width-hairline"],
    marginBlock: vars["--aui-space-4"],
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
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border-focus"],
  },
  triggerError: {
    borderColor: {
      default: vars["--aui-color-danger-border"],
      // `:focus-visible`, matching `controlChrome.fieldTriggerBorder` and its
      // keyboard-only focus halo. The trigger is a native `<button>`, which
      // holds DOM focus after a click, so `:focus-within` left an invalid
      // trigger wearing the focus border instead of its own red one.
      ":focus-visible": vars["--aui-color-border-focus"],
    },
  },
  error: {
    // The border's red — one error, one colour. See `Field.tsx`.
    color: vars["--aui-color-danger"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    overflowWrap: "anywhere",
  },
  // Base UI mounts scroll arrows with inline `position: absolute` but no
  // inset, so without explicit anchoring they float at the popup's top-left.
  // Anchor each edge, span the full width, and paint the popup surface so
  // items scroll underneath cleanly.
  scrollArrow: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-raised"],
    blockSize: 24,
    color: vars["--aui-color-text-muted"],
    cursor: "default",
    display: "flex",
    insetInline: 0,
    justifyContent: "center",
    // layer-ok: scroll affordance over this listbox's own options; the popup
    // positioner already carries zIndexDropdown
    zIndex: 1,
    "::after": {
      blockSize: vars["--aui-space-8"],
      content: '""',
      insetInline: 0,
      pointerEvents: "none",
      position: "absolute",
    },
  },
  scrollArrowUp: {
    borderStartEndRadius: vars["--aui-radius-panel"],
    borderStartStartRadius: vars["--aui-radius-panel"],
    insetBlockStart: 0,
    "::after": {
      backgroundImage: `linear-gradient(to bottom, ${vars["--aui-color-surface-raised"]}, transparent)`,
      insetBlockStart: "100%",
    },
  },
  scrollArrowDown: {
    borderEndEndRadius: vars["--aui-radius-panel"],
    borderEndStartRadius: vars["--aui-radius-panel"],
    insetBlockEnd: 0,
    "::after": {
      backgroundImage: `linear-gradient(to top, ${vars["--aui-color-surface-raised"]}, transparent)`,
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
