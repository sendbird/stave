import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const entryFormStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  fieldLabel: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  hint: {
    display: "block",
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  fieldError: {
    display: "block",
    fontSize: vars.fontSizeMicro,
    color: vars.colorDangerText,
  },
  commands: {
    minHeight: "7rem",
  },
  invalidControl: {
    borderColor: vars.colorDangerBorder,
  },
  triggerFull: {
    width: "100%",
  },
  switchRow: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
  },
  switchLabel: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorText,
  },
  advancedToggle: {
    height: 32,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeCaption,
  },
  advanced: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
    paddingTop: vars.space12,
  },
  idDisplayRow: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
  },
  idDisplay: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  idDisplaySet: {
    color: vars.colorText,
  },
  idDisplayEmpty: {
    color: vars.colorTextMuted,
  },
  idEditButton: {
    height: 32,
  },
  grid: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 1fr",
    },
  },
  toggleGroup: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space16,
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: vars.space12,
    paddingBlock: 10,
  },
});
