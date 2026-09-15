import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Auto (Model Router) settings section: role table, stance, tester. */
export const autoRoutingSectionStyles = stylex.create({
  stanceNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-8"],
  },
  thresholdRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
  },
  thresholdField: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  thresholdLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  thresholdInput: {
    backgroundColor: vars["--ads-color-canvas"],
    blockSize: vars["--ads-control-height-lg"],
    inlineSize: "6rem",
  },
  signalsGrid: {
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 768px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  roleGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  roleHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  roleTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  roleHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  ruleCard: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  ruleCardDisabled: {
    opacity: vars["--ads-opacity-disabled"],
  },
  ruleHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
  },
  ruleHeaderLead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  ruleId: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ruleActions: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
  },
  ruleGrid: {
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 900px)": "repeat(4, minmax(0, 1fr))",
    },
  },
  ruleField: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  ruleFieldWide: {
    gridColumn: {
      default: "span 2",
      "@media (min-width: 900px)": "span 4",
    },
  },
  ruleFieldLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.02em",
    lineHeight: vars["--ads-line-height-normal"],
    textTransform: "uppercase",
  },
  ruleSelectTrigger: {
    backgroundColor: vars["--ads-color-canvas"],
    blockSize: vars["--ads-control-height-md"],
    inlineSize: "100%",
  },
  ruleInput: {
    backgroundColor: vars["--ads-color-canvas"],
    blockSize: vars["--ads-control-height-md"],
    inlineSize: "100%",
  },
  ruleArrow: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    paddingInline: vars["--ads-space-4"],
  },
  emptyRules: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  icon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  testerTextarea: {
    backgroundColor: vars["--ads-color-canvas"],
    minBlockSize: "5rem",
  },
  testerControls: {
    display: "grid",
    gap: vars["--ads-space-8"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  testerResult: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "grid",
    columnGap: vars["--ads-space-12"],
    rowGap: vars["--ads-space-4"],
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  testerKey: {
    color: vars["--ads-color-text-muted"],
    margin: 0,
  },
  testerValue: {
    color: vars["--ads-color-text"],
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  testerRoute: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
  },
  chipGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
});
