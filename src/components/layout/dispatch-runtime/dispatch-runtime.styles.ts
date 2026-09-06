import * as stylex from "@stylexjs/stylex";

import { vars } from "../../ads/tokens/tokens.stylex";

/** Chrome shared by the dispatch target/runtime field groups. */
export const dispatchFieldStyles = stylex.create({
  section: { display: "grid", gap: vars.space16 },
  sectionHeading: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    margin: 0,
  },
  field: { display: "grid", gap: vars.space8 },
  fieldLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  hint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
    margin: 0,
  },
  hintRelaxed: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    margin: 0,
  },
  hintDanger: {
    color: vars.colorDangerText,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    margin: 0,
  },
  mono: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: 11,
    margin: 0,
  },
  monoPath: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: 11,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  /** Bordered inline group: label block on the left, control on the right. */
  panelRow: {
    alignItems: "center",
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    justifyContent: "space-between",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  panelRowTinted: {
    alignItems: "flex-start",
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  rowText: { minInlineSize: 0 },
  rowLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  rowDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginBlockEnd: 0,
    marginBlockStart: 2,
  },
  switchRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  switchRowStart: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  switchLabel: { fontSize: vars.fontSizeBody },
  advisorDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginBlockEnd: 0,
    marginBlockStart: vars.space4,
  },

  accordion: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingInline: vars.space12,
  },
  accordionTrigger: { paddingBlock: vars.space12 },
  accordionPanel: {
    display: "grid",
    gap: vars.space12,
    paddingBlockEnd: vars.space12,
  },

  accessPair: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: "repeat(1, minmax(0, 1fr))",
      "@media (min-width: 40rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  optionIcon: { blockSize: 14, inlineSize: 14 },
  optionRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  optionLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
