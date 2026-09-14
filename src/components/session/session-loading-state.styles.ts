import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const sessionLoadingStateStyles = stylex.create({
  section: {
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 0,
    paddingBlock: vars["--ads-space-32"],
    paddingInline: vars["--ads-space-24"],
  },
  empty: {
    // ADS `EmptyState` root is a grid with `justifyItems: "center"`, so the
    // pre-migration `items-stretch` (a flex-column cross-axis rule) lands on
    // the block axis and does nothing. `justifyItems` is the inline-axis
    // equivalent on a grid, and it is what makes the skeleton column fill the
    // card instead of shrinking to fit-content.
    justifyItems: "stretch",
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-shell"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    gap: vars["--ads-space-20"],
    maxWidth: 1024,
    padding: vars["--ads-space-24"],
    textAlign: "left",
  },
  header: {
    alignItems: "center",
    // The ADS `EmptyState` header is a grid, so `flexDirection` alone is inert
    // and the orb stacks above the copy. Claim the display mode we depend on so
    // the row actually applies.
    display: "flex",
    flexDirection: "row",
    gap: vars["--ads-space-16"],
    // ADS constrains the header with `maxInlineSize`; overriding `maxWidth`
    // leaves two same-axis declarations whose winner depends on stylesheet
    // order, so override the logical property ADS declared.
    maxInlineSize: "none",
  },
  media: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    // Logical sizing so this deterministically replaces the ADS medallion's
    // `inlineSize`/`minBlockSize` instead of racing `width`/`height` against
    // them and resolving to a non-square chip.
    blockSize: 64,
    borderRadius: vars["--ads-radius-full"],
    boxShadow: `inset 0 0 0 ${vars["--ads-border-width-hairline"]} ${vars["--ads-color-border"]}`,
    flexShrink: 0,
    inlineSize: 64,
    minBlockSize: 64,
  },
  copy: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  title: {
    fontSize: vars["--ads-font-size-lead"],
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
    gap: vars["--ads-space-16"],
    inlineSize: "100%",
    maxInlineSize: "none",
  },
  lines: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
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
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-4"],
    paddingTop: vars["--ads-space-4"],
  },
  bubbleLarge: {
    borderRadius: vars["--ads-radius-shell"],
    height: 96,
    maxWidth: 768,
    width: "100%",
  },
  bubbleMedium: {
    borderRadius: vars["--ads-radius-shell"],
    height: 56,
    width: "min(28rem, 78%)",
  },
  bubbleSmall: {
    borderRadius: vars["--ads-radius-shell"],
    height: 80,
    maxWidth: 672,
    width: "100%",
  },
  chipWide: {
    borderRadius: vars["--ads-radius-full"],
    height: 12,
    width: 64,
  },
  chipWider: {
    borderRadius: vars["--ads-radius-full"],
    height: 12,
    width: 96,
  },
});
