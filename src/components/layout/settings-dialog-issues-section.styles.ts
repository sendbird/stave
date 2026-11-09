import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Issues (tracker) settings. The cards and field rows come from the shared
 * `SettingsCard` / `LabeledField`; this file only owns the controls' width and
 * the Sources list rows.
 */
export const tasksSectionStyles = stylex.create({
  control: {
    backgroundColor: vars["--aui-color-canvas"],
    inlineSize: "100%",
    minBlockSize: vars["--aui-control-height-lg"],
  },
  sourceList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  sourceRow: {
    alignItems: "start",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  sourceMain: {
    minInlineSize: 0,
  },
  sourceHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  sourceLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  sourceBadge: {
    fontSize: vars["--aui-font-size-caption"],
  },
  hintTight: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    marginBlockStart: vars["--aui-space-2"],
  },
  sourceActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
  },
  setUpButton: {
    blockSize: vars["--aui-control-height-sm"],
  },
  openIntegrations: {
    alignSelf: "flex-start",
    fontSize: vars["--aui-font-size-caption"],
    blockSize: "auto",
    paddingInline: 0,
  },
});
