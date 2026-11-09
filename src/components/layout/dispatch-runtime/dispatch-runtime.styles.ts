import * as stylex from "@stylexjs/stylex";

import { vars } from "../../aui/tokens/tokens.stylex";

/** Chrome shared by the dispatch target/runtime field groups. */
export const dispatchFieldStyles = stylex.create({
  section: { display: "grid", gap: vars["--aui-space-16"] },
  sectionHeading: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    margin: 0,
  },
  field: { display: "grid", gap: vars["--aui-space-8"] },
  fieldLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  hint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    margin: 0,
  },
  hintRelaxed: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    margin: 0,
  },
  hintDanger: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    margin: 0,
  },
  mono: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
  },
  monoPath: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  /** Bordered inline group: label block on the left, control on the right. */
  panelRow: {
    alignItems: "center",
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  panelRowTinted: {
    alignItems: "flex-start",
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  rowText: { minInlineSize: 0 },
  rowLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  rowDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    marginBlockEnd: 0,
    marginBlockStart: 2,
  },
  accordionPanel: {
    display: "grid",
    gap: vars["--aui-space-12"],
  },

  accessPair: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: "repeat(1, minmax(0, 1fr))",
      "@media (min-width: 40rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  optionIcon: { blockSize: 14, inlineSize: 14 },
});
