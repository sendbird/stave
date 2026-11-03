import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** "Set up from my usage" wizard inside the Auto (Model Router) settings. */
export const autoRoutingWizardStyles = stylex.create({
  // The step rail and its "Step n of 3" count share one row; the rail fills
  // what the count leaves.
  stepperRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    minInlineSize: 0,
  },
  stepper: { flex: "1 1 auto", minInlineSize: 0 },
  stepCount: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  // Visually hidden until focused: the target a step change moves focus to.
  stepHeading: {
    blockSize: 1,
    clipPath: "inset(50%)",
    inlineSize: 1,
    margin: 0,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
  },
  toolbar: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  toolbarSpacer: {
    flex: 1,
  },
  progress: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  body: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  helper: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  error: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  success: {
    color: vars["--ads-color-success-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  headingRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  heading: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  insights: {
    color: vars["--ads-color-text"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    paddingInlineStart: vars["--ads-space-20"],
  },
  cellMuted: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    whiteSpace: "nowrap",
  },
  cellLabel: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    whiteSpace: "nowrap",
  },
  changeList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  changeRow: {
    alignItems: "flex-start",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    cursor: "pointer",
    display: "flex",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  changeRowExcluded: {
    opacity: vars["--ads-opacity-disabled"],
  },
  changeText: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minInlineSize: 0,
  },
  changeTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  changeSubject: {
    fontWeight: vars["--ads-font-weight-medium"],
  },
  changeEvidence: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  emptyState: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-16"],
    textAlign: "center",
  },
});
