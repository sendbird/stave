import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Auto (Model Router) settings section: role table, stance, tester. */
export const autoRoutingSectionStyles = stylex.create({
  stanceNote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    marginBlockStart: vars["--aui-space-8"],
  },
  thresholdRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
  },
  thresholdField: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  thresholdLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  thresholdInput: {
    backgroundColor: vars["--aui-color-canvas"],
    blockSize: vars["--aui-control-height-lg"],
    inlineSize: "6rem",
  },
  // One switch per row. SwitchField lays out as a label column plus a control
  // column with fixed minimums, so packing several into a multi-column grid
  // made each switch overlap the next field's title.
  signalsList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
  },
  thresholdHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    maxInlineSize: "14rem",
  },
  levelTable: {
    borderCollapse: "collapse",
    fontSize: vars["--aui-font-size-body"],
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-normal"],
    tableLayout: "fixed",
  },
  levelHead: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    paddingBlock: vars["--aui-space-8"],
    paddingInlineEnd: vars["--aui-space-12"],
    textAlign: "start",
    ":first-child": {
      inlineSize: "52%",
    },
  },
  levelRow: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    ":last-child": {
      borderBottomWidth: 0,
    },
  },
  levelName: {
    fontWeight: "inherit",
    paddingBlock: vars["--aui-space-12"],
    paddingInlineEnd: vars["--aui-space-12"],
    textAlign: "start",
    verticalAlign: "top",
  },
  /**
   * The provider-strengths table's row heading on the AUI table: the head
   * cell keeps its padding and rule, and reads as the row's text.
   */
  strengthName: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: "inherit",
    lineHeight: vars["--aui-line-height-normal"],
    verticalAlign: "top",
    whiteSpace: "normal",
  },
  strengthCell: {
    inlineSize: "45%",
    verticalAlign: "top",
  },
  levelLabel: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  levelLabelLine: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  levelRowOpen: {
    borderBottomWidth: 0,
  },
  levelActionHead: {
    inlineSize: vars["--aui-control-height-lg"],
    paddingInlineEnd: 0,
  },
  levelActionCell: {
    paddingBlock: vars["--aui-space-8"],
    textAlign: "end",
    verticalAlign: "top",
  },
  levelEditorCell: {
    paddingBlockEnd: vars["--aui-space-12"],
  },
  levelEditor: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  levelEditorFooter: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  levelEditorHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  levelDescription: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    marginBlockStart: vars["--aui-space-2"],
  },
  levelCell: {
    paddingBlock: vars["--aui-space-12"],
    paddingInlineEnd: vars["--aui-space-12"],
    verticalAlign: "top",
  },
  levelRoute: {
    color: vars["--aui-color-text"],
    fontVariantNumeric: "tabular-nums",
    overflowWrap: "anywhere",
  },
  levelMissing: {
    color: vars["--aui-color-text-muted"],
    fontStyle: "italic",
  },
  roleGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  roleHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  roleTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  roleHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  ruleCard: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  ruleCardDisabled: {
    opacity: vars["--aui-opacity-disabled"],
  },
  ruleHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
  },
  ruleHeaderLead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  ruleId: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ruleActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
  },
  ruleGrid: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 10rem), 1fr))",
  },
  ruleField: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  ruleFieldWide: {
    gridColumn: "1 / -1",
  },
  ruleFieldLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.02em",
    lineHeight: vars["--aui-line-height-normal"],
    textTransform: "uppercase",
  },
  ruleSelectTrigger: {
    backgroundColor: vars["--aui-color-canvas"],
    blockSize: vars["--aui-control-height-md"],
    inlineSize: "100%",
  },
  ruleInput: {
    backgroundColor: vars["--aui-color-canvas"],
    blockSize: vars["--aui-control-height-md"],
    inlineSize: "100%",
  },
  ruleArrow: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    paddingInline: vars["--aui-space-4"],
  },
  ruleSummary: {
    alignItems: "baseline",
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    minInlineSize: 0,
  },
  ruleWhen: {
    color: vars["--aui-color-text"],
    overflowWrap: "anywhere",
  },
  ruleThen: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflowWrap: "anywhere",
  },
  ruleIdNote: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    gridColumn: "1 / -1",
    margin: 0,
  },
  legacyRuleSummary: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  emptyRules: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  icon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  testerTextarea: {
    backgroundColor: vars["--aui-color-canvas"],
    minBlockSize: "5rem",
  },
  testerControls: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  testerResult: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "grid",
    columnGap: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  testerKey: {
    color: vars["--aui-color-text-muted"],
    margin: 0,
  },
  testerValue: {
    color: vars["--aui-color-text"],
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  testerRoute: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
  },
  chipGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
});
