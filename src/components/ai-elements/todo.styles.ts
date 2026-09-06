import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const todoStyles = stylex.create({
  root: {
    overflow: "hidden",
    borderRadius: vars.radiusControl,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorSurface,
  },
  header: {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
    fontSize: "0.875em",
    fontWeight: vars.fontWeightSemibold,
  },
  headerOpen: {
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: vars.colorBorder,
  },
  headerLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  headerIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    color: vars.colorTextMuted,
  },
  headerCount: {
    marginLeft: vars.space2,
    fontSize: "0.75em",
    fontWeight: vars.fontWeightRegular,
    color: vars.colorTextMuted,
  },
  headerMeta: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space8,
  },
  chevron: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
  },
  chevronOpen: { transform: "rotate(180deg)" },
  body: {
    paddingInline: vars.space12,
    paddingBlock: vars.space8,
  },
  empty: { fontSize: "0.875em", color: vars.colorTextMuted },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space8,
  },
  itemIcon: {
    marginTop: vars.space2,
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    flexShrink: 0,
  },
  itemIconSuccess: { color: vars.colorSuccess },
  itemIconMuted: { color: `color-mix(in oklch, ${vars.colorTextMuted} 50%, transparent)` },
  itemIconLoader: {
    marginTop: vars.space2,
    color: vars.colorAccent,
  },
  itemText: {
    fontSize: "0.875em",
    lineHeight: "1.6",
  },
  itemTextCompleted: {
    color: vars.colorTextMuted,
    textDecorationLine: "line-through",
  },
  itemTextInProgress: {
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  itemTextInProgressFinalized: { color: vars.colorTextMuted },
  itemTextPending: { color: vars.colorTextMuted },
});
