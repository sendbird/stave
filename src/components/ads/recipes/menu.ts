import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Shared menu styles for popup-menu surfaces (DropdownMenu, ContextMenu,
 * Menubar). Apply via `sx(menu.<key>, ...local overrides)`.
 *
 * The `popup` shell provides the shared surface chrome; pair it with a local
 * size/transform override where a component needs different min-inline-size or
 * transform-origin. DropdownMenu's `arrow` color stays local. The `item` base
 * omits `cursor`; pair it with `menu.itemPointer` or `menu.itemDefault` to keep
 * each component's exact pointer behavior.
 *
 * This recipe owns **layout only** for interactive parts. Two things are
 * composed at the call site instead of being baked in here:
 *
 * - color state — `controlChrome.trigger` / `controlChrome.triggerQuiet`
 *   (+ `controlChrome.triggerOpen` while the popup is open), so a menu trigger
 *   and a `Button` in the same row react identically (design-direction §2);
 * - the transition — `transition.colors` from `recipes/transition.ts`, which
 *   carries the `prefers-reduced-motion` 0ms override.
 *
 * **Popup padding rule (design-direction §5):** a popup that hosts *rows*
 * (menu, listbox) pads with `space4` and lets each row own its own inner
 * padding — the row's hover/highlight surface must be able to reach the popup
 * edge minus one 4px gutter. Content popups (Popover) pad with `space16` and
 * modal surfaces with `space20`. Where the surface scrolls, that `space4` moves
 * onto the scrolling list (see `listbox.list`) so the last row is not clipped.
 */
export const menu = stylex.create({
  positioner: {
    zIndex: vars.zIndexDropdown,
  },
  popup: {
    backgroundColor: vars.colorSurfaceRaised,
    // Elevation communicates depth; the semantic hairline keeps a small
    // anchored surface legible when it overlaps a surface of similar lightness.
    // High contrast strengthens the same role instead of introducing another
    // popup-only edge token.
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // elevationOverlay = "transient popup anchored to a trigger" (tokens.stylex.ts
    // elevation policy). Correct for every menu surface: they are anchored,
    // not detached global surfaces (elevationModal).
    boxShadow: vars.elevationOverlay,
    color: vars.colorText,
    display: "grid",
    // Explicit `minmax(0, 1fr)` track, never the implicit `auto` one. An `auto`
    // track's max sizing function is intrinsic, so it sizes to its content's
    // min-content width and happily grows past `maxInlineSize` — the popup box
    // stays 360px while the rows render wider and paint outside the surface.
    // `1fr` is a non-intrinsic max, which also switches off the automatic
    // minimum size of every grid item beneath it (`Menu.Group`/`RadioGroup`
    // wrappers are unstyled `min-width: auto` boxes), so long rows clamp to the
    // popup and let `itemLabel` truncate instead of escaping it.
    gridTemplateColumns: "minmax(0, 1fr)",
    maxInlineSize: "min(360px, var(--available-width, calc(100vw - 32px)))",
    minInlineSize: "min(236px, var(--available-width, calc(100vw - 32px)))",
    // Row-hosting popup → `space4` (see the padding rule above). Menu popups
    // are not scroll containers by default (`popupClamp` is opt-in), so the
    // gutter can stay on the popup itself.
    padding: vars.space4,
  },
  popupTransform: {
    transformOrigin: "var(--transform-origin)",
  },
  /**
   * Opt-in max-height clamp for popups whose item count is unbounded (filter
   * value lists, long pickers): caps the popup to the anchored space and
   * scrolls inside. Opt-in — NOT part of `popup` — because `overflow: auto`
   * would clip the `Arrow` that DropdownMenu/Menubar render sticking out of
   * the popup box.
   */
  popupClamp: {
    maxBlockSize: "min(420px, var(--available-height, calc(100vh - 32px)))",
    overflowY: "auto",
  },
  /**
   * Overlay-trigger **layout**. Compose with `controlChrome.trigger` (or
   * `controlChrome.triggerQuiet` for `triggerGhost`), `transition.colors`,
   * `focusRing.ring`, `controlHeightBySize[size]`, and one `triggerSm|Md|Lg`
   * gutter. The resting colors used to live here with no `:hover`/`:active` at
   * all, which made a trigger look exactly like `Button variant="secondary"`
   * and do nothing under the cursor.
   */
  trigger: {
    alignItems: "center",
    appearance: "none",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    cursor: "pointer",
    display: "inline-flex",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space8,
    // A menu trigger is a BUTTON ("Actions ⌄"), not a field. Its label and
    // caret stay one centered cluster at content width — the menu-trigger
    // convention — and `fit-content` is the width contract every sibling
    // trigger already declares (`Select` 100%, `Combobox` opt-in `fullWidth`,
    // `NativeSelect`/`DatePicker` 100%). Without it this recipe was the one
    // trigger with no width statement at all, so a `display: grid` parent
    // stretched it and left the caret floating 168px from the trailing edge:
    // field width with menu centering, a combination no reference system uses.
    // Full-width menu triggers opt in via `triggerFullWidth`, which also flips
    // to `space-between` because at field width the caret must pin trailing.
    justifyContent: "center",
    paddingBlock: 0,
  },
  /**
   * Opt-in field geometry for a menu trigger that genuinely owns a full column
   * (a property row, a table cell, a filter bar slot). Mirrors
   * `Select.Trigger`: label leading, caret pinned to the trailing padding edge.
   * Requires exactly two children (label, caret) to read correctly.
   */
  triggerFullWidth: {
    justifyContent: "space-between",
  },
  // Inline gutters mirror Button exactly (sm space8 / md space12 / lg space16 +
  // the 15px lg type step) so a Button and a menu trigger in one form row line
  // up on both axes.
  triggerSm: {
    paddingInline: vars.space8,
  },
  triggerMd: {
    paddingInline: vars.space12,
  },
  triggerLg: {
    fontSize: vars.fontSizeLead,
    paddingInline: vars.space16,
  },
  /**
   * Quiet/toolbar variant — colors come from `controlChrome.triggerQuiet`.
   * The tight gutter is deliberate at every size: a ghost trigger sits in a
   * dense toolbar row, not in a form row aligned against Button.
   */
  triggerGhost: {
    paddingInline: vars.space8,
  },
  group: {
    display: "grid",
    gap: vars.space4,
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
  item: {
    textAlign: "start",
    alignItems: "center",
    borderRadius: vars.radiusControl,
    color: vars.colorText,
    // Flex row (icon? · label · trailing) instead of a grid with a hardcoded
    // first track: icon-less items must not carry a phantom left gutter.
    // Real leading icons opt into `itemIcon`; selection indicators are docked
    // at inline-end by `itemIndicator` and never affect the label's start edge.
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    // Fixed integer line box (`lineHeightControl`) so single-line rows center on
    // whole pixels inside the 32px item grid (1.35 → 18.9px reads subtly off)
    // without inheriting the :root 1.5 or clipping descenders.
    lineHeight: vars.lineHeightControl,
    minBlockSize: vars.menuItemHeight,
    minInlineSize: 0,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
  itemPointer: {
    cursor: "pointer",
  },
  itemDefault: {
    cursor: "default",
  },
  itemHighlighted: {
    // The pointer/keyboard highlight is a hover, so it takes the hover wash the
    // rest of the system uses. It painted `colorCanvasSubtle` — an opaque
    // Neutral100 — so a menu row lit up a different colour than a button, a
    // tree row or a sidebar item under the same pointer.
    backgroundColor: vars.colorOverlayHover,
  },
  /*
   * A checked row keeps a fill, not just the indicator at its inline-end. The
   * glyph alone made "the one you already picked" the quietest mark in the
   * popup, and a Select — the same job, a value you chose — marks it with
   * §1.7's selection fill. Same job, same grammar.
   */
  itemChecked: {
    /*
     * No fill. A chosen row is marked by its ink and the indicator at the
     * inline-end, both of which stay put while the pointer moves; the fill in a
     * popup belongs to the pointer alone. It carried the hover value for a
     * while, which meant the chosen row and a pointed-at row were the same
     * colour and the list read as having two active rows.
     */
    color: vars.colorAccent,
  },
  itemDanger: {
    color: vars.colorDangerText,
  },
  itemDisabled: {
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  // Checkable rows reserve space only at inline-end. The indicator is
  // absolutely docked so its position is stable regardless of where the
  // compound part appears among the item's children.
  itemCheckable: {
    paddingInlineEnd: `calc(${vars.space8} + ${vars.controlIconSizeSm} + ${vars.space8})`,
    position: "relative",
  },
  itemIcon: {
    alignItems: "center",
    alignSelf: "center",
    color: "currentColor",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    // One step down from `lg`. The slot's size IS the icon's size — the
    // `[data-ads-control-icon-slot] > svg` contract stretches the glyph to
    // 100% — so an 18px slot rendered every menu icon at 18 no matter what
    // `size` a caller passed. The shell's account menu ships 15px icons that
    // arrived on screen at 18, a fifth larger than intended.
    // A fixed size, not a floor. `min*` alone only stopped a small glyph from
    // shrinking the column; an icon that arrived with no `size` — lucide's
    // default 24 — pushed the slot open to 24 and the `> svg { 100% }` contract
    // held it there. The shell's own menus shipped both: 16 where a caller
    // passed a size, 24 where one forgot.
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  itemIndicator: {
    alignItems: "center",
    blockSize: vars.controlIconSizeSm,
    color: vars.colorTextMuted,
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars.controlIconSizeSm,
    insetInlineEnd: vars.space8,
    justifyContent: "center",
    position: "absolute",
  },
  // Check/radio indicators stay mounted (keepMounted) so checked state never
  // changes row width, but an unchecked row must not paint its glyph.
  itemIconHidden: {
    opacity: 0,
  },
  itemLabel: {
    display: "block",
    flexGrow: 1,
    // Match the item's fixed integer line box — a 1.35 label inside a 20px row
    // lands on half-pixels and reads vertically off.
    lineHeight: vars.lineHeightControl,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shortcut: {
    color: vars.colorTextSubtle,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
  },
  // Trailing "current choice" check (DropdownMenu `selected`). Lives at the
  // item's inline end so icon-less choice groups keep flush-left labels.
  selectedIndicator: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    marginInlineStart: "auto",
  },
  chevron: {
    color: vars.colorTextSubtle,
    flexShrink: 0,
    marginInlineStart: "auto",
  },
  separator: {
    backgroundColor: vars.colorBorderSubtle,
    blockSize: vars.borderWidthHairline,
    marginBlock: vars.space4,
  },
  arrow: {
    color: vars.colorSurfaceRaised,
  },
});
