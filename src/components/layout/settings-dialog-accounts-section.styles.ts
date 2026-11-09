import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Settings > Accounts. Rows follow the Settings rhythm in
 * `settings-dialog.shared.styles.ts`: flat rows ruled by hairlines inside a
 * card, body text at `fontSizeBody`, meta at `fontSizeCaption`.
 */
export const accountsSectionStyles = stylex.create({
  list: {
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  row: {
    alignItems: "start",
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--aui-border-width-hairline"],
      ":first-child": vars["--aui-space-0"],
    },
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    paddingBlock: vars["--aui-space-12"],
    rowGap: vars["--aui-space-8"],
  },
  rowMark: {
    alignItems: "center",
    blockSize: vars["--aui-line-height-control"],
    display: "flex",
    flexShrink: 0,
  },
  rowIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  iconDone: { color: vars["--aui-color-success-text"] },
  iconTodo: { color: vars["--aui-color-text-muted"] },
  iconQuiet: { color: vars["--aui-color-text-subtle"] },
  rowText: {
    display: "flex",
    flexBasis: 240,
    flexDirection: "column",
    flexGrow: 1,
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  rowTitleLine: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    lineHeight: vars["--aui-line-height-control"],
  },
  rowTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  rowTitleSettled: {
    color: vars["--aui-color-text-muted"],
  },
  rowDetail: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    overflowWrap: "anywhere",
  },
  /** A signed-in CLI's reason it has no provider tab (no usable allowance). */
  rowDetailWarning: {
    color: vars["--aui-color-warning-text"],
  },
  /** An installed CLI's path disclosure, on its own line under the row. */
  rowPath: {
    flexBasis: "100%",
    minInlineSize: 0,
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  summary: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-8"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
  },
  mono: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  /** CLI path field for a CLI that was not found; same size as the provider tabs' path fields. */
  pathInput: {
    blockSize: vars["--aui-control-height-lg"],
  },
  help: {
    alignItems: "center",
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-24"],
  },
  /** Welcome-screen form of the checklist: no card, compact rows. */
  welcome: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  welcomeHeader: {
    alignItems: "center",
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: vars["--aui-space-8"],
  },
  welcomeTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    margin: 0,
  },
  welcomeSteps: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  welcomeStep: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    columnGap: vars["--aui-space-8"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
  },
  welcomeStepTodo: {
    color: vars["--aui-color-text"],
  },
  welcomeIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
});
