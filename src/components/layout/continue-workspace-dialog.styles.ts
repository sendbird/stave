import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const continueWorkspaceStyles = stylex.create({
  surface: {
    maxWidth: {
      default: "28rem",
      "@media (min-width: 40rem)": "36rem",
    },
  },
  form: {
    display: "grid",
    gap: vars.space16,
  },
  body: {
    display: "grid",
    gap: vars.space16,
  },
  summaryGrid: {
    display: "grid",
    gap: vars.space12,
    borderRadius: vars.radiusFrame,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    padding: vars.space16,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  summaryCell: {
    display: "grid",
    gap: 6,
    alignContent: "start",
  },
  eyebrow: {
    margin: 0,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: vars.colorTextMuted,
  },
  stack: {
    display: "grid",
    gap: vars.space8,
    justifyItems: "start",
  },
  badge: {
    justifyContent: "flex-start",
  },
  branchIcon: {
    width: 14,
    height: 14,
    color: vars.colorTextMuted,
  },
  truncated: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  caption: {
    margin: 0,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  cellHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space8,
  },
  changeButton: {
    height: 24,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
      ":active": vars.colorText,
    },
  },
  pickerPanel: {
    display: "grid",
    gap: vars.space8,
    borderRadius: vars.radiusFrame,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    padding: vars.space12,
  },
  fieldBlock: {
    display: "grid",
    gap: vars.space8,
  },
  fieldLabel: {
    margin: 0,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  nameInput: {
    height: 40,
    borderRadius: vars.radiusMark,
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
  },
  error: {
    margin: 0,
    fontSize: vars.fontSizeBody,
    color: vars.colorDangerText,
  },
  submitLoader: {
    marginInlineEnd: vars.space8,
  },
});
