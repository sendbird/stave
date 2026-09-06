import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const targetsTabStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars.space12,
  },
  headerText: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: vars.space4,
  },
  title: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    color: vars.colorText,
  },
  description: {
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  mono: {
    fontFamily: vars.fontMono,
  },
  addButton: {
    gap: vars.space4,
  },
  buttonIcon: {
    width: 14,
    height: 14,
  },
  overrideRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space4,
  },
  overrideLabel: {
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  overrideButton: {
    height: 28,
    gap: vars.space4,
  },
  emptyState: {
    borderWidth: vars.borderWidthHairline,
    borderStyle: "dashed",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
  },
  emptyIcon: {
    width: 16,
    height: 16,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurface,
    padding: vars.space12,
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars.space8,
  },
  cardHeaderTitle: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars.space8,
  },
  cardTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  usageBadge: {
    borderRadius: vars.radiusMark,
    paddingInline: vars.space8,
    paddingBlock: 0,
    fontSize: vars.fontSizeMicro,
  },
  deleteButton: {
    width: 32,
    height: 32,
    color: {
      default: vars.colorDangerText,
      ":hover": vars.colorDangerText,
    },
  },
  fieldGrid: {
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 1fr",
    },
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
  monoInput: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },
  hint: {
    display: "block",
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  triggerFull: {
    width: "100%",
  },
  injectedBox: {
    borderRadius: vars.radiusPanel,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurfaceTint,
    paddingInline: vars.space12,
    paddingBlock: 10,
  },
  injectedTitle: {
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  injectedDescription: {
    marginTop: vars.space4,
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  injectedList: {
    marginTop: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space4,
  },
  varBadge: {
    borderRadius: vars.radiusMark,
    paddingInline: vars.space8,
    paddingBlock: 0,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeMicro,
  },
  footnote: {
    fontSize: vars.fontSizeMicro,
    color: vars.colorTextMuted,
  },
  emphasis: {
    fontWeight: vars.fontWeightMedium,
  },
});
