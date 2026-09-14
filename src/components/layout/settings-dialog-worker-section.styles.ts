import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Per-provider Worker mode defaults form inside its settings card. */
export const workerSectionStyles = stylex.create({
  tabsList: {
    justifyContent: "flex-start",
    maxInlineSize: "100%",
    overflowX: "auto",
  },
  tabsTrigger: {
    flexShrink: 0,
  },
  tabIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  tabsContent: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
  },
  noEffortNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  resetStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  resetButton: {
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    blockSize: vars["--ads-control-height-xs"],
    paddingInline: vars["--ads-space-8"],
  },
  resetIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  instructionsTextarea: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  turnsInput: {
    inlineSize: "100%",
  },
  previewCard: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  previewTitle: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  previewWarning: {
    color: vars["--ads-color-warning-text"],
    marginBlockStart: vars["--ads-space-4"],
  },
  previewLine: {
    marginBlockStart: vars["--ads-space-4"],
  },
});
