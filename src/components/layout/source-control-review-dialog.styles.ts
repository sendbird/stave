import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const reviewDialogStyles = stylex.create({
  content: { gap: vars["--aui-space-20"], maxWidth: "32rem" },
  commitHash: { color: vars["--aui-color-text"], fontFamily: vars["--aui-font-mono"] },
  legend: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    marginBottom: vars["--aui-space-8"],
  },
  option: {
    alignItems: "flex-start",
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    minHeight: 48,
    // Replaces the `space-y-2` stack: every option but the first owes the one
    // above it a gap, and the legend already carries its own bottom margin.
    marginTop: { default: vars["--aui-space-8"], ":first-of-type": 0 },
    paddingBlock: 10,
    paddingInline: vars["--aui-space-12"],
  },
  optionEnabled: {
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    cursor: "pointer",
  },
  optionDisabled: { cursor: "not-allowed", opacity: vars["--aui-opacity-disabled"] },
  optionSelected: {
    backgroundColor: {
      default: vars["--aui-color-accent-soft"],
      ":hover": vars["--aui-color-selection-fill"],
    },
    borderColor: vars["--aui-color-accent"],
  },
  optionMark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    marginTop: vars["--aui-space-2"],
    width: 24,
  },
  optionMarkSelected: {
    backgroundColor: vars["--aui-color-accent-soft"],
    color: vars["--aui-color-accent"],
  },
  optionIcon: { height: 14, width: 14 },
  optionText: { minWidth: 0 },
  optionTitle: {
    color: vars["--aui-color-text"],
    display: "block",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  optionDescription: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    marginTop: vars["--aui-space-2"],
  },
  summaryField: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"] },
  summaryLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  helpText: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    minHeight: 20,
  },
  helpTextError: { color: vars["--aui-color-danger-text"] },
});
