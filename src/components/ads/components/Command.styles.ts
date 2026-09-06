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
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"): a
    // static container that groups content in flow does not leave its plane, so
    // it carries no shadow. `elevation1` now means pressable, movable, or
    // docked. Depth against the canvas comes from the surface step + hairline.
    boxShadow: vars.elevationFlat,
    color: vars.colorText,
    display: "grid",
    inlineSize: "min(420px, 100%)",
    minInlineSize: 0,
    overflow: "hidden",
  },
  rootBare: {
    borderWidth: 0,
    borderRadius: 0,
    boxShadow: vars.elevationFlat,
    inlineSize: "100%",
  },
  // Resting/hover/press chrome (background, border, box-shadow, color) comes
  // from `controlChrome.trigger` (composed at the call site) — the launcher
  // sits beside real `Button`s in a toolbar and must react like one.
  trigger: {
    alignItems: "center",
    appearance: "none",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
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
    minBlockSize: vars.controlHeightMd,
    paddingBlock: 0,
    paddingInline: vars.space12,
  },
  kbd: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextSubtle,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    marginInlineStart: "auto",
    paddingBlock: 0,
    paddingInline: vars.space4,
  },
  backdrop: {
    backdropFilter: vars.motionBlurOverlay,
    backgroundColor: vars.colorOverlay,
    inset: 0,
    position: "fixed",
    zIndex: vars.zIndexOverlay,
  },
  popup: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorMediaEdge,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationModal,
    color: vars.colorText,
    inlineSize: `min(560px, calc(100dvw - ${vars.space32}))`,
    insetBlockStart: "16dvh",
    insetInlineStart: "50%",
    maxBlockSize: `calc(100dvh - 16dvh - ${vars.space32})`,
    overflow: "hidden",
    position: "fixed",
    transform: "translateX(-50%)",
    zIndex: vars.zIndexModal,
  },
  // `size="lg"`: a wider palette for a `toolbar` (sort/filter controls) or
  // rows that need more room, e.g. a branch name + badge + counts + timestamp.
  popupLg: {
    inlineSize: `min(720px, calc(100dvw - ${vars.space32}))`,
  },
  footer: {
    alignItems: "center",
    borderBlockStartColor: vars.colorBorderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    color: vars.colorTextSubtle,
    display: "flex",
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeCaption,
    gap: vars.space12,
    minBlockSize: vars.controlHeightMd,
    paddingBlock: 0,
    paddingInline: vars.space12,
    overflowX: "auto",
  },
  hint: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars.space4,
  },
  footerKbd: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextSubtle,
    display: "inline-flex",
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    justifyContent: "center",
    lineHeight: 1,
    minBlockSize: vars.controlIconSizeMd,
    minInlineSize: vars.controlIconSizeMd,
    paddingInline: vars.space4,
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
    color: vars.colorTextSubtle,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    paddingBlockStart: vars.space12,
    paddingInline: vars.space12,
  },
  inputGroup: {
    alignItems: "center",
    borderColor: vars.colorBorderSubtle,
    borderStyle: "solid",
    borderWidth: 0,
    borderBlockEndWidth: vars.borderWidthHairline,
    display: "grid",
    gap: vars.space8,
    gridTemplateColumns: `${vars.controlIconSizeMd} minmax(0, 1fr)`,
    minBlockSize: vars.controlHeightXl,
    paddingInline: vars.space12,
  },
  searchIcon: {
    color: vars.colorTextSubtle,
  },
  // Sits between the input and the list (outside `List`) so its controls
  // never join the list's arrow-key roving.
  toolbar: {
    alignItems: "center",
    borderBlockEndColor: vars.colorBorderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    minBlockSize: vars.controlHeightMd,
    paddingInline: vars.space12,
  },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: vars.colorText,
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeBody,
    inlineSize: "100%",
    lineHeight: vars.lineHeightNormal,
    // Deliberate exception to the 36px control default: command palettes run
    // larger than in-page controls (palettes keep a taller search input).
    minBlockSize: vars.controlHeightXl,
    minInlineSize: 0,
    padding: 0,
    "::placeholder": {
      color: vars.colorTextPlaceholder,
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
    gap: vars.space4,
    minInlineSize: 0,
    maxBlockSize: `min(260px, calc(100dvh - 16dvh - ${vars.controlHeightXl} - ${vars.controlHeightMd} - ${vars.space32}))`,
    overflowX: "hidden",
    overflowY: "auto",
    padding: vars.space4,
  },
  group: {
    display: "grid",
    gap: vars.space4,
  },
  groupLabel: {
    color: vars.colorTextSubtle,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
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
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderRadius: vars.radiusControl,
    color: vars.colorText,
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    lineHeight: vars.lineHeightTight,
    minBlockSize: vars.menuItemHeight,
    minInlineSize: 0,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
  itemDisabled: {
    color: vars.colorTextSubtle,
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  itemIcon: {
    alignItems: "center",
    color: vars.colorAccent,
    display: "inline-flex",
    // Held at the icon column's old width so an item with no icon still lines
    // its label up with its neighbours.
    flexShrink: 0,
    inlineSize: vars.controlIconSizeLg,
    justifyContent: "center",
  },
  itemCopy: {
    display: "grid",
    flexGrow: 1,
    gap: vars.space4,
    gridTemplateColumns: "minmax(0, 1fr)",
    minInlineSize: 0,
  },
  itemLabel: {
    lineHeight: vars.lineHeightTight,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shortcut: {
    color: vars.colorTextSubtle,
    flexShrink: 0,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    maxInlineSize: "8rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
});
