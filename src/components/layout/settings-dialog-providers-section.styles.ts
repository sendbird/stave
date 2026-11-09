import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const providersStyles = stylex.create({
  // DescribedSelect wrapper: vertical stack with a small gap.
  describedSelectRoot: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  // Trigger width only; the AUI Select trigger owns border, radius, and fill.
  describedSelectTrigger: {
    inlineSize: 256,
  },
  // Popup geometry only; the AUI Select popup owns its surface and radius.
  describedSelectContent: {
    minInlineSize: "var(--anchor-width)",
    maxInlineSize: "24rem",
  },
  // Muted descriptive copy under a select.
  describedSelectHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
  },
  describedSelectHintTerm: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  // Trusted-tools list.
  trustedList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  trustedRow: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  trustedRowLabel: {
    fontSize: vars["--aui-font-size-body"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  trustedRemove: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    blockSize: vars["--aui-control-height-xs"],
    paddingInline: vars["--aui-space-8"],
  },
  emptyCopy: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  // Provider tabs.
  tabs: {
    gap: vars["--aui-space-16"],
  },
  // Sandbox/plan-mode inline field font-family override on the DraftInput.
  fieldMono: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-body"],
    blockSize: vars["--aui-control-height-lg"],
  },
  field: {
    blockSize: vars["--aui-control-height-lg"],
  },
  presetHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  webSearchHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
  },
});
