import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const entriesTabStyles = stylex.create({
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
  addButton: {
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
  buttonIcon: {
    width: 14,
    height: 14,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
});
