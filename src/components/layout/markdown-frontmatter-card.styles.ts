import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** Structured metadata card that stands in for raw YAML frontmatter. */
export const frontmatterStyles = stylex.create({
  card: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    marginBottom: vars.space20,
    overflow: "hidden",
  },
  header: {
    backgroundColor: vars.colorSurfaceTint,
    borderBottomColor: vars.colorBorderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.08em",
    paddingBlock: 6,
    paddingInline: vars.space12,
    textTransform: "uppercase",
  },
  // `divide-y` semantics: a hairline between rows, never above the first.
  row: {
    borderTopColor: vars.colorBorderSubtle,
    borderTopStyle: "solid",
    borderTopWidth: { default: vars.borderWidthHairline, ":first-child": 0 },
    display: "grid",
    gap: vars.space12,
    gridTemplateColumns: "minmax(5rem, 10rem) 1fr",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  key: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    overflowWrap: "anywhere",
  },
  value: { color: vars.colorText, minWidth: 0 },
  placeholder: { color: vars.colorTextSubtle },
  singleValue: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  valueList: { display: "flex", flexWrap: "wrap", gap: vars.space4 },
  chip: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    fontFamily: vars.fontMono,
    maxWidth: "100%",
    overflowWrap: "anywhere",
    paddingBlock: vars.space2,
    paddingInline: 6,
  },
});
