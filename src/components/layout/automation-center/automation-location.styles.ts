import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const locationStyles = stylex.create({
  fields: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
  },
  field: { display: "grid", gap: 6, minInlineSize: 0 },
  picker: { inlineSize: "100%" },
  summary: {
    columnGap: vars["--ads-space-12"],
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    margin: 0,
    rowGap: vars["--ads-space-4"],
  },
  term: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "16px",
  },
  value: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "16px",
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  mono: { fontFamily: vars["--ads-font-mono"] },
  noticeActions: { display: "flex", flexWrap: "wrap", gap: vars["--ads-space-8"] },
});
