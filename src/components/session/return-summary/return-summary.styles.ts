import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

const oneLine = {
  margin: 0,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export const returnSummaryStyles = stylex.create({
  // In the conversation's flow, between what you had seen and what came after:
  // a surface on the transcript, not an overlay, so it carries no elevation.
  card: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    containerType: "inline-size",
    display: "flex",
    flexDirection: "column",
    marginBlock: vars["--aui-space-12"],
    overflow: "hidden",
  },
  header: {
    alignItems: "baseline",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    paddingBlockStart: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  headerIcon: {
    alignSelf: "center",
    blockSize: vars["--aui-control-icon-size-md"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  title: {
    color: vars["--aui-color-text"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-control"],
    margin: 0,
  },
  since: {
    ...oneLine,
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    margin: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: 0,
  },
  // Every row is one height: a title line and a detail line, each cut to one
  // line with the whole text on hover.
  row: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr) auto",
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-12"],
  },
  rowMark: {
    alignSelf: "start",
    blockSize: vars["--aui-line-height-control"],
  },
  rowIcon: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    inlineSize: vars["--aui-control-icon-size-md"],
    justifyContent: "center",
    ":is(*) svg": {
      blockSize: vars["--aui-control-icon-size-sm"],
      inlineSize: vars["--aui-control-icon-size-sm"],
    },
  },
  rowText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  rowTitle: {
    ...oneLine,
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-control"],
  },
  rowDetail: {
    ...oneLine,
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
  },
  // A long action label never takes more than its share of a narrow card.
  rowAction: {
    maxInlineSize: "40cqi",
  },
  footer: {
    alignItems: "center",
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  gotIt: {
    marginInlineStart: "auto",
  },
  // Folded: one line across the conversation where the card was.
  divider: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    marginBlock: vars["--aui-space-12"],
  },
  dividerRule: {
    backgroundColor: vars["--aui-color-border"],
    blockSize: vars["--aui-border-width-hairline"],
    flex: 1,
    minInlineSize: vars["--aui-space-16"],
  },
  // The divider's button is the line's label: muted, at its content width.
  dividerButton: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 1,
    maxInlineSize: "100%",
    minWidth: 0,
  },
  dividerTitle: {
    color: vars["--aui-color-text"],
    flexShrink: 0,
    fontWeight: vars["--aui-font-weight-medium"],
  },
  dividerMeta: {
    ...oneLine,
  },
});
