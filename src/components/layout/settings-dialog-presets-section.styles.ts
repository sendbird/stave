import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Preset bar toggle + preset manager list inside their settings cards. */
export const presetsSectionStyles = stylex.create({
  shortcutNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
  },
  emphasis: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  addButton: {
    gap: vars["--ads-space-8"],
  },
  addIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  editorPopover: {
    inlineSize: "20rem",
  },
  restoreRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  empty: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "dashed",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-16"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
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
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-12"],
    minBlockSize: vars["--ads-space-48"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  rowMain: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars["--ads-space-12"],
    minInlineSize: 0,
  },
  mark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    blockSize: vars["--ads-control-height"],
    justifyContent: "center",
    position: "relative",
    inlineSize: vars["--ads-control-height"],
  },
  markIcon: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  cliBadge: {
    backgroundColor: vars["--ads-color-canvas"],
    borderRadius: vars["--ads-radius-mark"],
    bottom: -4,
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-space-12"],
    position: "absolute",
    right: -4,
    inlineSize: vars["--ads-space-12"],
  },
  rowBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  rowHead: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  rowLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-control"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shortcutChip: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    blockSize: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-8"],
  },
  rowMeta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
  },
  deleteButton: {
    color: {
      default: vars["--ads-color-danger-text"],
      ":hover": vars["--ads-color-danger-text"],
    },
  },
});
