import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const sessionLoadingStateStyles = stylex.create({
  section: {
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 0,
    paddingBlock: vars.space32,
    paddingInline: vars.space24,
  },
  empty: {
    // ADS `EmptyState` root is a grid with `justifyItems: "center"`, so the
    // pre-migration `items-stretch` (a flex-column cross-axis rule) lands on
    // the block axis and does nothing. `justifyItems` is the inline-axis
    // equivalent on a grid, and it is what makes the skeleton column fill the
    // card instead of shrinking to fit-content.
    justifyItems: "stretch",
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusShell,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    gap: vars.space20,
    maxWidth: 1024,
    padding: vars.space24,
    textAlign: "left",
  },
  header: {
    alignItems: "center",
    // The ADS `EmptyState` header is a grid, so `flexDirection` alone is inert
    // and the orb stacks above the copy. Claim the display mode we depend on so
    // the row actually applies.
    display: "flex",
    flexDirection: "row",
    gap: vars.space16,
    // ADS constrains the header with `maxInlineSize`; overriding `maxWidth`
    // leaves two same-axis declarations whose winner depends on stylesheet
    // order, so override the logical property ADS declared.
    maxInlineSize: "none",
  },
  media: {
    backgroundColor: vars.colorCanvasSubtle,
    // Logical sizing so this deterministically replaces the ADS medallion's
    // `inlineSize`/`minBlockSize` instead of racing `width`/`height` against
    // them and resolving to a non-square chip.
    blockSize: 64,
    borderRadius: vars.radiusFull,
    boxShadow: `inset 0 0 0 ${vars.borderWidthHairline} ${vars.colorBorder}`,
    flexShrink: 0,
    inlineSize: 64,
    minBlockSize: 64,
  },
  copy: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
  },
  title: {
    fontSize: vars.fontSizeLead,
    textAlign: "left",
  },
  description: {
    textAlign: "left",
  },
  content: {
    // Same grid/flex mismatch as `empty` above, plus `inlineSize` to restore
    // the `w-full` the pre-migration `EmptyContent` carried (ADS `content`
    // declares only `maxInlineSize`, so the column had no width to fill).
    justifyItems: "stretch",
    gap: vars.space16,
    inlineSize: "100%",
    maxInlineSize: "none",
  },
  lines: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  rowStart: {
    display: "flex",
    justifyContent: "flex-start",
  },
  rowEnd: {
    display: "flex",
    justifyContent: "flex-end",
  },
  metaRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    paddingInline: vars.space4,
    paddingTop: vars.space4,
  },
  bubbleLarge: {
    borderRadius: vars.radiusShell,
    height: 96,
    maxWidth: 768,
    width: "100%",
  },
  bubbleMedium: {
    borderRadius: vars.radiusShell,
    height: 56,
    width: "min(28rem, 78%)",
  },
  bubbleSmall: {
    borderRadius: vars.radiusShell,
    height: 80,
    maxWidth: 672,
    width: "100%",
  },
  chipWide: {
    borderRadius: vars.radiusFull,
    height: 12,
    width: 64,
  },
  chipWider: {
    borderRadius: vars.radiusFull,
    height: 12,
    width: 96,
  },
});
