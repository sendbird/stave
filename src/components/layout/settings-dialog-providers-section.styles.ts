import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const providersStyles = stylex.create({
  // DescribedSelect wrapper: vertical stack with a small gap.
  describedSelectRoot: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  // Trigger width only; the ADS Select trigger owns border, radius, and fill.
  describedSelectTrigger: {
    inlineSize: 256,
  },
  // Popup geometry only; the ADS Select popup owns its surface and radius.
  describedSelectContent: {
    minInlineSize: "var(--anchor-width)",
    maxInlineSize: "24rem",
  },
  // Muted descriptive copy under a select.
  describedSelectHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
  },
  describedSelectHintTerm: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  // Trusted-tools list.
  trustedList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  trustedRow: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  trustedRowLabel: {
    fontSize: vars["--ads-font-size-body"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  trustedRemove: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    blockSize: vars["--ads-control-height-xs"],
    paddingInline: vars["--ads-space-8"],
  },
  emptyCopy: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  // Provider tabs.
  tabs: {
    gap: vars["--ads-space-16"],
  },
  // Sandbox/plan-mode inline field font-family override on the DraftInput.
  fieldMono: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-body"],
    blockSize: vars["--ads-control-height-lg"],
  },
  field: {
    blockSize: vars["--ads-control-height-lg"],
  },
  presetHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  webSearchHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
  },
});
