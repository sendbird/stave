import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** "Set up from my usage" wizard inside the Auto (Model Router) settings. */
export const autoRoutingWizardStyles = stylex.create({
  // The step rail and its "Step n of 3" count share one row; the rail fills
  // what the count leaves.
  stepperRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  stepper: { flex: "1 1 auto", minInlineSize: 0 },
  stepCount: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
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
    gap: vars["--aui-space-16"],
  },
  toolbar: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  toolbarSpacer: {
    flex: 1,
  },
  progress: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  body: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  helper: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  error: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  success: {
    color: vars["--aui-color-success-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  headingRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  heading: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  insights: {
    color: vars["--aui-color-text"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-4"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    paddingInlineStart: vars["--aui-space-20"],
  },
  cellMuted: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    whiteSpace: "nowrap",
  },
  cellLabel: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    whiteSpace: "nowrap",
  },
  changeList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  changeRow: {
    alignItems: "flex-start",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    cursor: "pointer",
    display: "flex",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  changeRowExcluded: {
    opacity: vars["--aui-opacity-disabled"],
  },
  changeText: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minInlineSize: 0,
  },
  changeTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  changeSubject: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
  changeEvidence: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  emptyState: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-16"],
    textAlign: "center",
  },
});
