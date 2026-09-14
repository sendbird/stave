import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const reviewDialogStyles = stylex.create({
  content: { gap: vars["--ads-space-20"], maxWidth: "32rem" },
  commitHash: { color: vars["--ads-color-text"], fontFamily: vars["--ads-font-mono"] },
  legend: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    marginBottom: vars["--ads-space-8"],
  },
  option: {
    alignItems: "flex-start",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    minHeight: 48,
    // Replaces the `space-y-2` stack: every option but the first owes the one
    // above it a gap, and the legend already carries its own bottom margin.
    marginTop: { default: vars["--ads-space-8"], ":first-of-type": 0 },
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
  },
  optionEnabled: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    cursor: "pointer",
  },
  optionDisabled: { cursor: "not-allowed", opacity: vars["--ads-opacity-disabled"] },
  optionSelected: {
    backgroundColor: {
      default: vars["--ads-color-accent-soft"],
      ":hover": vars["--ads-color-selection-fill"],
    },
    borderColor: vars["--ads-color-accent"],
  },
  optionMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    marginTop: vars["--ads-space-2"],
    width: 24,
  },
  optionMarkSelected: {
    backgroundColor: vars["--ads-color-accent-soft"],
    color: vars["--ads-color-accent"],
  },
  optionIcon: { height: 14, width: 14 },
  optionText: { minWidth: 0 },
  optionTitle: {
    color: vars["--ads-color-text"],
    display: "block",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  optionDescription: {
    color: vars["--ads-color-text-muted"],
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    marginTop: vars["--ads-space-2"],
  },
  summaryField: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  summaryLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  helpText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    minHeight: 20,
  },
  helpTextError: { color: vars["--ads-color-danger-text"] },
});
