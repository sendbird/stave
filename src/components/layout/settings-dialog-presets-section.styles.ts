import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Preset bar toggle + preset manager list inside their settings cards. */
export const presetsSectionStyles = stylex.create({
  shortcutNote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
  },
  emphasis: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  addButton: {
    gap: vars["--aui-space-8"],
  },
  addIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  editorPopover: {
    inlineSize: "20rem",
  },
  restoreRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  empty: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    paddingBlock: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-16"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  /*
   * One row shape for every preset kind (model preset or CLI preset): a fixed
   * `controlHeight` icon column, a name + meta stack, and trailing `xs` icon
   * buttons — all centred on a single 48px row, which is the Settings rhythm
   * (`space24` card padding, `space20`/`space8` field gaps) two rungs up from
   * the `xs` controls it contains.
   *
   * Previously the row stacked into a column below 1280px, aligned its main
   * cluster to `start` while the actions centred, and let four labelled outline
   * buttons wrap — so the icon, the name, the meta line, and the actions each
   * sat on a different baseline.
   */
  row: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-12"],
    minBlockSize: vars["--aui-space-48"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  rowMain: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  mark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--aui-control-height"],
    justifyContent: "center",
    position: "relative",
    inlineSize: vars["--aui-control-height"],
  },
  markIcon: {
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  cliBadge: {
    backgroundColor: vars["--aui-color-canvas"],
    borderRadius: vars["--aui-radius-mark"],
    bottom: -4,
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-space-12"],
    position: "absolute",
    right: -4,
    inlineSize: vars["--aui-space-12"],
  },
  rowBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  rowHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  rowLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-control"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shortcutChip: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-micro"],
    blockSize: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-8"],
  },
  rowMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    overflowWrap: "anywhere",
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
  },
  deleteButton: {
    color: {
      default: vars["--aui-color-danger-text"],
      ":hover": vars["--aui-color-danger-text"],
    },
  },
});
