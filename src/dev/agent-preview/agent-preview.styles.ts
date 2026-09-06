import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Styles for the dev-only agent trace preview root. */
export const agentPreviewStyles = stylex.create({
  toggle: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    paddingBlock: vars.space4,
    paddingInline: 10,
  },
  toggleActive: {
    backgroundColor: vars.colorAccentSoft,
    borderColor: vars.colorAccent,
    color: vars.colorText,
  },
  column: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars.space12,
    minWidth: 0,
  },
  columnHeader: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
    paddingBottom: vars.space8,
  },
  columnTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  columnNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  columnBody: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    minWidth: 0,
    padding: vars.space16,
  },
  page: {
    backgroundColor: vars.colorCanvas,
    color: vars.colorText,
    minHeight: "100vh",
    padding: vars.space24,
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
    marginInline: "auto",
    maxWidth: 1500,
  },
  controlsRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space16,
  },
  heading: {
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
  },
  toggleGroup: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  fontLabel: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
  },
  fontValue: {
    color: vars.colorText,
    fontVariantNumeric: "tabular-nums",
  },
  columns: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space24,
    "@media (min-width: 64rem)": {
      flexDirection: "row",
    },
  },
});
