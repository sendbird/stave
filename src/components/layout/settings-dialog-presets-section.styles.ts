import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Preset bar toggle + preset manager list inside their settings cards. */
export const presetsSectionStyles = stylex.create({
  shortcutNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  emphasis: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  addButton: {
    gap: vars.space8,
  },
  addIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  editorPopover: {
    inlineSize: "20rem",
  },
  restoreRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  empty: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    paddingBlock: vars.space20,
    paddingInline: vars.space16,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
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
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    minBlockSize: vars.space48,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  rowMain: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars.space12,
    minInlineSize: 0,
  },
  mark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    blockSize: vars.controlHeight,
    justifyContent: "center",
    position: "relative",
    inlineSize: vars.controlHeight,
  },
  markIcon: {
    color: vars.colorTextMuted,
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  cliBadge: {
    backgroundColor: vars.colorCanvas,
    borderRadius: vars.radiusMark,
    bottom: -4,
    color: vars.colorTextMuted,
    blockSize: vars.space12,
    position: "absolute",
    right: -4,
    inlineSize: vars.space12,
  },
  rowBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minInlineSize: 0,
  },
  rowHead: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  rowLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightControl,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shortcutChip: {
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    blockSize: vars.space20,
    paddingInline: vars.space8,
  },
  rowMeta: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space4,
  },
  deleteButton: {
    color: {
      default: vars.colorDangerText,
      ":hover": vars.colorDangerText,
    },
  },
});
