import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * `Command`'s styles, split into their own module when the `toolbar` /
 * `footer` / `size` / `Group` / `GroupLabel` additions pushed `Command.tsx`
 * past the repo's 500-line-growth ratchet (`bun run check:structure`) — the
 * same split `DataTable.styles.ts` already uses for `DataTable`.
 */
export const styles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"): a
    // static container that groups content in flow does not leave its plane, so
    // it carries no shadow. `elevation1` now means pressable, movable, or
    // docked. Depth against the canvas comes from the surface step + hairline.
    boxShadow: vars["--ads-elevation-flat"],
    color: vars["--ads-color-text"],
    display: "grid",
    inlineSize: "min(420px, 100%)",
    minInlineSize: 0,
    overflow: "hidden",
  },
  rootBare: {
    borderWidth: 0,
    borderRadius: 0,
    boxShadow: vars["--ads-elevation-flat"],
    inlineSize: "100%",
  },
  // Resting/hover/press chrome (background, border, box-shadow, color) comes
  // from `controlChrome.trigger` (composed at the call site) — the launcher
  // sits beside real `Button`s in a toolbar and must react like one.
  trigger: {
    alignItems: "center",
    appearance: "none",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    // `min(280px, 100%)` here, not `inline-size: 280px` + `max-inline-size:
    // 100%`, is a CYCLIC percentage: in a shrink-to-fit parent (a `Topbar`
    // actions cluster, a toolbar, any flex item sized from its content) the
    // `100%` resolves against a width that depends on this element, so the
    // browser measures the launcher at its ~130px text width when it computes
    // the parent's max-content — then lays it out at 280px, overflows the
    // line, and wraps the siblings onto a second row. Measured in the docs
    // topbar: a 93px-tall bar with the theme and density toggles stranded
    // below the search field. As a max-inline-size the cyclic percentage
    // resolves to `none` for intrinsic sizing (the safe direction) and still
    // caps the launcher during layout.
    inlineSize: 280,
    justifyContent: "flex-start",
    maxInlineSize: "100%",
    minBlockSize: vars["--ads-control-height-md"],
    paddingBlock: 0,
    paddingInline: vars["--ads-space-12"],
  },
  triggerShortcut: {
    marginInlineStart: "auto",
  },
  popup: {
    inlineSize: `min(560px, calc(100dvw - ${vars["--ads-space-32"]}))`,
    insetBlockStart: "16dvh",
    insetInlineStart: "50%",
    maxBlockSize: `calc(100dvh - 16dvh - ${vars["--ads-space-32"]})`,
    overflow: "hidden",
    position: "fixed",
    transform: "translateX(-50%)",
    zIndex: vars["--ads-z-index-modal"],
  },
  // `size="lg"`: a wider palette for a `toolbar` (sort/filter controls) or
  // rows that need more room, e.g. a branch name + badge + counts + timestamp.
  popupLg: {
    inlineSize: `min(720px, calc(100dvw - ${vars["--ads-space-32"]}))`,
  },
  footer: {
    alignItems: "center",
    borderBlockStartColor: vars["--ads-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-subtle"],
    display: "flex",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-12"],
    minBlockSize: vars["--ads-control-height-md"],
    paddingBlock: 0,
    paddingInline: vars["--ads-space-12"],
    overflowX: "auto",
  },
  hint: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--ads-space-4"],
  },
  srOnly: {
    blockSize: 1,
    borderWidth: 0,
    clip: "rect(0 0 0 0)",
    inlineSize: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
  },
  label: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingBlockStart: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  inputGroup: {
    alignItems: "center",
    borderColor: vars["--ads-color-border-subtle"],
    borderStyle: "solid",
    borderWidth: 0,
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: `${vars["--ads-control-icon-size-md"]} minmax(0, 1fr)`,
    minBlockSize: vars["--ads-control-height-xl"],
    paddingInline: vars["--ads-space-12"],
  },
  searchIcon: {
    color: vars["--ads-color-text-subtle"],
  },
  // Sits between the input and the list (outside `List`) so its controls
  // never join the list's arrow-key roving.
  toolbar: {
    alignItems: "center",
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    minBlockSize: vars["--ads-control-height-md"],
    paddingInline: vars["--ads-space-12"],
  },
  pageHeader: {
    alignItems: "center",
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    minBlockSize: vars["--ads-control-height-lg"],
    paddingInline: vars["--ads-space-8"],
  },
  pageTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    inlineSize: "100%",
    lineHeight: vars["--ads-line-height-normal"],
    // Deliberate exception to the 36px control default: command palettes run
    // larger than in-page controls (palettes keep a taller search input).
    minBlockSize: vars["--ads-control-height-xl"],
    minInlineSize: 0,
    padding: 0,
    "::placeholder": {
      color: vars["--ads-color-text-placeholder"],
    },
    outlineStyle: "none",
  },
  list: {
    // A scrollable, variable-height list must NOT be `display: grid` with a
    // capped height: the implicit rows get distributed to equal heights and
    // clip taller items, spilling content over the next row. Flex column sizes
    // each item to its content and scrolls.
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
    maxBlockSize: `min(260px, calc(100dvh - 16dvh - ${vars["--ads-control-height-xl"]} - ${vars["--ads-control-height-md"]} - ${vars["--ads-space-32"]}))`,
    overflowX: "hidden",
    overflowY: "auto",
    padding: vars["--ads-space-4"],
  },
  group: {
    display: "grid",
    // `list` is a scrolling flex column, so a group is a flex ITEM in it and
    // must not shrink — the same reason `item` below states it. A grid item
    // that shrinks below its own rows does not reflow, it clips: measured 5
    // rows summing 152px inside a 71px box, with the next group starting
    // inside the previous one's rows. A group's automatic minimum size
    // normally prevents that, but that protection is void the moment anything
    // gives the group a non-`visible` overflow, and a host reasonably might.
    // Stating `flexShrink: 0` here makes the list scroll in every case, which
    // is what `overflow-y: auto` on the list was for.
    flexShrink: 0,
    gap: vars["--ads-space-4"],
  },
  groupLabel: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  item: {
    // Compact, fixed-height command rows (palette convention): the label and
    // description each stay on ONE line and truncate, so a long item never grows
    // the row to multiple lines. Vertically centered.
    //
    // Flex, NOT a three-column grid. The grid version silently required the
    // array API's exact icon/copy/shortcut child triple: a caller composing its
    // own row — which `Command.Item` explicitly invites — put its single child
    // in the icon column and watched it collapse to the icon's width. The
    // slots below carry their own sizing instead, so both call styles work.
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":active": vars["--ads-color-overlay-pressed"],
    },
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text"],
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    lineHeight: vars["--ads-line-height-tight"],
    minBlockSize: vars["--ads-menu-item-height"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  itemDisabled: {
    color: vars["--ads-color-text-subtle"],
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
  itemIcon: {
    alignItems: "center",
    color: vars["--ads-color-accent"],
    display: "inline-flex",
    // Held at the icon column's old width so an item with no icon still lines
    // its label up with its neighbours.
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-lg"],
    justifyContent: "center",
  },
  itemCopy: {
    display: "grid",
    flexGrow: 1,
    gap: vars["--ads-space-4"],
    gridTemplateColumns: "minmax(0, 1fr)",
    minInlineSize: 0,
  },
  itemLabel: {
    lineHeight: vars["--ads-line-height-tight"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shortcut: {
    display: "inline-flex",
    flexShrink: 0,
    marginInlineStart: "auto",
    maxInlineSize: "8rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sectionLabel: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  empty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    // Base UI keeps the live-status element mounted while matching items are
    // present. An empty node must reserve neither its 24px line box nor its
    // padding; the no-match message remains visible and announced once it has
    // content.
    ":empty": {
      display: "none",
    },
  },
});
