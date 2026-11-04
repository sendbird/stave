import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Issues (tracker) settings. The cards and field rows come from the shared
 * `SettingsCard` / `LabeledField`; this file only owns the controls' width and
 * the Sources list rows.
 */
export const tasksSectionStyles = stylex.create({
  control: {
    backgroundColor: vars["--ads-color-canvas"],
    inlineSize: "100%",
    minBlockSize: vars["--ads-control-height-lg"],
  },
  sourceList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  sourceRow: {
    alignItems: "start",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  sourceMain: {
    minInlineSize: 0,
  },
  sourceHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  sourceLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  sourceBadge: {
    fontSize: vars["--ads-font-size-caption"],
  },
  hintTight: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-2"],
  },
  sourceActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
  },
  setUpButton: {
    blockSize: vars["--ads-control-height-sm"],
  },
  openIntegrations: {
    alignSelf: "flex-start",
    fontSize: vars["--ads-font-size-caption"],
    blockSize: "auto",
    paddingInline: 0,
  },
});
