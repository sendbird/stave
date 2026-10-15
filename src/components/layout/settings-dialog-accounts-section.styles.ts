import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

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
    borderTopColor: vars["--ads-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--ads-border-width-hairline"],
      ":first-child": vars["--ads-space-0"],
    },
    columnGap: vars["--ads-space-12"],
    display: "flex",
    flexWrap: "wrap",
    paddingBlock: vars["--ads-space-12"],
    rowGap: vars["--ads-space-8"],
  },
  rowMark: {
    alignItems: "center",
    blockSize: vars["--ads-line-height-control"],
    display: "flex",
    flexShrink: 0,
  },
  rowIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  iconDone: { color: vars["--ads-color-success-text"] },
  iconTodo: { color: vars["--ads-color-text-muted"] },
  iconQuiet: { color: vars["--ads-color-text-subtle"] },
  rowText: {
    display: "flex",
    flexBasis: 240,
    flexDirection: "column",
    flexGrow: 1,
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  rowTitleLine: {
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    lineHeight: vars["--ads-line-height-control"],
  },
  rowTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  rowTitleSettled: {
    color: vars["--ads-color-text-muted"],
  },
  rowDetail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    overflowWrap: "anywhere",
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  summary: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
  },
  mono: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  help: {
    alignItems: "center",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-24"],
  },
  /** Welcome-screen form of the checklist: no card, compact rows. */
  welcome: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  welcomeHeader: {
    alignItems: "center",
    columnGap: vars["--ads-space-12"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: vars["--ads-space-8"],
  },
  welcomeTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    margin: 0,
  },
  welcomeSteps: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  welcomeStep: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    columnGap: vars["--ads-space-8"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
  },
  welcomeStepTodo: {
    color: vars["--ads-color-text"],
  },
  welcomeIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
});
